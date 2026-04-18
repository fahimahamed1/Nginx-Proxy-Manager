// Proxy host CRUD endpoints
import dns from "node:dns";
import net from "node:net";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { proxyHosts } from "../db/schema.ts";
import { createCrudRoutes } from "../lib/crud-factory.ts";
import { domainOverlapError } from "../lib/domain-check.ts";
import { fromBool, logger, parseJson, toBool } from "../lib/utils.ts";
import { TCP_CHECK_TIMEOUT_MS, HOST_TEST_TIMEOUT_MS } from "../lib/constants.ts";
import { configureHost, deleteConfig } from "../services/nginx.ts";
import { rbacMiddleware } from "../middleware/rbac.ts";

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

// Check whether a host string is a raw IP address
function isIpAddress(host: string): boolean {
        if (IP_REGEX.test(host)) return true;
        const parts = host.split(".");
        if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255)) return true;
        return false;
}

// Resolve a hostname to its first A record (or return as-is for IPs)
function resolveHost(host: string): Promise<string> {
        return new Promise((resolve) => {
                if (isIpAddress(host)) {
                        resolve(host);
                        return;
                }
                dns.promises.resolve4(host).then((ips) => resolve(ips[0] || host)).catch(() => resolve(host));
        });
}

// Attempt a TCP connection to verify a host is reachable
function checkTcpConnection(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; timeMs: number; error?: string }> {
        return new Promise((resolve) => {
                const start = Date.now();
                const socket = new net.Socket();
                socket.setTimeout(timeoutMs);
                socket.on("connect", () => {
                        socket.destroy();
                        resolve({ ok: true, timeMs: Date.now() - start });
                });
                socket.on("timeout", () => {
                        socket.destroy();
                        resolve({ ok: false, timeMs: Date.now() - start, error: "Connection timed out" });
                });
                socket.on("error", (err) => {
                        socket.destroy();
                        resolve({ ok: false, timeMs: Date.now() - start, error: err.message });
                });
                socket.connect(port, host);
        });
}

const createSchema = z.object({
        domainNames: z.array(z.string().min(1)).min(1),
        forwardHost: z.string().min(1),
        forwardPort: z.number().int().min(1).max(65535),
        forwardScheme: z.enum(["http", "https"]).default("http"),
        allowWebsocketUpgrade: z.boolean().default(false),
        accessListId: z.number().int().default(0),
        certificateId: z.number().int().default(0),
        sslForced: z.boolean().default(false),
        cachingEnabled: z.boolean().default(false),
        blockExploits: z.boolean().default(true),
        http2Support: z.boolean().default(false),
        hstsEnabled: z.boolean().default(false),
        hstsSubdomains: z.boolean().default(false),
        trustForwardedProto: z.boolean().default(false),
        advancedConfig: z.string().default(""),
        locations: z
                .array(
                        z.object({
                                path: z.string(),
                                forwardHost: z.string().optional(),
                                forwardPort: z.number().optional(),
                                forwardScheme: z.enum(["http", "https"]).optional(),
                                advancedConfig: z.string().optional(),
                        }),
                )
                .default([]),
        enabled: z.boolean().default(true),
});

type CreateData = z.infer<typeof createSchema>;

export const proxyHostRoutes = createCrudRoutes<CreateData>({
        table: proxyHosts,
        hostType: "proxy_host",
        rbacResource: "proxyHosts",
        createSchema,
        toInsertValues: (d, userId, ts) => ({
                domainNames: JSON.stringify([...d.domainNames].sort()),
                forwardHost: d.forwardHost,
                forwardPort: d.forwardPort,
                forwardScheme: d.forwardScheme,
                allowWebsocketUpgrade: fromBool(d.allowWebsocketUpgrade),
                accessListId: d.accessListId,
                certificateId: d.certificateId,
                sslForced: fromBool(d.sslForced),
                cachingEnabled: fromBool(d.cachingEnabled),
                blockExploits: fromBool(d.blockExploits),
                http2Support: fromBool(d.http2Support),
                hstsEnabled: fromBool(d.hstsEnabled),
                hstsSubdomains: fromBool(d.hstsSubdomains),
                trustForwardedProto: fromBool(d.trustForwardedProto),
                advancedConfig: d.advancedConfig,
                locations: JSON.stringify(d.locations),
                enabled: fromBool(d.enabled),
                isDeleted: 0,
                ownerUserId: userId,
                createdAt: ts,
                updatedAt: ts,
        }),
        toUpdateValues: (d, ts) => {
                const u: Record<string, unknown> = { updatedAt: ts };
                if (d.domainNames !== undefined) u.domainNames = JSON.stringify([...(d.domainNames as string[])].sort());
                const simple: Record<string, string> = { forwardHost: "forwardHost", forwardScheme: "forwardScheme", advancedConfig: "advancedConfig" };
                for (const [k, col] of Object.entries(simple)) if ((d as any)[k] !== undefined) u[col] = (d as any)[k];
                const nums: Record<string, string> = {
                        forwardPort: "forwardPort",
                        accessListId: "accessListId",
                        certificateId: "certificateId",
                };
                for (const [k, col] of Object.entries(nums)) if ((d as any)[k] !== undefined) u[col] = (d as any)[k];
                const bools = [
                        "allowWebsocketUpgrade",
                        "sslForced",
                        "cachingEnabled",
                        "blockExploits",
                        "http2Support",
                        "hstsEnabled",
                        "hstsSubdomains",
                        "trustForwardedProto",
                        "enabled",
                ];
                for (const k of bools) if ((d as any)[k] !== undefined) u[k] = fromBool((d as any)[k]);
                if (d.locations !== undefined) u.locations = JSON.stringify(d.locations);
                return u;
        },
        format: (r) => ({
                id: r.id,
                domainNames: parseJson<string[]>(r.domainNames as string, []),
                forwardHost: r.forwardHost,
                forwardPort: r.forwardPort,
                forwardScheme: r.forwardScheme,
                allowWebsocketUpgrade: toBool(r.allowWebsocketUpgrade),
                accessListId: r.accessListId,
                certificateId: r.certificateId,
                sslForced: toBool(r.sslForced),
                cachingEnabled: toBool(r.cachingEnabled),
                blockExploits: toBool(r.blockExploits),
                http2Support: toBool(r.http2Support),
                hstsEnabled: toBool(r.hstsEnabled),
                hstsSubdomains: toBool(r.hstsSubdomains),
                trustForwardedProto: toBool(r.trustForwardedProto),
                advancedConfig: r.advancedConfig,
                locations: parseJson(r.locations as string, []),
                meta: parseJson(r.meta as string, {}),
                enabled: toBool(r.enabled),
                ownerUserId: r.ownerUserId,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
        }),
        beforeCreate: (d) => (d.domainNames ? domainOverlapError(d.domainNames) : null),
        beforeUpdate: (id, d) => (d.domainNames ? domainOverlapError(d.domainNames, id) : null),
        onUpdateNginx: async (host, wasEnabled, data) => {
                if (wasEnabled || data.enabled) {
                        if (host.enabled) await configureHost("proxy_host", host);
                        else await deleteConfig("proxy_host", host.id as number);
                }
        },
});

// POST /check-host — verify DNS resolution and TCP connectivity for a host
proxyHostRoutes.post("/check-host", rbacMiddleware("proxyHosts", "manage"), async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const host = (body as { host?: string })?.host?.trim();
        if (!host) return c.json({ error: { message: "Host address is required.", code: 400 } }, 400);

        const resolvedIp = await resolveHost(host);
        const isIp = isIpAddress(host);
        const tcp = await checkTcpConnection(isIp ? host : resolvedIp, 80, TCP_CHECK_TIMEOUT_MS);

        const result = {
                host,
                isIp,
                resolvedIp,
                dnsResolved: isIp || resolvedIp !== host,
                reachable: tcp.ok,
                responseTime: tcp.timeMs,
                error: tcp.error,
        };
        return c.json(result);
});

// POST /:id/test — run DNS and forward-host connectivity tests for an existing proxy host
proxyHostRoutes.post("/:id/test", rbacMiddleware("proxyHosts", "manage"), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const row = db
                .select()
                .from(proxyHosts)
                .where(and(eq(proxyHosts.id, id), eq(proxyHosts.isDeleted, 0)))
                .get();
        if (!row) return c.json({ error: { message: "Proxy host not found.", code: 404 } }, 404);

        const domains = parseJson<string[]>(row.domainNames as string, []);
        const forwardHost = row.forwardHost as string;
        const forwardPort = row.forwardPort as number;
        const forwardScheme = (row.forwardScheme as string) || "http";
        const timeout = HOST_TEST_TIMEOUT_MS;

        let dnsResolved = false;
        let dnsIp: string | undefined;
        let forwardReachable = false;
        let responseTime = 0;
        let error: string | undefined;

        // Test DNS for first domain
        const primaryDomain = domains[0] || "";
        if (primaryDomain && !isIpAddress(primaryDomain)) {
                try {
                        const addresses = await dns.promises.resolve4(primaryDomain);
                        dnsIp = addresses[0];
                        dnsResolved = true;
                } catch {
                        // DNS resolution failed — host may not exist
                        try {
                                const addresses = await dns.promises.resolve6(primaryDomain);
                                dnsIp = addresses[0];
                                dnsResolved = true;
                        } catch (e) {
                                error = `DNS failed for ${primaryDomain}: ${(e as Error).message}`;
                        }
                }
        } else if (isIpAddress(primaryDomain)) {
                dnsResolved = true;
                dnsIp = primaryDomain;
        } else {
                dnsResolved = true;
        }

        // Test forward host reachability via TCP
        const fwdIsIp = isIpAddress(forwardHost);
        if (!error) {
                const resolvedFwd = fwdIsIp ? forwardHost : await resolveHost(forwardHost);
                const tcp = await checkTcpConnection(resolvedFwd, forwardPort, timeout);
                forwardReachable = tcp.ok;
                responseTime = tcp.timeMs;
                if (!tcp.ok) {
                        error = `Forward host unreachable: ${tcp.error}`;
                }
        }

        return c.json({
                dnsResolved,
                dnsIp,
                forwardReachable,
                responseTime,
                error,
        });
});
