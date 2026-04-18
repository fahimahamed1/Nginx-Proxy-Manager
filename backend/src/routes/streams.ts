// TCP/UDP stream proxy CRUD endpoints
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { streams } from "../db/schema.ts";
import { createCrudRoutes } from "../lib/crud-factory.ts";
import { fromBool, parseJson, toBool } from "../lib/utils.ts";

const createSchema = z.object({
	incomingPort: z.number().int().min(1).max(65535),
	forwardIp: z.string().min(1).regex(/^(\d{1,3}\.){3}\d{1,3}$/, "Invalid IP address"),
	forwardingPort: z.number().int().min(1).max(65535),
	tcpForwarding: z.boolean().default(true),
	udpForwarding: z.boolean().default(false),
	advancedConfig: z.string().default(""),
	enabled: z.boolean().default(true),
});

type CreateData = z.infer<typeof createSchema>;

// Ensure no two active streams use the same incoming port
function checkPortUniqueness(port: number, excludeId?: number): string | null {
	const existing = db.select().from(streams).where(and(eq(streams.incomingPort, port), eq(streams.isDeleted, 0))).get();
	if (existing && existing.id !== excludeId) return "Port already in use";
	return null;
}

export const streamRoutes = createCrudRoutes<CreateData>({
	table: streams,
	hostType: "stream",
	rbacResource: "streams",
	createSchema,
	searchField: undefined,
	toInsertValues: (d, userId, ts) => ({
		incomingPort: d.incomingPort,
		forwardIp: d.forwardIp,
		forwardingPort: d.forwardingPort,
		tcpForwarding: fromBool(d.tcpForwarding),
		udpForwarding: fromBool(d.udpForwarding),
		advancedConfig: d.advancedConfig,
		enabled: fromBool(d.enabled),
		isDeleted: 0,
		ownerUserId: userId,
		createdAt: ts,
		updatedAt: ts,
	}),
	toUpdateValues: (d, ts) => {
		const u: Record<string, unknown> = { updatedAt: ts };
		if (d.incomingPort !== undefined) u.incomingPort = d.incomingPort;
		if (d.forwardIp !== undefined) u.forwardIp = d.forwardIp;
		if (d.forwardingPort !== undefined) u.forwardingPort = d.forwardingPort;
		if (d.advancedConfig !== undefined) u.advancedConfig = d.advancedConfig;
		for (const k of ["tcpForwarding", "udpForwarding", "enabled"]) {
			if ((d as any)[k] !== undefined) u[k] = fromBool((d as any)[k]);
		}
		return u;
	},
	format: (r) => ({
		id: r.id,
		incomingPort: r.incomingPort,
		forwardIp: r.forwardIp,
		forwardingPort: r.forwardingPort,
		tcpForwarding: toBool(r.tcpForwarding),
		udpForwarding: toBool(r.udpForwarding),
		advancedConfig: r.advancedConfig,
		enabled: toBool(r.enabled),
		meta: parseJson<Record<string, unknown>>(r.meta as string, {}),
		ownerUserId: r.ownerUserId,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
	}),
	beforeCreate: (d) => checkPortUniqueness(d.incomingPort),
	beforeUpdate: (id, d) => (d.incomingPort !== undefined ? checkPortUniqueness(d.incomingPort, id) : null),
});
