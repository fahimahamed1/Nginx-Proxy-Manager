// Access list management routes
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, now } from "../db/index.ts";
import { accessListAuth, accessLists, proxyHosts } from "../db/schema.ts";
import { DATA_DIR } from "../env.ts";
import type { AppEnv, UserPayload } from "../lib/types.ts";
import { addAuditLog, logger } from "../lib/utils.ts";
import { rbacMiddleware } from "../middleware/rbac.ts";
import { buildHtpasswd } from "../services/access-list.ts";
import { configureHost } from "../services/nginx.ts";
import fs from "node:fs";
import path from "node:path";

export const accessListRoutes = new Hono<AppEnv>();

const createSchema = z.object({
        name: z.string().min(1),
        items: z
                .array(
                        z.object({
                                username: z.string().min(1),
                                password: z.string().min(1),
                        }),
                )
                .default([]),
});

const updateSchema = z.object({
        name: z.string().min(1).optional(),
        items: z
                .array(
                        z.object({
                                username: z.string().min(1),
                                password: z.string().min(1),
                        }),
                )
                .optional(),
});

// Format a list row into an API response object
function formatList(row: Record<string, unknown>) {
        return {
                id: row.id,
                name: row.name,
                ownerUserId: row.ownerUserId,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
        };
}

// GET / — list all access lists with their auth items
accessListRoutes.get("/", async (c) => {
        const user = c.get("user") as UserPayload;
        const offset = Number.parseInt(c.req.query("offset") || "0");
        const limit = Math.min(Number.parseInt(c.req.query("limit") || "50"), 200);
        let where = and(eq(accessLists.isDeleted, 0));
        if (!user.isAdmin) where = and(where, eq(accessLists.ownerUserId, user.userId));
        const items = db
                .select()
                .from(accessLists)
                .where(where)
                .orderBy(desc(accessLists.id))
                .limit(limit)
                .offset(offset)
                .all();

        // Batch fetch all auth items to avoid N+1 queries
        const allIds = items.map((row) => row.id);
        const allAuthItems = allIds.length > 0
                ? db.select().from(accessListAuth).where(inArray(accessListAuth.accessListId, allIds)).all()
                : [];
        const authItemsByListId = new Map<number, typeof allAuthItems>();
        for (const item of allAuthItems) {
                const listId = item.accessListId;
                if (!authItemsByListId.has(listId)) authItemsByListId.set(listId, []);
                authItemsByListId.get(listId)!.push(item);
        }

        const enriched = items.map((row) => {
                const authItems = authItemsByListId.get(row.id) || [];
                return {
                        ...formatList(row),
                        items: authItems.map((a) => ({ id: a.id, username: a.username, password: a.password ? "••••••••" : "" })),
                };
        });
        const [{ total }] = db
                .select({ total: sql<number>`count(*)` })
                .from(accessLists)
                .where(where)
                .all();
        return c.json({ items: enriched, total: Number(total), offset, limit });
});

// GET /:id — get a single access list with auth items
accessListRoutes.get("/:id", async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const list = db
                .select()
                .from(accessLists)
                .where(and(eq(accessLists.id, id), eq(accessLists.isDeleted, 0)))
                .get();
        if (!list) return c.json({ error: { message: "Access list not found.", code: 404 } }, 404);
        const authItems = db.select().from(accessListAuth).where(eq(accessListAuth.accessListId, id)).all();
        return c.json({
                ...formatList(list),
                items: authItems.map((a) => ({ id: a.id, username: a.username, password: a.password ? "••••••••" : "" })),
        });
});

// POST / — create a new access list with username/password entries
accessListRoutes.post("/", rbacMiddleware("accessLists", "manage"), zValidator("json", createSchema), async (c) => {
        const data = c.req.valid("json");
        const user = c.get("user") as UserPayload;
        const ts = now();

        const list = db
                .insert(accessLists)
                .values({
                        name: data.name,
                        isDeleted: 0,
                        ownerUserId: user.userId,
                        createdAt: ts,
                        updatedAt: ts,
                } as any)
                .returning()
                .get();
        if (!list) return c.json({ error: { message: "Failed to create access list.", code: 500 } }, 500);

        for (const item of data.items) {
                db.insert(accessListAuth)
                        .values({
                                accessListId: list.id,
                                username: item.username,
                                password: item.password,
                                createdAt: ts,
                        })
                        .run();
        }

        buildHtpasswd(list.id);
        addAuditLog(user.userId, "create", "access_list", list.id);
        logger.info(`Access list created: ${data.name}`);
        return c.json(formatList(list), 201);
});

// PUT /:id — update an access list and rebuild its htpasswd file
accessListRoutes.put("/:id", rbacMiddleware("accessLists", "manage"), zValidator("json", updateSchema), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const data = c.req.valid("json");
        const user = c.get("user") as UserPayload;
        const existing = db
                .select()
                .from(accessLists)
                .where(and(eq(accessLists.id, id), eq(accessLists.isDeleted, 0)))
                .get();
        if (!existing) return c.json({ error: { message: "Access list not found.", code: 404 } }, 404);

        const updates: Record<string, unknown> = { updatedAt: now() };
        if (data.name !== undefined) updates.name = data.name;
        db.update(accessLists).set(updates).where(eq(accessLists.id, id)).run();

        if (data.items) {
                // Replace all auth items
                db.delete(accessListAuth).where(eq(accessListAuth.accessListId, id)).run();
                for (const item of data.items) {
                        db.insert(accessListAuth)
                                .values({
                                        accessListId: id,
                                        username: item.username,
                                        password: item.password,
                                        createdAt: now(),
                                })
                                .run();
                }
        }

        buildHtpasswd(id);
        addAuditLog(user.userId, "update", "access_list", id);

        const updated = db.select().from(accessLists).where(eq(accessLists.id, id)).get();
        return c.json(formatList(updated!));
});

// DELETE /:id — soft-delete an access list, unlink hosts, and clean up htpasswd
accessListRoutes.delete("/:id", rbacMiddleware("accessLists", "manage"), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const user = c.get("user") as UserPayload;
        const existing = db
                .select()
                .from(accessLists)
                .where(and(eq(accessLists.id, id), eq(accessLists.isDeleted, 0)))
                .get();
        if (!existing) return c.json({ error: { message: "Access list not found.", code: 404 } }, 404);

        // Unlink all proxy hosts using this access list
        const affectedHosts = db.select().from(proxyHosts).where(and(eq(proxyHosts.accessListId, id), eq(proxyHosts.isDeleted, 0))).all();
        for (const host of affectedHosts) {
                db.update(proxyHosts)
                        .set({ accessListId: 0, updatedAt: now() } as any)
                        .where(eq(proxyHosts.id, host.id))
                        .run();
                host.accessListId = 0;
        }

        db.update(accessLists)
                .set({ isDeleted: 1, updatedAt: now() } as any)
                .where(eq(accessLists.id, id))
                .run();

        // Remove htpasswd file
        const htpasswdPath = path.join(DATA_DIR, "access", `${id}.htpasswd`);
        try {
                fs.unlinkSync(htpasswdPath);
        } catch (err) {
                logger.error("Failed to delete htpasswd file:", err);
        }

        // Reconfigure affected proxy hosts to pick up the removed access list
        for (const host of affectedHosts) {
                if (host.enabled) {
                        try {
                                await configureHost("proxy_host", host);
                        } catch (err) {
                                logger.error("Failed to reconfigure proxy host:", err);
                        }
                }
        }

        addAuditLog(user.userId, "delete", "access_list", id);
        return c.json({ success: true });
});
