// JWT authentication middleware
import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { verifyTokenFull } from "../lib/auth.ts";
import { isTokenValid } from "../lib/token-store.ts";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";

export const authMiddleware = createMiddleware(async (c, next) => {
        const authHeader = c.req.header("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
                return c.json({ error: { message: "Sign in required.", code: 401 } }, 401);
        }

        // Verify and decode the JWT
        const token = authHeader.slice(7);
        const payload = await verifyTokenFull(token);
        if (!payload) {
                return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
        }

        // Check if token has been revoked
        if (payload.jti && !isTokenValid(payload.jti, payload.userId)) {
                return c.json({ error: { message: "Session revoked.", code: 401 } }, 401);
        }

        // Verify the user account is still active
        const user = db.select({ isDeleted: users.isDeleted, isDisabled: users.isDisabled })
                .from(users)
                .where(eq(users.id, payload.userId))
                .get();
        if (!user || user.isDeleted || user.isDisabled) {
                return c.json({ error: { message: "Account is disabled.", code: 401 } }, 401);
        }

        c.set("user", {
                userId: payload.userId,
                email: payload.email,
                roles: payload.roles,
                isAdmin: payload.roles.includes("admin"),
        });
        await next();
});
