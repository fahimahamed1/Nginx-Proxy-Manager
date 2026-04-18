// Role-based access control middleware
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/index.ts";
import { userPermissions } from "../db/schema.ts";
import type { AppEnv } from "../lib/types.ts";

export function rbacMiddleware(
	resource: "proxyHosts" | "proxy_hosts" | "redirectionHosts" | "deadHosts" | "streams" | "accessLists" | "certificates" | "users",
	requiredLevel: "manage" | "view" = "view",
) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const user = c.get("user");
		if (!user) return c.json({ error: { message: "Sign in required.", code: 401 } }, 401 as const);
		if (user.isAdmin) return await next();

		const perm = db.select().from(userPermissions).where(eq(userPermissions.userId, user.userId)).get();
		if (!perm) return c.json({ error: { message: "No permissions configured.", code: 403 } }, 403 as const);

		const level = String((perm as Record<string, unknown>)[resource]);
		if (level !== "manage" && (requiredLevel === "manage" || level !== "view")) {
			return c.json({ error: { message: "Access denied.", code: 403 } }, 403 as const);
		}
		await next();
	});
}
