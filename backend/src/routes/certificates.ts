// Certificate management routes
import fs from "node:fs";
import path from "node:path";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, now } from "../db/index.ts";
import { certificates, proxyHosts, redirectionHosts, deadHosts } from "../db/schema.ts";
import { DATA_DIR } from "../env.ts";
import type { AppEnv, UserPayload } from "../lib/types.ts";
import { addAuditLog, escapeLike, execSafe, logger, parseJson } from "../lib/utils.ts";
import { DEFAULT_LE_EMAIL } from "../lib/constants.ts";
import { rbacMiddleware } from "../middleware/rbac.ts";
import {
        deleteCertificateFiles,
        getCertPaths,
        renewCertificate,
        requestLetsEncrypt,
        revokeCertificate,
} from "../services/certificate.ts";
import { configureHost } from "../services/nginx.ts";

export const certificateRoutes = new Hono<AppEnv>();

const createSchema = z.object({
        provider: z.enum(["letsencrypt", "other"]),
        niceName: z.string().optional(),
        domainNames: z.array(z.string().min(1)).min(1),
        meta: z.record(z.unknown()).optional(),
});

// Format a certificate row into an API response object
function formatCert(row: Record<string, unknown>) {
        return {
                id: row.id,
                provider: row.provider,
                niceName: row.niceName,
                domainNames: parseJson<string[]>(row.domainNames as string, []),
                expiresOn: row.expiresOn,
                meta: parseJson(row.meta as string, {}),
                autoRenew: Boolean(row.autoRenew),
                ownerUserId: row.ownerUserId,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
        };
}

// GET / — list certificates with pagination and search
certificateRoutes.get("/", async (c) => {
        const user = c.get("user") as UserPayload;
        const offset = Number.parseInt(c.req.query("offset") || "0") || 0;
        const limit = Math.min(Number.parseInt(c.req.query("limit") || "50") || 50, 200);
        const search = c.req.query("search");
        let where = and(eq(certificates.isDeleted, 0));
        if (search) where = and(where, like(certificates.domainNames, `%${escapeLike(search)}%`));
        if (!user.isAdmin) where = and(where, eq(certificates.ownerUserId, user.userId));
        const items = db
                .select()
                .from(certificates)
                .where(where)
                .orderBy(desc(certificates.id))
                .limit(limit)
                .offset(offset)
                .all();
        const [{ total }] = db
                .select({ total: sql<number>`count(*)` })
                .from(certificates)
                .where(where)
                .all();
        return c.json({ items: items.map(formatCert), total: Number(total), offset, limit });
});

// GET /:id — get a single certificate by ID
certificateRoutes.get("/:id", async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const user = c.get("user") as UserPayload;
        const cert = db
                .select()
                .from(certificates)
                .where(and(eq(certificates.id, id), eq(certificates.isDeleted, 0)))
                .get();
        if (!cert) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        if (!user.isAdmin && cert.ownerUserId !== user.userId) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        return c.json(formatCert(cert));
});

// POST / — create a new certificate (Let's Encrypt or custom)
certificateRoutes.post("/", rbacMiddleware("certificates", "manage"), zValidator("json", createSchema), async (c) => {
        const data = c.req.valid("json");
        const user = c.get("user") as UserPayload;
        const ts = now();

        // Check for overlapping domains with existing certificates
        const existing = db
                .select()
                .from(certificates)
                .where(and(eq(certificates.isDeleted, 0)))
                .all();
        const newDomains = data.domainNames.map((d) => d.toLowerCase());
        for (const cert of existing) {
                const certDomains = parseJson<string[]>(cert.domainNames as string, []);
                const overlap = certDomains.filter((d) => newDomains.includes(d.toLowerCase()));
                if (overlap.length > 0) {
                        return c.json({ error: { message: `Domains already in use: ${overlap.join(", ")}`, code: 409 } }, 409);
                }
        }

        let expiresOn = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const cert = db
                .insert(certificates)
                .values({
                        provider: data.provider,
                        niceName: data.niceName || data.domainNames[0],
                        domainNames: JSON.stringify(data.domainNames),
                        expiresOn,
                        meta: JSON.stringify(data.meta || {}),
                        isDeleted: 0,
                        ownerUserId: user.userId,
                        createdAt: ts,
                        updatedAt: ts,
                } as any)
                .returning()
                .get();

        if (!cert) return c.json({ error: { message: "Failed to create certificate.", code: 500 } }, 500);

        if (data.provider === "letsencrypt") {
                const meta = data.meta || {};
                const email = (meta.letsencryptEmail as string) || (meta.email as string) || DEFAULT_LE_EMAIL;
                const staging = Boolean(meta.staging);

                const result = await requestLetsEncrypt(cert.id, data.domainNames, email, staging);
                if (result.success && result.expiresOn) {
                        expiresOn = result.expiresOn;
                        db.update(certificates).set({ expiresOn, updatedAt: now() }).where(eq(certificates.id, cert.id)).run();
                } else {
                        db.update(certificates)
                                .set({ isDeleted: 1, updatedAt: now() } as any)
                                .where(eq(certificates.id, cert.id))
                                .run();
                        logger.error("LE request failed:", result.message);
                        return c.json({ error: { message: result.message, code: 500 } }, 500);
                }
        }

        addAuditLog(user.userId, "create", "certificate", cert.id);
        logger.info(`Certificate created: ${data.domainNames.join(", ")}`);
        return c.json(formatCert(cert), 201);
});

const updateSchema = z.object({
        niceName: z.string().optional(),
        meta: z.record(z.unknown()).optional(),
        autoRenew: z.boolean().optional(),
});

// PUT /:id — update certificate metadata
certificateRoutes.put("/:id", rbacMiddleware("certificates", "manage"), zValidator("json", updateSchema), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const data = c.req.valid("json");
        const user = c.get("user") as UserPayload;
        const existing = db
                .select()
                .from(certificates)
                .where(and(eq(certificates.id, id), eq(certificates.isDeleted, 0)))
                .get();
        if (!existing) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        if (!user.isAdmin && existing.ownerUserId !== user.userId) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);

        const updates: Record<string, unknown> = { updatedAt: now() };
        if (data.niceName !== undefined) updates.niceName = data.niceName;
        if (data.meta !== undefined) updates.meta = JSON.stringify(data.meta);
        if (data.autoRenew !== undefined) updates.autoRenew = data.autoRenew ? 1 : 0;

        db.update(certificates).set(updates).where(eq(certificates.id, id)).run();
        addAuditLog(user.userId, "update", "certificate", id);

        const updated = db.select().from(certificates).where(eq(certificates.id, id)).get();
        return c.json(formatCert(updated!));
});

// DELETE /:id — soft-delete a certificate and reconfigure affected hosts
certificateRoutes.delete("/:id", rbacMiddleware("certificates", "manage"), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const user = c.get("user") as UserPayload;
        const existing = db
                .select()
                .from(certificates)
                .where(and(eq(certificates.id, id), eq(certificates.isDeleted, 0)))
                .get();
        if (!existing) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        if (!user.isAdmin && existing.ownerUserId !== user.userId) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);

        if (existing.provider === "letsencrypt") {
                try {
                        await revokeCertificate(id);
                } catch (err) {
                        logger.error("Failed to revoke LE certificate:", err);
                }
        } else {
                try {
                        await deleteCertificateFiles(id, existing.provider);
                } catch (err) {
                        logger.error("Failed to delete custom certificate files:", err);
                }
        }

        db.update(certificates)
                .set({ isDeleted: 1, updatedAt: now() } as any)
                .where(eq(certificates.id, id))
                .run();

        // Reconfigure hosts that reference this certificate
        try {
                const affectedProxyHosts = db.select().from(proxyHosts).where(and(eq(proxyHosts.certificateId, id), eq(proxyHosts.isDeleted, 0), eq(proxyHosts.enabled, 1))).all();
                for (const host of affectedProxyHosts) {
                        try { await configureHost("proxy_host", host); } catch (err) { logger.error("Failed to reconfigure proxy host:", err); }
                }
                const affectedDeadHosts = db.select().from(deadHosts).where(and(eq(deadHosts.certificateId, id), eq(deadHosts.isDeleted, 0), eq(deadHosts.enabled, 1))).all();
                for (const host of affectedDeadHosts) {
                        try { await configureHost("dead_host", host); } catch (err) { logger.error("Failed to reconfigure dead host:", err); }
                }
                const affectedRedirHosts = db.select().from(redirectionHosts).where(and(eq(redirectionHosts.certificateId, id), eq(redirectionHosts.isDeleted, 0), eq(redirectionHosts.enabled, 1))).all();
                for (const host of affectedRedirHosts) {
                        try { await configureHost("redirection_host", host); } catch (err) { logger.error("Failed to reconfigure redirection host:", err); }
                }
        } catch (err) {
                logger.error("Failed to reconfigure hosts after certificate deletion:", err);
        }

        addAuditLog(user.userId, "delete", "certificate", id);
        return c.json({ success: true });
});

// POST /:id/renew — renew a Let's Encrypt certificate
certificateRoutes.post("/:id/renew", rbacMiddleware("certificates", "manage"), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const user = c.get("user") as UserPayload;
        const cert = db
                .select()
                .from(certificates)
                .where(and(eq(certificates.id, id), eq(certificates.isDeleted, 0)))
                .get();
        if (!cert) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        if (!user.isAdmin && cert.ownerUserId !== user.userId) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        if (cert.provider !== "letsencrypt") {
                return c.json({ error: { message: "Only Let's Encrypt certificates can be renewed.", code: 400 } }, 400);
        }

        try {
                const domainNames = parseJson<string[]>(cert.domainNames as string, []);
                const meta = parseJson<Record<string, unknown>>(cert.meta as string, {});
                const email = (meta.letsencryptEmail as string) || DEFAULT_LE_EMAIL;
                const staging = Boolean(meta.staging);

                const result = await renewCertificate(id, domainNames, email, staging);
                if (result.success && result.expiresOn) {
                        db.update(certificates)
                                .set({ expiresOn: result.expiresOn, updatedAt: now() })
                                .where(eq(certificates.id, id))
                                .run();
                }

                if (result.success) {
                        addAuditLog(user.userId, "renew", "certificate", id);
                        return c.json({ success: true, message: result.message });
                } else {
                        logger.error("Certificate renewal failed:", result.message);
                        return c.json({ error: { message: result.message, code: 500 } }, 500);
                }
        } catch (err) {
                logger.error("Certificate renewal failed:", err);
                return c.json({ error: { message: "Certificate renewal failed.", code: 500 } }, 500);
        }
});

// GET /:id/download — download certificate file (fullchain, privkey, or chain)
certificateRoutes.get("/:id/download", rbacMiddleware("certificates", "manage"), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const type = c.req.query("type") || "fullchain";
        const user = c.get("user") as UserPayload;

        const cert = db
                .select()
                .from(certificates)
                .where(and(eq(certificates.id, id), eq(certificates.isDeleted, 0)))
                .get();
        if (!cert) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        if (!user.isAdmin && cert.ownerUserId !== user.userId) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);

        const validTypes = ["fullchain", "privkey", "chain"];
        if (!validTypes.includes(type)) {
                return c.json({ error: { message: "Invalid download type.", code: 400 } }, 400);
        }

        const certPaths = getCertPaths(id, cert.provider as string);
        const filePath = certPaths[type as keyof typeof certPaths];
        if (!fs.existsSync(filePath)) {
                return c.json({ error: { message: "Certificate file not found.", code: 404 } }, 404);
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const domains = parseJson<string[]>(cert.domainNames as string, []);
        const safeFileName = domains[0]?.replace(/[^a-zA-Z0-9.-]/g, "_") || `cert-${id}`;
        const extension = type === "privkey" ? "key" : "pem";
        const fileName = `${safeFileName}.${extension}`;

        addAuditLog(user.userId, "download", "certificate", id);
        return new Response(content, {
                headers: {
                        "Content-Type": "application/x-pem-file",
                        "Content-Disposition": `attachment; filename="${fileName}"`,
                },
        });
});

// POST /:id/upload — upload custom certificate and key files
certificateRoutes.post("/:id/upload", rbacMiddleware("certificates", "manage"), async (c) => {
        const id = Number.parseInt(c.req.param("id"));
        const user = c.get("user") as UserPayload;
        const cert = db
                .select()
                .from(certificates)
                .where(and(eq(certificates.id, id), eq(certificates.isDeleted, 0)))
                .get();
        if (!cert) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);
        if (!user.isAdmin && cert.ownerUserId !== user.userId) return c.json({ error: { message: "Certificate not found.", code: 404 } }, 404);

        const body = await c.req.parseBody();
        const certFile = body.certificate as File;
        const keyFile = body.certificate_key as File;

        if (!certFile || !keyFile) {
                return c.json({ error: { message: "Certificate and key files are required.", code: 400 } }, 400);
        }

        const certDir = path.join(DATA_DIR, "custom_ssl", `npm-${id}`);
        fs.mkdirSync(certDir, { recursive: true });

        const certContent = await certFile.text();
        const keyContent = await keyFile.text();

        try {
                fs.writeFileSync(`${certDir}/fullchain.pem`, certContent);
                fs.writeFileSync(`${certDir}/privkey.pem`, keyContent);
                fs.chmodSync(`${certDir}/privkey.pem`, 0o600);

                // Extract expiry date from the uploaded certificate
                let expiresOn = cert.expiresOn;
                const { stdout } = await execSafe("openssl", ["x509", "-in", `${certDir}/fullchain.pem`, "-noout", "-enddate"]);
                const match = stdout.match(/notAfter=(.+)/);
                if (match) {
                        const date = new Date(match[1].trim());
                        if (!Number.isNaN(date.getTime())) expiresOn = date.toISOString();
                }

                db.update(certificates).set({ expiresOn, updatedAt: now() }).where(eq(certificates.id, id)).run();
                addAuditLog((c.get("user") as UserPayload).userId, "upload", "certificate", id);
                return c.json({ success: true, expiresOn });
        } catch (err) {
                logger.error("Certificate upload failed:", err);
                return c.json({ error: { message: "Invalid certificate or key file.", code: 400 } }, 400);
        }
});
