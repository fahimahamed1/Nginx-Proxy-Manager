// Generic CRUD route factory for host resources
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, now } from "../db/index.ts";
import { eq, and, desc, sql, like } from "drizzle-orm";
import { rbacMiddleware } from "../middleware/rbac.ts";
import { configureHost, deleteConfig } from "../services/nginx.ts";
import { logger, toBool, addAuditLog, escapeLike } from "../lib/utils.ts";
import type { AppEnv, UserPayload } from "../lib/types.ts";

interface CrudConfig<T = Record<string, unknown>> {
        table: any;
        hostType: string;
        rbacResource: "proxyHosts" | "redirectionHosts" | "deadHosts" | "streams" | "accessLists" | "certificates" | "users";
        createSchema: z.ZodObject<any>;
        toInsertValues: (data: T, userId: number, ts: string) => Record<string, unknown>;
        toUpdateValues: (data: Partial<T>, ts: string) => Record<string, unknown>;
        format: (row: Record<string, unknown>) => unknown;
        beforeCreate?: (data: T, excludeId?: number) => string | null;
        beforeUpdate?: (id: number, data: Partial<T>) => string | null;
        searchField?: any;
        orderBy?: any;
        onUpdateNginx?: (host: Record<string, unknown>, wasEnabled: boolean, data: Partial<T>) => Promise<void>;
}

export function createCrudRoutes<T>(cfg: CrudConfig<T>): Hono<AppEnv> {
        const router = new Hono<AppEnv>();
        const tbl = cfg.table;
        const hasSearch = !!cfg.searchField;

        // List items with pagination and optional search
        router.get("/", async (c) => {
                const user = c.get("user") as UserPayload;
                const offset = Number.parseInt(c.req.query("offset") || "0") || 0;
                const limit = Math.min(Number.parseInt(c.req.query("limit") || "50") || 50, 200);
                const search = c.req.query("search");

                let where = and(eq(tbl.isDeleted, 0));
                if (search && hasSearch) where = and(where, like(cfg.searchField!, `%${escapeLike(search)}%`));
                if (!user.isAdmin) where = and(where, eq(tbl.ownerUserId, user.userId));

                const orderClause = cfg.orderBy || desc(tbl.id);
                const items = db.select().from(tbl).where(where).orderBy(orderClause).limit(limit).offset(offset).all();
                const [{ total }] = db.select({ total: sql<number>`count(*)` }).from(tbl).where(where).all();

                return c.json({ items: items.map(r => cfg.format(r as Record<string, unknown>)), total: Number(total), offset, limit });
        });

        // Get single item by ID
        router.get("/:id", async (c) => {
                const id = Number.parseInt(c.req.param("id"));
                const row = db.select().from(tbl).where(and(eq(tbl.id, id), eq(tbl.isDeleted, 0))).get();
                if (!row) return c.json({ error: { message: "Item not found.", code: 404 } }, 404);
                return c.json(cfg.format(row as Record<string, unknown>));
        });

        // Create new item
        router.post("/", rbacMiddleware(cfg.rbacResource, "manage"), zValidator("json", cfg.createSchema), async (c) => {
                const data = c.req.valid("json") as T;
                const user = c.get("user") as UserPayload;
                const ts = now();

                const err = cfg.beforeCreate?.(data);
                if (err) return c.json({ error: { message: err, code: 409 } }, 409);

                const host = db.insert(tbl).values(cfg.toInsertValues(data, user.userId, ts)).returning().get();
                if (!host) return c.json({ error: { message: "Failed to create item.", code: 500 } }, 500);

                addAuditLog(user.userId, "create", cfg.hostType, host.id as number);
                try {
                        if (host.enabled) await configureHost(cfg.hostType, host as Record<string, unknown>);
                } catch (err) {
                        logger.error(`Nginx config failed for ${cfg.hostType} #${host.id}:`, err);
                }
                logger.info(`${cfg.hostType} created: #${host.id}`);

                return c.json(cfg.format(host as Record<string, unknown>), 201);
        });

        // Update existing item
        router.put("/:id", rbacMiddleware(cfg.rbacResource, "manage"), zValidator("json", cfg.createSchema.partial()), async (c) => {
                const id = Number.parseInt(c.req.param("id"));
                const data = c.req.valid("json") as Partial<T>;
                const user = c.get("user") as UserPayload;

                const existing = db.select().from(tbl).where(and(eq(tbl.id, id), eq(tbl.isDeleted, 0))).get();
                if (!existing) return c.json({ error: { message: "Item not found.", code: 404 } }, 404);

                const err = cfg.beforeUpdate?.(id, data);
                if (err) return c.json({ error: { message: err, code: 409 } }, 409);

                db.update(tbl).set(cfg.toUpdateValues(data, now())).where(eq(tbl.id, id)).run();
                addAuditLog(user.userId, "update", cfg.hostType, id);

                const updated = db.select().from(tbl).where(eq(tbl.id, id)).get();
                try {
                        if (cfg.onUpdateNginx) {
                                await cfg.onUpdateNginx(updated as Record<string, unknown>, toBool(existing.enabled), data);
                        } else {
                                if (updated.enabled) await configureHost(cfg.hostType, updated as Record<string, unknown>);
                                else await deleteConfig(cfg.hostType, id);
                        }
                } catch (err) {
                        logger.error(`Nginx config failed for ${cfg.hostType} #${id}:`, err);
                }

                return c.json(cfg.format(updated as Record<string, unknown>));
        });

        // Soft-delete item
        router.delete("/:id", rbacMiddleware(cfg.rbacResource, "manage"), async (c) => {
                const id = Number.parseInt(c.req.param("id"));
                const user = c.get("user") as UserPayload;
                const existing = db.select().from(tbl).where(and(eq(tbl.id, id), eq(tbl.isDeleted, 0))).get();
                if (!existing) return c.json({ error: { message: "Item not found.", code: 404 } }, 404);

                db.update(tbl).set({ isDeleted: 1, updatedAt: now() }).where(eq(tbl.id, id)).run();
                try { await deleteConfig(cfg.hostType, id); } catch (err) { logger.error(`Nginx config deletion failed for ${cfg.hostType} #${id}:`, err); }
                addAuditLog(user.userId, "delete", cfg.hostType, id);
                logger.info(`${cfg.hostType} deleted: #${id}`);
                return c.json({ success: true });
        });

        // Enable item
        router.post("/:id/enable", rbacMiddleware(cfg.rbacResource, "manage"), async (c) => {
                const id = Number.parseInt(c.req.param("id"));
                const user = c.get("user") as UserPayload;
                const existing = db.select().from(tbl).where(and(eq(tbl.id, id), eq(tbl.isDeleted, 0))).get();
                if (!existing) return c.json({ error: { message: "Item not found.", code: 404 } }, 404);

                db.update(tbl).set({ enabled: 1, updatedAt: now() }).where(eq(tbl.id, id)).run();
                const host = db.select().from(tbl).where(eq(tbl.id, id)).get();
                try {
                        if (host) await configureHost(cfg.hostType, host as Record<string, unknown>);
                } catch (err) {
                        logger.error(`Nginx config failed for ${cfg.hostType} #${id}:`, err);
                }
                addAuditLog(user.userId, "enable", cfg.hostType, id);
                return c.json({ success: true });
        });

        // Disable item
        router.post("/:id/disable", rbacMiddleware(cfg.rbacResource, "manage"), async (c) => {
                const id = Number.parseInt(c.req.param("id"));
                const user = c.get("user") as UserPayload;
                const existing = db.select().from(tbl).where(and(eq(tbl.id, id), eq(tbl.isDeleted, 0))).get();
                if (!existing) return c.json({ error: { message: "Item not found.", code: 404 } }, 404);

                db.update(tbl).set({ enabled: 0, updatedAt: now() }).where(eq(tbl.id, id)).run();
                try { await deleteConfig(cfg.hostType, id); } catch (err) { logger.error(`Nginx config deletion failed for ${cfg.hostType} #${id}:`, err); }
                addAuditLog(user.userId, "disable", cfg.hostType, id);
                return c.json({ success: true });
        });

        return router;
}
