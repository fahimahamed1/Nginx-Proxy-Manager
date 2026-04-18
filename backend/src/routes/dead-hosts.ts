// Dead host (404 site) CRUD endpoints
import { z } from "zod";
import { deadHosts } from "../db/schema.ts";
import { createCrudRoutes } from "../lib/crud-factory.ts";
import { domainOverlapError } from "../lib/domain-check.ts";
import { fromBool, parseJson, toBool } from "../lib/utils.ts";

const createSchema = z.object({
	domainNames: z.array(z.string().min(1)).min(1),
	certificateId: z.number().int().default(0),
	sslForced: z.boolean().default(false),
	http2Support: z.boolean().default(false),
	hstsEnabled: z.boolean().default(false),
	hstsSubdomains: z.boolean().default(false),
	advancedConfig: z.string().default(""),
	enabled: z.boolean().default(true),
});

type CreateData = z.infer<typeof createSchema>;

export const deadHostRoutes = createCrudRoutes<CreateData>({
	table: deadHosts,
	hostType: "dead_host",
	rbacResource: "deadHosts",
	createSchema,
	beforeCreate: (d) => (d.domainNames ? domainOverlapError(d.domainNames) : null),
	beforeUpdate: (id, d) => (d.domainNames ? domainOverlapError(d.domainNames, id) : null),
	toInsertValues: (d, userId, ts) => ({
		domainNames: JSON.stringify([...d.domainNames].sort()),
		certificateId: d.certificateId,
		sslForced: fromBool(d.sslForced),
		http2Support: fromBool(d.http2Support),
		hstsEnabled: fromBool(d.hstsEnabled),
		hstsSubdomains: fromBool(d.hstsSubdomains),
		advancedConfig: d.advancedConfig,
		enabled: fromBool(d.enabled),
		isDeleted: 0,
		ownerUserId: userId,
		createdAt: ts,
		updatedAt: ts,
	}),
	toUpdateValues: (d, ts) => {
		const u: Record<string, unknown> = { updatedAt: ts };
		if (d.domainNames !== undefined) u.domainNames = JSON.stringify(d.domainNames);
		if (d.certificateId !== undefined) u.certificateId = d.certificateId;
		if (d.advancedConfig !== undefined) u.advancedConfig = d.advancedConfig;
		for (const k of ["sslForced", "http2Support", "hstsEnabled", "hstsSubdomains", "enabled"]) {
			if ((d as any)[k] !== undefined) u[k] = fromBool((d as any)[k]);
		}
		return u;
	},
	format: (r) => ({
		id: r.id,
		domainNames: parseJson<string[]>(r.domainNames as string, []),
		certificateId: r.certificateId,
		sslForced: toBool(r.sslForced),
		http2Support: toBool(r.http2Support),
		hstsEnabled: toBool(r.hstsEnabled),
		hstsSubdomains: toBool(r.hstsSubdomains),
		advancedConfig: r.advancedConfig,
		enabled: toBool(r.enabled),
		meta: parseJson<Record<string, unknown>>(r.meta as string, {}),
		ownerUserId: r.ownerUserId,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
	}),
});
