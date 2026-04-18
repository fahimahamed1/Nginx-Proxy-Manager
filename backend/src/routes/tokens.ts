// Token (session) management routes
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { verifyTokenFull } from "../lib/auth.ts";
import {
	getUserTokens,
	revokeAllUserTokens,
	revokeToken,
	storeToken,
	tokenStore,
	touchToken,
	type TokenEntry,
} from "../lib/token-store.ts";
import { addAuditLog, getClientIp, getBearerToken, logger } from "../lib/utils.ts";
import type { AppEnv, UserPayload } from "../lib/types.ts";
import { TOKEN_TTL_MS } from "../lib/constants.ts";

export const tokenRoutes = new Hono<AppEnv>();

interface SessionInfo {
	id: string;
	userId: number;
	userName?: string;
	userAgent: string;
	ipAddress: string;
	createdAt: string;
	lastUsed: string;
	isCurrent: boolean;
}

// Enrich a token entry with user details for the API response
async function enrichToken(
	jti: string,
	entry: TokenEntry & { userAgent?: string; ipAddress?: string; lastUsed?: string },
	currentJti: string,
): Promise<SessionInfo> {
	const user = db.select().from(users).where(eq(users.id, entry.userId)).get();
	return {
		id: jti,
		userId: entry.userId,
		userName: user ? (user as any).name : undefined,
		userAgent: entry.userAgent || "",
		ipAddress: entry.ipAddress || "",
		createdAt: entry.createdAt,
		lastUsed: entry.lastUsed || entry.createdAt,
		isCurrent: jti === currentJti,
	};
}

// GET / — list all active sessions for the current user
tokenRoutes.get("/", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}

	const currentJti = payload.jti;
	const tokens = getUserTokens(payload.userId);
	touchToken(currentJti);
	const sessions: SessionInfo[] = await Promise.all(
		tokens.map(async (t) => enrichToken(t.jti, { userId: payload.userId, expiresAt: t.expiresAt, createdAt: t.createdAt, userAgent: t.userAgent, ipAddress: t.ipAddress, lastUsed: t.lastUsed }, currentJti)),
	);

	return c.json({ items: sessions });
});

// DELETE /:id — revoke a specific session (cannot revoke the current one)
tokenRoutes.delete("/:id", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}

	const jti = c.req.param("id");
	const entry = tokenStore.get(jti);
	if (!entry || entry.userId !== payload.userId) {
		return c.json({ error: { message: "Session not found.", code: 404 } }, 404);
	}

	// Cannot revoke the current token
	if (jti === payload.jti) {
		return c.json({ error: { message: "You cannot revoke your current session.", code: 400 } }, 400);
	}

	revokeToken(jti);
	addAuditLog(payload.userId, "revoke_token", "user", payload.userId, { jti });
	logger.info(`Token revoked: ${jti} by user #${payload.userId}`);
	return c.json({ success: true });
});

// POST /revoke-others — revoke all sessions except the current one
tokenRoutes.post("/revoke-others", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}

	const currentJti = payload.jti;
	const count = revokeAllUserTokens(payload.userId);

	// Keep the current token so the user stays logged in
	if (currentJti) {
		const existing = tokenStore.get(currentJti);
		storeToken(currentJti, payload.userId, Date.now() + TOKEN_TTL_MS, existing?.userAgent || "", existing?.ipAddress || "");
	}

	addAuditLog(payload.userId, "revoke_all_tokens", "user", payload.userId, { revokedCount: count - 1 });
	logger.info(`All other tokens revoked for user #${payload.userId} (${count - 1} sessions)`);
	return c.json({ success: true, revokedCount: count - 1 });
});
