// Authentication routes
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, now } from "../db/index.ts";
import { auth, userPermissions, users } from "../db/schema.ts";
import { createToken, decodeJti, hashPassword, isSetupRequired, verifyPassword, verifyTokenFull } from "../lib/auth.ts";
import { getUserTokens, isTokenValid, revokeAllUserTokens, revokeToken, storeToken, tokenStore } from "../lib/token-store.ts";
import { addAuditLog, getClientIp, getBearerToken, logger, parseJson, toBool } from "../lib/utils.ts";
import { TOKEN_TTL_MS } from "../lib/constants.ts";
import { loginSchema, setupSchema } from "../lib/validation.ts";
import { rateLimit } from "../middleware/rate-limit.ts";

export const authRoutes = new Hono();

// GET /setup-status — check if initial admin setup is needed
authRoutes.get("/setup-status", async (c) => {
	return c.json({ setupRequired: isSetupRequired() });
});

// POST /setup — create initial admin account (rate limited)
authRoutes.post(
	"/setup",
	rateLimit({ windowMs: 60_000, maxRequests: 2 }, "setup"),
	zValidator("json", setupSchema),
	async (c) => {
		const setupNeeded = isSetupRequired();
		if (!setupNeeded) {
			return c.json({ error: { message: "Setup already done.", code: 400 } }, 400);
		}

		const data = c.req.valid("json");
		const ts = now();

		const existing = db.select().from(users).where(eq(users.email, data.email)).get();
		if (existing) {
			return c.json({ error: { message: "Email already registered.", code: 409 } }, 409);
		}

		const hashedPw = await hashPassword(data.password);
		const user = db
			.insert(users)
			.values({
				email: data.email,
				name: data.name,
				nickname: data.nickname || data.name.split(" ")[0],
				roles: JSON.stringify(["admin"]),
				isDeleted: 0,
				isDisabled: 0,
				createdAt: ts,
				updatedAt: ts,
			} as any)
			.returning()
			.get();

		if (!user) {
			return c.json({ error: { message: "Failed to create admin account.", code: 500 } }, 500);
		}

		db.insert(auth)
			.values({ userId: user.id, type: "password", secret: hashedPw, createdAt: ts } as any)
			.run();

		db.insert(userPermissions)
			.values({
				userId: user.id,
				visibility: "all",
				proxyHosts: "manage",
				redirectionHosts: "manage",
				deadHosts: "manage",
				streams: "manage",
				accessLists: "manage",
				certificates: "manage",
				createdAt: ts,
				updatedAt: ts,
			} as any)
			.run();

		const token = await createToken({ userId: user.id, email: user.email, roles: ["admin"] });
		const jti = await decodeJti(token);
		if (jti) storeToken(jti, user.id, Date.now() + TOKEN_TTL_MS, c.req.header("User-Agent") || "", getClientIp(c));

		addAuditLog(user.id, "login", "user", user.id, { method: "setup" });
		logger.info(`Initial admin created: ${data.email}`);
		return c.json(
			{
				token,
				expiresOn: "24h",
				user: { id: user.id, email: user.email, name: user.name, roles: ["admin"] },
			},
			201,
		);
	},
);

// POST /login — authenticate user with email and password (rate limited)
authRoutes.post(
	"/login",
	rateLimit({ windowMs: 60_000, maxRequests: 5 }, "login"),
	zValidator("json", loginSchema),
	async (c) => {
		const { email, password } = c.req.valid("json");

		const user = db.select().from(users).where(eq(users.email, email)).get();
		if (!user || user.isDeleted || user.isDisabled) {
			return c.json({ error: { message: "Invalid email or password.", code: 401 } }, 401);
		}

		const authRecord = db.select().from(auth).where(eq(auth.userId, user.id)).get();
		if (!authRecord) {
			return c.json({ error: { message: "Invalid email or password.", code: 401 } }, 401);
		}

		const valid = await verifyPassword(password, authRecord.secret);
		if (!valid) {
			return c.json({ error: { message: "Invalid email or password.", code: 401 } }, 401);
		}

		const roles = parseJson<string[]>(user.roles, []);
		const token = await createToken({ userId: user.id, email: user.email, roles });
		const jti = await decodeJti(token);
		if (jti) storeToken(jti, user.id, Date.now() + TOKEN_TTL_MS, c.req.header("User-Agent") || "", getClientIp(c));

		addAuditLog(user.id, "login", "user", user.id);
		return c.json({
			token,
			expiresOn: "24h",
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				nickname: user.nickname,
				avatar: user.avatar,
				roles,
			},
		});
	},
);

// GET /me — return current authenticated user profile
authRoutes.get("/me", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}
	if (payload.jti && !isTokenValid(payload.jti, payload.userId)) {
		return c.json({ error: { message: "Session revoked.", code: 401 } }, 401);
	}

	const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
	if (!user || user.isDeleted || user.isDisabled) {
		return c.json({ error: { message: "Account not found.", code: 404 } }, 404);
	}

	const perm = db.select().from(userPermissions).where(eq(userPermissions.userId, user.id)).get();
	const roles = parseJson<string[]>(user.roles, []);

	return c.json({
		id: user.id,
		email: user.email,
		name: user.name,
		nickname: user.nickname,
		avatar: user.avatar,
		roles,
		isDisabled: toBool(user.isDisabled),
		permissions: perm || null,
	});
});

// GET /tokens/refresh — issue a new token for the current session
authRoutes.get("/tokens/refresh", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}
	if (payload.jti && !isTokenValid(payload.jti, payload.userId)) {
		return c.json({ error: { message: "Session revoked.", code: 401 } }, 401);
	}

	const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
	if (!user || user.isDeleted || user.isDisabled) {
		return c.json({ error: { message: "Account not found or disabled.", code: 401 } }, 401);
	}

	const token = await createToken({ userId: payload.userId, email: payload.email, roles: payload.roles });
	const jti = await decodeJti(token);
	if (jti) storeToken(jti, payload.userId, Date.now() + TOKEN_TTL_MS, c.req.header("User-Agent") || "", getClientIp(c));
	return c.json({ token, expiresOn: "24h" });
});

// GET /tokens — list all active tokens for the current user
authRoutes.get("/tokens", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}
	if (payload.jti && !isTokenValid(payload.jti, payload.userId)) {
		return c.json({ error: { message: "Session revoked.", code: 401 } }, 401);
	}
	const tokens = getUserTokens(payload.userId);
	return c.json({ tokens });
});

// DELETE /tokens/:jti — revoke a specific token by JTI
authRoutes.delete("/tokens/:jti", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}
	const jti = c.req.param("jti");
	const entry = tokenStore.get(jti);
	if (!entry || entry.userId !== payload.userId) {
		return c.json({ error: { message: "Session not found.", code: 404 } }, 404);
	}
	revokeToken(jti);
	addAuditLog(payload.userId, "revoke_token", "user", payload.userId, { jti });
	return c.json({ success: true });
});

// DELETE /tokens — revoke all tokens except the current one
authRoutes.delete("/tokens", async (c) => {
	const payload = await verifyTokenFull(getBearerToken(c));
	if (!payload) {
		return c.json({ error: { message: "Session expired.", code: 401 } }, 401);
	}

	const currentJti = payload.jti;
	const existing = currentJti ? tokenStore.get(currentJti) : undefined;
	const count = revokeAllUserTokens(payload.userId);

	// Keep the current token alive
	if (currentJti) {
		storeToken(currentJti, payload.userId, Date.now() + TOKEN_TTL_MS, existing?.userAgent || "", existing?.ipAddress || "");
	}

	addAuditLog(payload.userId, "revoke_all_tokens", "user", payload.userId, { revokedCount: count });
	return c.json({ success: true, revokedCount: count });
});
