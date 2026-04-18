// Let's Encrypt certificate management
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, now } from "../db/index.ts";
import { certificates } from "../db/schema.ts";
import { DATA_DIR, LE_SERVER, LE_STAGING } from "../env.ts";
import { RENEW_BEFORE_DAYS, NGINX_RELOAD_WAIT_MS } from "../lib/constants.ts";
import { execSafe, logger, parseJson } from "../lib/utils.ts";

const CERT_LE_DIR = "/etc/letsencrypt/live";
const CERT_CUSTOM_DIR = path.join(DATA_DIR, "custom_ssl");
const NGINX_DIR = path.join(DATA_DIR, "nginx");

// Look up certificate provider from database
export function getCertProvider(certId: number): string | null {
        if (certId <= 0) return null;
        try {
                const cert = db
                        .select({ provider: certificates.provider })
                        .from(certificates)
                        .where(eq(certificates.id, certId))
                        .get();
                return cert?.provider ?? null;
        } catch {
                // return null if provider lookup fails
                return null;
        }
}

function getCertDir(certId: number, provider?: string | null): string {
        if (provider === "letsencrypt") return `${CERT_LE_DIR}/npm-${certId}`;
        return `${CERT_CUSTOM_DIR}/npm-${certId}`;
}

// Resolve file paths for a certificate
export function getCertPaths(certId: number, provider?: string | null) {
        const dir = getCertDir(certId, provider);
        return {
                dir,
                fullchain: `${dir}/fullchain.pem`,
                privkey: `${dir}/privkey.pem`,
                chain: `${dir}/chain.pem`,
                cert: `${dir}/cert.pem`,
        };
}

const execCertbot = (args: string[]) => execSafe("certbot", args);

// Remove leftover cli.ini that breaks certbot 2.x
function cleanStaleCertbotConfig(): void {
        try {
                const cliIni = "/etc/letsencrypt/cli.ini";
                if (fs.existsSync(cliIni)) {
                        fs.unlinkSync(cliIni);
                        logger.info("Removed stale /etc/letsencrypt/cli.ini (certbot 2.x compatibility)");
                }
        } catch {
                // non-fatal — cleanup is optional
        }
}

const execOpenSsl = (args: string[]) => execSafe("openssl", args).then((r) => r.stdout);

// Register or update the LE account
async function ensureLeAccount(email: string, staging = false): Promise<void> {
        const regArgs = ["register", "--non-interactive", "--agree-tos", "--email", email];
        if (staging) regArgs.push("--staging");
        try {
                await execCertbot(regArgs);
                logger.info("LE account registered");
                return;
        } catch (err) {
                logger.warn("LE account registration failed, attempting update:", (err as Error).message);
        }
        const updArgs = ["update_account", "--non-interactive", "--email", email];
        if (staging) updArgs.push("--staging");
        try {
                await execCertbot(updArgs);
                logger.info("LE account email updated");
        } catch (err) {
                logger.warn("LE account update also failed, continuing anyway:", (err as Error).message);
        }
}

// Build certbot command-line arguments for a certificate request
function buildCertbotArgs(opts: {
        domains: string[];
        certName: string;
        email: string;
        staging?: boolean;
        forceRenewal?: boolean;
}): string[] {
        const args = [
                "certonly",
                "--non-interactive",
                "--agree-tos",
                "--email",
                opts.email,
                "--webroot",
                "-w",
                path.join(DATA_DIR, "letsencrypt-acme-challenge"),
                "--cert-name",
                opts.certName,
                ...opts.domains.flatMap((d) => ["-d", d]),
        ];
        if (opts.staging) args.push("--staging");
        if (opts.forceRenewal) args.push("--force-renewal");
        if (LE_SERVER) args.push("--server", LE_SERVER);
        return args;
}

// Generate a temporary nginx config for ACME HTTP-01 challenge
function generateLeRequestConfig(certId: number, domainNames: string[]): string {
        return [
                "# LE ACME challenge",
                "server {",
                "  listen 80;",
                "  listen [::]:80;",
                `  server_name ${domainNames.join(" ")};`,
                "  location /.well-known/acme-challenge/ {",
                `    root ${path.join(DATA_DIR, "letsencrypt-acme-challenge")};`,
                "  }",
                "  location / {",
                "    return 404;",
                "  }",
                "}",
        ].join("\n");
}


// Deploy temporary ACME challenge config, run callback, then clean up
async function withLeRequestConfig(
        certId: number,
        domainNames: string[],
        email: string,
        staging: boolean,
        fn: () => Promise<void>,
): Promise<void> {
        cleanStaleCertbotConfig();
        await ensureLeAccount(email, staging);

        const configPath = path.join(NGINX_DIR, "temp", `letsencrypt-request-${certId}.conf`);
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, generateLeRequestConfig(certId, domainNames));

        try {
                // Wait for the nginx inotify watcher to pick up the new config
                await new Promise((resolve) => setTimeout(resolve, NGINX_RELOAD_WAIT_MS));
                await fn();
        } finally {
                try {
                        fs.unlinkSync(configPath);
                } catch {
                        // non-fatal — temp file cleanup
                }
        }
}

// Request a new Let's Encrypt certificate
export async function requestLetsEncrypt(
        certId: number,
        domainNames: string[],
        email: string,
        staging = LE_STAGING,
): Promise<{ success: boolean; message: string; expiresOn?: string }> {
        try {
                await withLeRequestConfig(certId, domainNames, email, staging, async () => {
                        const args = buildCertbotArgs({
                                domains: domainNames,
                                certName: `npm-${certId}`,
                                email,
                                staging,
                        });
                        const { stdout, stderr } = await execCertbot(args);
                        logger.info("LE certificate obtained:", stdout, stderr);
                });

                const expiresOn = await getLeCertExpiry(certId);
                return { success: true, message: "Certificate obtained successfully", expiresOn };
        } catch (error) {
                const message = (error as Error).message;
                logger.error("LE request failed:", message);

                // Handle rate-limit errors
                const rateMatch = message.match(/retry after\s+([^\s:]+[\d:]+[^\s]*)/i);
                if (message.includes("rateLimited") || message.includes("too many") || message.includes("Rate limit")) {
                        const retryDate = rateMatch ? rateMatch[1] : "24-48 hours";
                        return {
                                success: false,
                                message: `Too many requests for ${domainNames.join(", ")}. Try again after ${retryDate}.`,
                        };
                }

                // Handle ACME protocol errors
                const realErrorMatch = message.match(/(urn:ietf:params:acme:error:[^\n]+)/);
                if (realErrorMatch) {
                        const acmeError = realErrorMatch[1];
                        const descMatch = message.match(/::\s*(.+)/);
                        const desc = descMatch ? descMatch[1].trim() : "";

                        if (acmeError.includes("connection") || acmeError.includes("timeout")) {
                                return { success: false, message: `Could not verify ${domainNames[0]}. Ensure port 80 is open and DNS points to this server.` };
                        }
                        if (acmeError.includes("unauthorized") || acmeError.includes("invalidResponse")) {
                                return { success: false, message: `Verification failed for ${domainNames.join(", ")}. Check DNS and port 80.` };
                        }
                        if (acmeError.includes("rejectedIdentifier")) {
                                return { success: false, message: `Invalid domain: ${domainNames.join(", ")}.` };
                        }
                        return {
                                success: false,
                                message: `Certificate request failed for ${domainNames.join(", ")}.${desc ? " " + desc : ""}`,
                        };
                }

                if (message.includes("Connection refused") || message.includes("timed out")) {
                        return {
                                success: false,
                                message: `Could not connect to Let's Encrypt. Ensure port 80 is open for ${domainNames[0]}.`,
                        };
                }

                if (message.includes("Some challenges have failed")) {
                        return {
                                success: false,
                                message: `Verification failed. Ensure ${domainNames.join(", ")} points to this server and port 80 is open.`
                        };
                }

                if (message.includes("An unexpected error occurred")) {
                        return { success: false, message: `Certificate request failed. Check domain settings.` };
                }

                return { success: false, message: `Certificate request failed for ${domainNames[0]}. Check DNS and port 80.` };
        }
}

// Renew an existing Let's Encrypt certificate
export async function renewCertificate(
        certId: number,
        domainNames: string[],
        email: string,
        staging?: boolean,
): Promise<{ success: boolean; message: string; expiresOn?: string }> {
        const certDir = getCertDir(certId, "letsencrypt");
        if (!fs.existsSync(certDir)) {
                return { success: false, message: "Certificate directory not found" };
        }

        try {
                const useStaging = staging !== undefined ? staging : LE_STAGING;
                await withLeRequestConfig(certId, domainNames, email, useStaging, async () => {
                        const args = buildCertbotArgs({
                                domains: domainNames,
                                certName: `npm-${certId}`,
                                email,
                                forceRenewal: true,
                        });
                        const { stdout, stderr } = await execCertbot(args);
                        logger.info(`Certificate renewed for #${certId}:`, stdout, stderr);
                });

                const expiresOn = await getLeCertExpiry(certId);
                return { success: true, message: "Certificate renewed successfully", expiresOn };
        } catch (error) {
                const message = (error as Error).message;
                logger.error(`Certificate renewal failed for #${certId}:`, message);

                if (message.includes("rateLimited") || message.includes("too many") || message.includes("Rate limit")) {
                        return { success: false, message: "Rate limited by Let's Encrypt. Try again later." };
                }
                if (message.includes("Some challenges have failed") || message.includes("unauthorized") || message.includes("Connection refused")) {
                        return { success: false, message: "Domain verification failed. Check DNS and port 80." };
                }
                if (message.includes("timed out")) {
                        return { success: false, message: "Renewal timed out. Check network." };
                }
                return { success: false, message: "Renewal failed. Try again later." };
        }
}

// Delete a Let's Encrypt certificate via certbot
export async function revokeCertificate(certId: number): Promise<void> {
        const certDir = getCertDir(certId, "letsencrypt");
        if (!fs.existsSync(certDir)) return;

        try {
                const args = ["delete", "--cert-name", `npm-${certId}`, "--non-interactive"];
                await execCertbot(args);
                logger.info(`LE certificate deleted for #${certId}`);
        } catch (err) {
                logger.warn(`Failed to revoke LE cert #${certId}:`, (err as Error).message);
        }
}

// Read certificate expiry date via openssl
async function getLeCertExpiry(certId: number): Promise<string | undefined> {
        try {
                const certFile = `${CERT_LE_DIR}/npm-${certId}/fullchain.pem`;
                const output = await execOpenSsl(["x509", "-in", certFile, "-noout", "-enddate"]);
                const match = output.match(/notAfter=(.+)/);
                return match?.[1]?.trim();
        } catch {
                // return null if openssl fails
                return undefined;
        }
}

// Check if a certificate expires within the given threshold
export async function isCertExpiringSoon(
        certId: number,
        provider?: string | null,
        daysThreshold = 30,
): Promise<boolean> {
        const certPaths = getCertPaths(certId, provider);
        if (!fs.existsSync(certPaths.fullchain)) return true;

        try {
                const enddate = await execOpenSsl(["x509", "-in", certPaths.fullchain, "-noout", "-enddate"]);
                const match = enddate.match(/notAfter=(.+)/);
                if (!match?.[1]) return true;

                const expiryDate = new Date(match[1].trim());
                const diffDays = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                return diffDays <= daysThreshold;
        } catch {
                // treat as non-expiring if check fails
                return true;
        }
}

// Delete certificate files from disk
export async function deleteCertificateFiles(certId: number, provider?: string | null): Promise<void> {
        const certPaths = getCertPaths(certId, provider);
        try {
                if (fs.existsSync(certPaths.dir)) {
                        fs.rmSync(certPaths.dir, { recursive: true, force: true });
                }
        } catch (err) {
                logger.error("Failed to delete cert files:", (err as Error).message);
        }
}

let renewTimer: ReturnType<typeof setInterval> | null = null;

// Start the hourly auto-renewal timer with an immediate first check
export function initTimer(): void {
        if (renewTimer) return;

        renewTimer = setInterval(
                async () => {
                        try {
                                await checkAndRenewCerts();
                        } catch (err) {
                                logger.error("Auto-renewal check failed:", err);
                        }
                },
                60 * 60 * 1000,
        );

        setTimeout(
                () => {
                        checkAndRenewCerts().catch((err) => {
                                logger.error("Initial auto-renewal check failed:", err);
                        });
                },
                5 * 60 * 1000,
        );

        logger.info("Certificate auto-renewal timer started (interval: 1h)");
}

// Scan all LE certs and renew those expiring soon
async function checkAndRenewCerts(): Promise<void> {
        try {
                const rows = db
                        .select()
                        .from(certificates)
                        .where(and(eq(certificates.provider, "letsencrypt"), eq(certificates.isDeleted, 0)))
                        .all();

                if (rows.length === 0) return;

                logger.info(`Checking ${rows.length} LE certificate(s) for renewal...`);

                for (const cert of rows) {
                        try {
                                if (!cert.autoRenew) {
                                        continue;
                                }

                                const domainNames = parseJson<string[]>(cert.domainNames, []);
                                if (domainNames.length === 0) continue;

                                const expiring = await isCertExpiringSoon(cert.id, "letsencrypt", RENEW_BEFORE_DAYS);
                                if (!expiring) continue;

                                logger.info(`Cert #${cert.id} (${domainNames[0]}) is expiring, renewing...`);

                                const meta = parseJson<Record<string, string>>(cert.meta, {});
                                const email = meta.letsencryptEmail || "";
                                if (!email) {
                                        logger.warn(`Cert #${cert.id} has no email in meta, cannot auto-renew`);
                                        continue;
                                }

                                const result = await renewCertificate(cert.id, domainNames, email);
                                if (result.success && result.expiresOn) {
                                        db.update(certificates)
                                                .set({ expiresOn: result.expiresOn, updatedAt: now() })
                                                .where(eq(certificates.id, cert.id))
                                                .run();
                                        logger.info(`Cert #${cert.id} auto-renewed, new expiry: ${result.expiresOn}`);
                                } else {
                                        logger.error(`Cert #${cert.id} auto-renewal failed: ${result.message}`);
                                }
                        } catch (err) {
                                logger.error(`Error processing cert #${cert.id}:`, err);
                        }
                }
        } catch (err) {
                logger.error("Failed to query certificates for renewal:", err);
        }
}
