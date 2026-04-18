// User management routes
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, now } from "../db/index.ts";
import { auth, userPermissions, users } from "../db/schema.ts";
import { createToken, hashPassword, verifyPassword, verifyTokenFull } from "../lib/auth.ts";
import type { AppEnv, UserPayload } from "../lib/types.ts";
import { addAuditLog, escapeLike, fromBool, getClientIp, logger, parseJson, toBool } from "../lib/utils.ts";
import { revokeAllUserTokens, storeToken } from "../lib/token-store.ts";
import { passwordChangeSchema, permissionUpdateSchema, userCreateSchema, userUpdateSchema } from "../lib/validation.ts";
import { rbacMiddleware } from "../middleware/rbac.ts";

export const userRoutes = new Hono<AppEnv>();

// Format a user row into an API response object
function formatUser(row: Record<string, unknown>, perm?: Record<string, unknown> | null) {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		nickname: row.nickname,
		avatar: row.avatar,
		roles: parseJson<string[]>(row.roles as string, []),
		isDisabled: toBool(row.isDisabled),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		...(perm !== undefined && { permissions: perm || null }),
	};
}

// Batch-fetch permissions for multiple user IDs
function getPermsBatch(ids: number[]): Map<number, Record<string, unknown>> {
	if (ids.length === 0) return new Map();
	const rows = db.select().from(userPermissions).where(inArray(userPermissions.userId, ids)).all();
	return new Map(rows.map((r) => [r.userId, r as Record<string, unknown>]));
}

// GET / — list users with pagination and search
userRoutes.get("/", async (c) => {
	const offset = Number.parseInt(c.req.query("offset") || "0") || 0;
	const limit = Math.min(Number.parseInt(c.req.query("limit") || "50") || 50, 200);
	const search = c.req.query("search");

	let where = and(eq(users.isDeleted, 0));
	if (search) where = and(where, or(like(users.name, `%${escapeLike(search)}%`), like(users.email, `%${escapeLike(search)}%`))!);
	const items = db.select().from(users).where(where).orderBy(desc(users.id)).limit(limit).offset(offset).all();
	const perms = getPermsBatch(items.map((r) => r.id));
	const enriched = items.map((r) => formatUser(r as Record<string, unknown>, perms.get(r.id)));
	const [{ total }] = db
		.select({ total: sql<number>`count(*)` })
		.from(users)
		.where(where)
		.all();
	return c.json({ items: enriched, total: Number(total), offset, limit });
});

// GET /:id — get a single user by ID
userRoutes.get("/:id", async (c) => {
	const id = Number.parseInt(c.req.param("id"));
	const row = db
		.select()
		.from(users)
		.where(and(eq(users.id, id), eq(users.isDeleted, 0)))
		.get();
	if (!row) return c.json({ error: { message: "User not found.", code: 404 } }, 404);
	const perm = db.select().from(userPermissions).where(eq(userPermissions.userId, id)).get();
	return c.json(formatUser(row as Record<string, unknown>, perm || null));
});

// POST / — create a new user
userRoutes.post("/", rbacMiddleware("users", "manage"), zValidator("json", userCreateSchema), async (c) => {
	const data = c.req.valid("json");
	const user = c.get("user") as UserPayload;
	const ts = now();

	const existing = db.select().from(users).where(eq(users.email, data.email)).get();
	if (existing) return c.json({ error: { message: "Email already in use.", code: 409 } }, 409);

	const hashedPw = await hashPassword(data.password);
	const newUser = db
		.insert(users)
		.values({
			email: data.email,
			name: data.name,
			nickname: data.nickname || data.name.split(" ")[0],
			roles: JSON.stringify(data.roles),
			isDisabled: fromBool(data.isDisabled),
			isDeleted: 0,
			createdAt: ts,
			updatedAt: ts,
		} as any)
		.returning()
		.get();
	if (!newUser) return c.json({ error: { message: "Failed to create user.", code: 500 } }, 500);

	db.insert(auth)
		.values({ userId: newUser.id, type: "password", secret: hashedPw, createdAt: ts } as any)
		.run();

	const perms = data.permissions;
	db.insert(userPermissions)
		.values({
			userId: newUser.id,
			visibility: perms?.visibility || (data.roles.includes("admin") ? "all" : "user"),
			proxyHosts: perms?.proxyHosts || "manage",
			redirectionHosts: perms?.redirectionHosts || "manage",
			deadHosts: perms?.deadHosts || "manage",
			streams: perms?.streams || "manage",
			accessLists: perms?.accessLists || "manage",
			certificates: perms?.certificates || "manage",
			createdAt: ts,
			updatedAt: ts,
		} as any)
		.run();

	addAuditLog(user.userId, "create", "user", newUser.id);
	logger.info(`User created: ${data.email}`);
	return c.json(formatUser(newUser as Record<string, unknown>), 201);
});

// PUT /:id — update a user's profile
userRoutes.put("/:id", rbacMiddleware("users", "manage"), zValidator("json", userUpdateSchema), async (c) => {
	const id = Number.parseInt(c.req.param("id"));
	const data = c.req.valid("json");
	const user = c.get("user") as UserPayload;
	const existing = db
		.select()
		.from(users)
		.where(and(eq(users.id, id), eq(users.isDeleted, 0)))
		.get();
	if (!existing) return c.json({ error: { message: "User not found.", code: 404 } }, 404);

	const updates: Record<string, unknown> = { updatedAt: now() };
	if (data.name !== undefined) updates.name = data.name;
	if (data.nickname !== undefined) updates.nickname = data.nickname;
	if (data.roles !== undefined) updates.roles = JSON.stringify(data.roles);
	if (data.isDisabled !== undefined) updates.isDisabled = fromBool(data.isDisabled);

	if (data.email && data.email !== existing.email) {
		const emailExists = db.select().from(users).where(eq(users.email, data.email)).get();
		if (emailExists) return c.json({ error: { message: "Email already in use.", code: 409 } }, 409);
		updates.email = data.email;
	}

	db.update(users).set(updates).where(eq(users.id, id)).run();

	if (data.permissions) {
		db.update(userPermissions)
			.set({ ...(data.permissions as Record<string, unknown>), updatedAt: now() })
			.where(eq(userPermissions.userId, id))
			.run();
	}

	addAuditLog(user.userId, "update", "user", id);
	const updated = db.select().from(users).where(eq(users.id, id)).get();
	return c.json(formatUser(updated! as Record<string, unknown>));
});

// DELETE /:id — soft-delete a user
userRoutes.delete("/:id", rbacMiddleware("users", "manage"), async (c) => {
	const id = Number.parseInt(c.req.param("id"));
	const user = c.get("user") as UserPayload;
	if (id === user.userId) return c.json({ error: { message: "You cannot delete your own account.", code: 400 } }, 400);
	const existing = db
		.select()
		.from(users)
		.where(and(eq(users.id, id), eq(users.isDeleted, 0)))
		.get();
	if (!existing) return c.json({ error: { message: "User not found.", code: 404 } }, 404);
	db.update(users)
		.set({ isDeleted: 1, updatedAt: now() } as any)
		.where(eq(users.id, id))
		.run();
	addAuditLog(user.userId, "delete", "user", id);
	return c.json({ success: true });
});

// PUT /:id/permissions — update a user's permission set
userRoutes.put(
	"/:id/permissions",
	rbacMiddleware("users", "manage"),
	zValidator("json", permissionUpdateSchema),
	async (c) => {
		const id = Number.parseInt(c.req.param("id"));
		const data = c.req.valid("json");
		const user = c.get("user") as UserPayload;

		const targetUser = db
			.select()
			.from(users)
			.where(and(eq(users.id, id), eq(users.isDeleted, 0)))
			.get();
		if (!targetUser) return c.json({ error: { message: "User not found.", code: 404 } }, 404);

		const existing = db.select().from(userPermissions).where(eq(userPermissions.userId, id)).get();
		const ts = now();
		const permData: Record<string, unknown> = { updatedAt: ts };
		for (const [k, v] of Object.entries(data)) {
			if (v !== undefined) permData[k] = v;
		}

		if (existing) {
			db.update(userPermissions).set(permData).where(eq(userPermissions.userId, id)).run();
		} else {
			db.insert(userPermissions)
				.values({
					userId: id,
					visibility: (data.visibility as string) || "user",
					proxyHosts: (data.proxyHosts as string) || "manage",
					redirectionHosts: (data.redirectionHosts as string) || "manage",
					deadHosts: (data.deadHosts as string) || "manage",
					streams: (data.streams as string) || "manage",
					accessLists: (data.accessLists as string) || "manage",
					certificates: (data.certificates as string) || "manage",
					createdAt: ts,
					updatedAt: ts,
				} as any)
				.run();
		}

		addAuditLog(user.userId, "update", "user_permissions", id);
		const updated = db.select().from(userPermissions).where(eq(userPermissions.userId, id)).get();
		return c.json(updated);
	},
);

// POST /:id/login — admin login-as a user (admin only)
userRoutes.post("/:id/login", rbacMiddleware("users", "manage"), async (c) => {
	const id = Number.parseInt(c.req.param("id"));
	const user = c.get("user") as UserPayload;
	if (!user.isAdmin) {
		return c.json({ error: { message: "Admin access required.", code: 403 } }, 403);
	}

	const targetUser = db
		.select()
		.from(users)
		.where(and(eq(users.id, id), eq(users.isDeleted, 0), eq(users.isDisabled, 0)))
		.get();
	if (!targetUser) return c.json({ error: { message: "User not found or disabled.", code: 404 } }, 404);

	const roles = parseJson<string[]>(targetUser.roles as string, []);
	const token = await createToken({ userId: targetUser.id, email: targetUser.email, roles });

	const tokenPayload = await verifyTokenFull(token);
	if (tokenPayload?.jti) {
		storeToken(tokenPayload.jti, targetUser.id, Date.now() + 24 * 60 * 60 * 1000, c.req.header("User-Agent") || "", getClientIp(c));
	}

	addAuditLog(user.userId, "login_as", "user", id);
	return c.json({
		token,
		expiresOn: "24h",
		user: {
			id: targetUser.id,
			email: targetUser.email,
			name: targetUser.name,
			nickname: targetUser.nickname,
			avatar: targetUser.avatar,
			roles,
		},
	});
});

// PUT /:id/auth — change a user's password
userRoutes.put("/:id/auth", zValidator("json", passwordChangeSchema), async (c) => {
	const id = Number.parseInt(c.req.param("id"));
	const user = c.get("user") as UserPayload;
	const { currentPassword, newPassword } = c.req.valid("json");

	if (id !== user.userId && !user.isAdmin) {
		return c.json({ error: { message: "Permission denied.", code: 403 } }, 403);
	}

	const authRecord = db.select().from(auth).where(eq(auth.userId, id)).get();
	if (!authRecord) return c.json({ error: { message: "No password set for this account.", code: 404 } }, 404);

	if (id === user.userId) {
		const valid = await verifyPassword(currentPassword, authRecord.secret);
		if (!valid) return c.json({ error: { message: "Current password is incorrect.", code: 401 } }, 401);
	}

	const hashed = await hashPassword(newPassword);
	db.update(auth).set({ secret: hashed }).where(eq(auth.userId, id)).run();
	revokeAllUserTokens(id);
	addAuditLog(user.userId, "update", "user_auth", id);
	return c.json({ success: true });
});
