// Redirection host CRUD endpoints
import { z } from "zod";
import { redirectionHosts } from "../db/schema.ts";
import { createCrudRoutes } from "../lib/crud-factory.ts";
import { domainOverlapError } from "../lib/domain-check.ts";
import { fromBool, parseJson, toBool } from "../lib/utils.ts";

const createSchema = z.object({
	domainNames: z.array(z.string().min(1)).min(1),
	forwardDomainName: z.string().min(1),
	forwardScheme: z.enum(["auto", "http", "https"]).default("auto"),
	forwardHttpCode: z.number().int().default(302).refine(v => [301, 302, 303, 307, 308].includes(v), "Invalid redirect code"),
	preservePath: z.boolean().default(true),
	certificateId: z.number().int().default(0),
	sslForced: z.boolean().default(false),
	blockExploits: z.boolean().default(true),
	http2Support: z.boolean().default(false),
	hstsEnabled: z.boolean().default(false),
	hstsSubdomains: z.boolean().default(false),
	advancedConfig: z.string().default(""),
	enabled: z.boolean().default(true),
});

type CreateData = z.infer<typeof createSchema>;

export const redirectionHostRoutes = createCrudRoutes<CreateData>({
	table: redirectionHosts,
	hostType: "redirection_host",
	rbacResource: "redirectionHosts",
	createSchema,
	beforeCreate: (d) => (d.domainNames ? domainOverlapError(d.domainNames) : null),
	beforeUpdate: (id, d) => (d.domainNames ? domainOverlapError(d.domainNames, id) : null),
	toInsertValues: (d, userId, ts) => ({
		domainNames: JSON.stringify([...d.domainNames].sort()),
		forwardDomainName: d.forwardDomainName,
		forwardScheme: d.forwardScheme,
		forwardHttpCode: d.forwardHttpCode,
		preservePath: fromBool(d.preservePath),
		certificateId: d.certificateId,
		sslForced: fromBool(d.sslForced),
		blockExploits: fromBool(d.blockExploits),
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
		const simple: Record<string, string> = {
			forwardDomainName: "forwardDomainName",
			forwardScheme: "forwardScheme",
			advancedConfig: "advancedConfig",
		};
		for (const [k, col] of Object.entries(simple)) if ((d as any)[k] !== undefined) u[col] = (d as any)[k];
		const nums: Record<string, string> = {
			forwardHttpCode: "forwardHttpCode",
			certificateId: "certificateId",
		};
		for (const [k, col] of Object.entries(nums)) if ((d as any)[k] !== undefined) u[col] = (d as any)[k];
		const bools = [
			"preservePath",
			"sslForced",
			"blockExploits",
			"http2Support",
			"hstsEnabled",
			"hstsSubdomains",
			"enabled",
		];
		for (const k of bools) if ((d as any)[k] !== undefined) u[k] = fromBool((d as any)[k]);
		return u;
	},
	format: (r) => ({
		id: r.id,
		domainNames: parseJson<string[]>(r.domainNames as string, []),
		forwardDomainName: r.forwardDomainName,
		forwardScheme: r.forwardScheme,
		forwardHttpCode: r.forwardHttpCode,
		preservePath: toBool(r.preservePath),
		certificateId: r.certificateId,
		sslForced: toBool(r.sslForced),
		blockExploits: toBool(r.blockExploits),
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
