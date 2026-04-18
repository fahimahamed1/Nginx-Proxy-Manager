// Host and certificate statistics routes
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { certificates, deadHosts, proxyHosts, redirectionHosts, streams } from "../db/schema.ts";

export const reportRoutes = new Hono();

// GET /hosts — aggregate host counts by type with optional date filters
reportRoutes.get("/hosts", async (c) => {
	const hostType = c.req.query("hostType");
	const fromFilter = c.req.query("from");
	const toFilter = c.req.query("to");
	const limit = Math.min(Number.parseInt(c.req.query("limit") || "50") || 50, 500);
	const offset = Number.parseInt(c.req.query("offset") || "0") || 0;

	// Count hosts for a given table, applying optional date range filters
	const countHosts = (table: any) => {
		const conditions = [eq(table.isDeleted, 0)];
		if (fromFilter) conditions.push(gte(table.createdAt, fromFilter));
		if (toFilter) conditions.push(lte(table.createdAt, toFilter));
		const where = and(...conditions);
		const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(table).where(where).all();
		return Number(count);
	};

	let proxy = 0;
	let redirection = 0;
	let dead = 0;
	let stream = 0;

	if (!hostType || hostType === "proxy") proxy = countHosts(proxyHosts);
	if (!hostType || hostType === "redirect") redirection = countHosts(redirectionHosts);
	if (!hostType || hostType === "dead") dead = countHosts(deadHosts);
	if (!hostType || hostType === "stream") stream = countHosts(streams);

	const [{ totalCerts }] = db
		.select({ totalCerts: sql<number>`count(*)` })
		.from(certificates)
		.where(eq(certificates.isDeleted, 0))
		.all() as [{ totalCerts: number }];

	// Get enabled/disabled breakdown for a host table
	const enabledStats = (table: any) => {
		const conditions = [eq(table.isDeleted, 0)];
		if (fromFilter) conditions.push(gte(table.createdAt, fromFilter));
		if (toFilter) conditions.push(lte(table.createdAt, toFilter));
		const where = and(...conditions);
		const result = db
			.select({
				enabled: sql<number>`sum(case when enabled = 1 then 1 else 0 end)`,
				disabled: sql<number>`sum(case when enabled = 0 then 1 else 0 end)`,
			})
			.from(table)
			.where(where)
			.get() as { enabled: number; disabled: number };
		return { enabled: Number(result.enabled), disabled: Number(result.disabled) };
	};

	return c.json({
		proxy: { total: proxy, ...(!hostType || hostType === "proxy" ? enabledStats(proxyHosts) : {}) },
		redirection: {
			total: redirection,
			...(!hostType || hostType === "redirect" ? enabledStats(redirectionHosts) : {}),
		},
		dead: { total: dead, ...(!hostType || hostType === "dead" ? enabledStats(deadHosts) : {}) },
		stream: { total: stream, ...(!hostType || hostType === "stream" ? enabledStats(streams) : {}) },
		totalHosts: proxy + redirection + dead,
		totalCertificates: Number(totalCerts),
		filters: { hostType: hostType || null, from: fromFilter || null, to: toFilter || null },
		pagination: { limit, offset },
	});
});
