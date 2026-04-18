// Health check and dashboard stats routes
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { auditLog, certificates, deadHosts, proxyHosts, redirectionHosts, streams } from "../db/schema.ts";
import { APP_VERSION } from "../env.ts";
import { isSetupRequired } from "../lib/auth.ts";

export const healthRoutes = new Hono();

// GET / — basic liveness check
healthRoutes.get("/", async (c) => {
	return c.json({
		status: "OK",
		version: APP_VERSION,
		setup: !isSetupRequired(),
	});
});

// GET /dashboard — aggregated dashboard statistics
healthRoutes.get("/dashboard", async (c) => {
	const zero = { total: 0, enabled: 0 } as { total: number; enabled: number };

	const [proxyAll, redirAll, deadAll, streamAll, certRows, recentLogs] = await Promise.all([
		db
			.select({
				total: sql<number>`count(*)`,
				enabled: sql<number>`sum(case when enabled = 1 then 1 else 0 end)`,
			})
			.from(proxyHosts)
			.where(eq(proxyHosts.isDeleted, 0))
			.get() ?? zero,

		db
			.select({
				total: sql<number>`count(*)`,
				enabled: sql<number>`sum(case when enabled = 1 then 1 else 0 end)`,
			})
			.from(redirectionHosts)
			.where(eq(redirectionHosts.isDeleted, 0))
			.get() ?? zero,

		db
			.select({
				total: sql<number>`count(*)`,
				enabled: sql<number>`sum(case when enabled = 1 then 1 else 0 end)`,
			})
			.from(deadHosts)
			.where(eq(deadHosts.isDeleted, 0))
			.get() ?? zero,

		db
			.select({
				total: sql<number>`count(*)`,
				enabled: sql<number>`sum(case when enabled = 1 then 1 else 0 end)`,
			})
			.from(streams)
			.where(eq(streams.isDeleted, 0))
			.get() ?? zero,

		db
			.select({
				id: certificates.id,
				niceName: certificates.niceName,
				domainNames: certificates.domainNames,
				expiresOn: certificates.expiresOn,
				provider: certificates.provider,
			})
			.from(certificates)
			.where(eq(certificates.isDeleted, 0))
			.all(),

		db
			.select({
				id: auditLog.id,
				userId: auditLog.userId,
				action: auditLog.action,
				objectType: auditLog.objectType,
				objectId: auditLog.objectId,
				createdAt: auditLog.createdAt,
			})
			.from(auditLog)
			.orderBy(desc(auditLog.id))
			.limit(10)
			.all(),
	]);

	const uptimeMs = process.uptime() * 1000;
	const uptimeHours = Math.floor(uptimeMs / 3600000);
	const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);

	return c.json({
		hosts: {
			proxy: {
				total: Number(proxyAll.total),
				enabled: Number(proxyAll.enabled),
				disabled: Number(proxyAll.total) - Number(proxyAll.enabled),
			},
			redirection: {
				total: Number(redirAll.total),
				enabled: Number(redirAll.enabled),
				disabled: Number(redirAll.total) - Number(redirAll.enabled),
			},
			dead: {
				total: Number(deadAll.total),
				enabled: Number(deadAll.enabled),
				disabled: Number(deadAll.total) - Number(deadAll.enabled),
			},
			stream: {
				total: Number(streamAll.total),
				enabled: Number(streamAll.enabled),
				disabled: Number(streamAll.total) - Number(streamAll.enabled),
			},
		},
		totalHosts: Number(proxyAll.total) + Number(redirAll.total) + Number(deadAll.total),
		totalStreams: Number(streamAll.total),
		certificates: {
			total: certRows.length,
			items: certRows.map((r) => ({
				id: r.id,
				niceName: r.niceName,
				expiresOn: r.expiresOn,
				provider: r.provider,
			})),
		},
		recentActivity: recentLogs,
		system: {
			version: APP_VERSION,
			uptime: `${uptimeHours}h ${uptimeMinutes}m`,
			nodeVersion: process.version,
			memory: (() => {
				const mem = process.memoryUsage();
				return {
					rss: Math.round(mem.rss / 1024 / 1024),
					heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
					heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
				};
			})(),
		},
	});
});
