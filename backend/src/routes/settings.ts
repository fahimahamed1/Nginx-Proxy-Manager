// Application settings routes
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.ts";
import { settings } from "../db/schema.ts";
import type { AppEnv, UserPayload } from "../lib/types.ts";
import { addAuditLog, logger } from "../lib/utils.ts";
import { rbacMiddleware } from "../middleware/rbac.ts";
import { generateDefaultConfig } from "../services/nginx.ts";

export const settingRoutes = new Hono<AppEnv>();

// GET / — list all settings
settingRoutes.get("/", async (c) => {
	const items = db.select().from(settings).all();
	return c.json({ items });
});

// GET /:id — get a single setting by ID
settingRoutes.get("/:id", async (c) => {
	const id = c.req.param("id");
	const setting = db.select().from(settings).where(eq(settings.id, id)).get();
	if (!setting) return c.json({ error: { message: "Not found.", code: 404 } }, 404);
	return c.json(setting);
});

// PUT /:id — create or update a setting (upsert)
settingRoutes.put(
	"/:id",
	rbacMiddleware("users", "manage"),
	zValidator(
		"json",
		z.object({
			value: z.string(),
			meta: z.record(z.unknown()).optional(),
		}),
	),
	async (c) => {
		const id = c.req.param("id");
		const { value, meta } = c.req.valid("json");
		const user = (c.get("user") as UserPayload) || { userId: 0 };
		const metaStr = meta ? JSON.stringify(meta) : "{}";

		const existing = db.select().from(settings).where(eq(settings.id, id)).get();
		if (existing) {
			db.update(settings)
				.set({ value, meta: metaStr } as any)
				.where(eq(settings.id, id))
				.run();
		} else {
			db.insert(settings)
				.values({ id, name: id, description: `Setting: ${id}`, value, meta: metaStr } as any)
				.run();
		}

		addAuditLog(user.userId || 0, "update", "setting", 0, { id, value });
		logger.info(`Setting updated: ${id} = ${value}`);

		// Regenerate default nginx config when default site setting changes
		if (id === "default_site" || id === "default-site") {
			try {
				await generateDefaultConfig(value, meta);
			} catch (err) {
				logger.error("Failed to regenerate default config:", err);
			}
		}

		return c.json({ id, value, meta: JSON.parse(metaStr), success: true });
	},
);
