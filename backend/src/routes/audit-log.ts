// Audit log query routes
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { auditLog, users } from "../db/schema.ts";

export const auditLogRoutes = new Hono();

// GET / — list audit log entries with filtering and pagination
auditLogRoutes.get("/", async (c) => {
	const offset = Number.parseInt(c.req.query("offset") || "0");
	const limit = Math.min(Number.parseInt(c.req.query("limit") || "100"), 500);
	const userIdFilter = c.req.query("userId");
	const actionFilter = c.req.query("action");
	const objectTypeFilter = c.req.query("objectType");
	const fromFilter = c.req.query("from");
	const toFilter = c.req.query("to");

	// Build dynamic filter conditions
	const conditions: any[] = [];
	if (userIdFilter) conditions.push(eq(auditLog.userId, Number.parseInt(userIdFilter)));
	if (actionFilter) conditions.push(eq(auditLog.action, actionFilter));
	if (objectTypeFilter) conditions.push(eq(auditLog.objectType, objectTypeFilter));
	if (fromFilter) conditions.push(gte(auditLog.createdAt, fromFilter));
	if (toFilter) conditions.push(lte(auditLog.createdAt, toFilter));

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const logs = db
		.select({
			id: auditLog.id,
			userId: auditLog.userId,
			action: auditLog.action,
			objectType: auditLog.objectType,
			objectId: auditLog.objectId,
			meta: auditLog.meta,
			createdAt: auditLog.createdAt,
		})
		.from(auditLog)
		.where(whereClause)
		.orderBy(desc(auditLog.id))
		.limit(limit)
		.offset(offset)
		.all();

	// Batch-resolve user names for the log entries
	const userIds = [...new Set(logs.map((l) => Number(l.userId)))];
	const userMap = new Map<number, { name: string; email: string }>();
	if (userIds.length > 0) {
		const userRows = db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(inArray(users.id, userIds))
			.all();
		for (const u of userRows) userMap.set(Number(u.id), { name: String(u.name), email: String(u.email) });
	}

	const enriched = logs.map((log) => ({
		...log,
		user: userMap.get(Number(log.userId)) || null,
	}));

	const [{ total }] = db.select({ total: sql<number>`count(*)` }).from(auditLog).where(whereClause).all();

	return c.json({ items: enriched, total: Number(total), offset, limit });
});
