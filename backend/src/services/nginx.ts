// Nginx config generation and reload
import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { DATA_DIR, DISABLE_IPV6 } from "../env.ts";
import { logger, parseJson, toBool } from "../lib/utils.ts";
import { getCertProvider } from "./certificate.ts";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "templates");
const NGINX_DIR = path.join(DATA_DIR, "nginx");

// Register Handlebars helpers for template rendering
Handlebars.registerHelper("eq", function (this: unknown, a: unknown, b: unknown) {
        const options = arguments[arguments.length - 1] as {
                fn: (ctx: unknown) => string;
                inverse: (ctx: unknown) => string;
        };
        if (typeof options === "object" && options.fn) {
                return a === b ? options.fn(this) : options.inverse(this);
        }
        return a === b;
});

Handlebars.registerHelper("toBool", (val: unknown) => toBool(val as boolean | number | string | null | undefined));

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

// Load and render a Handlebars template by name
function renderTemplate(name: string, ctx: Record<string, unknown>): string {
        let tmpl = templateCache.get(name);
        if (!tmpl) {
                const file = path.join(TEMPLATES_DIR, `${name}.conf`);
                if (!fs.existsSync(file)) throw new Error(`Template not found: ${file}`);
                tmpl = Handlebars.compile(fs.readFileSync(file, "utf-8"));
                templateCache.set(name, tmpl);
        }
        return tmpl(ctx);
}

// Build template context for a proxy host
function buildProxyHostCtx(host: Record<string, unknown>): Record<string, unknown> {
        const certId = Number(host.certificateId || 0);
        const accessListId = Number(host.accessListId || 0);
        const provider = getCertProvider(certId);
        const scheme = (host.forwardScheme as string) || "http";
        const defaultPort = scheme === "https" ? 443 : 80;
        const locations = parseJson<Array<Record<string, unknown>>>(host.locations as string, []);

        return {
                id: host.id,
                domains: parseJson<string[]>(host.domainNames as string, []),
                enabled: toBool(host.enabled),
                forward_scheme: scheme,
                forward_host: host.forwardHost,
                forward_port: host.forwardPort || defaultPort,
                certificate_id: certId,
                has_certificate: certId > 0,
                is_letsencrypt: provider === "letsencrypt",
                ssl_forced: toBool(host.sslForced),
                http2_support: toBool(host.http2Support),
                hsts_enabled: toBool(host.hstsEnabled),
                hsts_subdomains: toBool(host.hstsSubdomains),
                caching_enabled: toBool(host.cachingEnabled),
                block_exploits: toBool(host.blockExploits),
                allow_websocket_upgrade: toBool(host.allowWebsocketUpgrade),
                trust_forwarded_proto: toBool(host.trustForwardedProto),
                access_list_id: accessListId,
                has_access_list: accessListId > 0,
                advanced_config: host.advancedConfig || "",
                locations: locations.map((loc) => {
                        const locScheme = (loc.forwardScheme as string) || "http";
                        const locPort = locScheme === "https" ? 443 : 80;
                        return {
                                path: loc.path || "/",
                                forward_scheme: locScheme,
                                forward_host: loc.forwardHost || "",
                                forward_port: loc.forwardPort || locPort,
                                advanced_config: loc.advancedConfig || "",
                        };
                }),
                use_default_location: locations.length === 0,
                disable_ipv6: DISABLE_IPV6,
        };
}

// Build template context for a dead host (404 sink)
function buildDeadHostCtx(host: Record<string, unknown>): Record<string, unknown> {
        const certId = Number(host.certificateId || 0);
        const provider = getCertProvider(certId);
        return {
                id: host.id,
                domains: parseJson<string[]>(host.domainNames as string, []),
                enabled: toBool(host.enabled),
                certificate_id: certId,
                has_certificate: certId > 0,
                is_letsencrypt: provider === "letsencrypt",
                ssl_forced: toBool(host.sslForced),
                http2_support: toBool(host.http2Support),
                hsts_enabled: toBool(host.hstsEnabled),
                hsts_subdomains: toBool(host.hstsSubdomains),
                advanced_config: host.advancedConfig || "",
                use_default_location: true,
                disable_ipv6: DISABLE_IPV6,
        };
}

// Build template context for a redirection host
function buildRedirHostCtx(host: Record<string, unknown>): Record<string, unknown> {
        const certId = Number(host.certificateId || 0);
        const provider = getCertProvider(certId);
        return {
                id: host.id,
                domains: parseJson<string[]>(host.domainNames as string, []),
                enabled: toBool(host.enabled),
                forward_domain_name: host.forwardDomainName,
                forward_scheme: host.forwardScheme === "auto" ? "$scheme" : host.forwardScheme || "$scheme",
                forward_http_code: host.forwardHttpCode || 302,
                preserve_path: toBool(host.preservePath),
                certificate_id: certId,
                has_certificate: certId > 0,
                is_letsencrypt: provider === "letsencrypt",
                ssl_forced: toBool(host.sslForced),
                http2_support: toBool(host.http2Support),
                hsts_enabled: toBool(host.hstsEnabled),
                hsts_subdomains: toBool(host.hstsSubdomains),
                caching_enabled: false,
                block_exploits: toBool(host.blockExploits),
                advanced_config: host.advancedConfig || "",
                use_default_location: true,
                disable_ipv6: DISABLE_IPV6,
        };
}

// Build template context for a stream (TCP/UDP) host
function buildStreamCtx(host: Record<string, unknown>): Record<string, unknown> {
        return {
                id: host.id,
                incoming_port: host.incomingPort,
                forward_ip: host.forwardIp,
                forwarding_port: host.forwardingPort,
                tcp_forwarding: toBool(host.tcpForwarding),
                udp_forwarding: toBool(host.udpForwarding),
                enabled: toBool(host.enabled),
                advanced_config: host.advancedConfig || "",
                disable_ipv6: DISABLE_IPV6,
        };
}

// Render proxy host config from template
export function generateHostConfig(hostType: string, host: Record<string, unknown>): string {
        const builders: Record<string, (h: Record<string, unknown>) => Record<string, unknown>> = {
                proxy_host: buildProxyHostCtx,
                dead_host: buildDeadHostCtx,
                redirection_host: buildRedirHostCtx,
                stream: buildStreamCtx,
        };
        const builder = builders[hostType];
        if (!builder) throw new Error(`Unknown host type: ${hostType}`);
        return renderTemplate(hostType, builder(host));
}

// Get the filesystem path for a host's nginx config
export function getConfigPath(hostType: string, id: number): string {
        return path.join(NGINX_DIR, hostType, `${id}.conf`);
}

// Write host config to disk (the nginx inotify watcher will validate and reload)
export async function configureHost(hostType: string, host: Record<string, unknown>): Promise<void> {
        const configPath = getConfigPath(hostType, Number(host.id));
        fs.mkdirSync(path.dirname(configPath), { recursive: true });

        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

        const config = generateHostConfig(hostType, host);
        fs.writeFileSync(configPath, config);
        logger.info(`Nginx config written: ${hostType} #${host.id}`);
}

// Remove a host's nginx config file (the nginx inotify watcher will reload)
export async function deleteConfig(hostType: string, id: number): Promise<void> {
        const configPath = getConfigPath(hostType, id);
        if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
                logger.info(`Nginx config deleted: ${hostType} #${id}`);
        }
}

// Generate the default catch-all site config
export async function generateDefaultConfig(value: string, meta?: Record<string, unknown>): Promise<void> {
        const configDir = path.join(NGINX_DIR, "default_host");
        fs.mkdirSync(configDir, { recursive: true });

        if (meta?.html_content) {
                fs.writeFileSync(path.join(configDir, "index.html"), meta.html_content as string);
        }

        const redirectUrl = (meta?.redirect_url as string) || "";
        const config = renderTemplate("default", {
                mode: value || "congratulations",
                redirect_url: redirectUrl,
                disable_ipv6: DISABLE_IPV6,
        });

        fs.writeFileSync(path.join(configDir, "site.conf"), config);
        logger.info(`Default site config generated (mode: ${value})`);
}

const DEFAULT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Congratulations!</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f7fa; color: #333; }
  .card { text-align: center; padding: 3rem 2.5rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); background: #fff; max-width: 480px; }
  h1 { font-size: 1.8rem; margin-bottom: .5rem; }
  p { color: #666; line-height: 1.6; }
</style>
</head>
<body>
<div class="card">
  <h1>&#127881; Congratulations!</h1>
  <p>Nginx Proxy Manager is running.<br>If you see this page, the reverse proxy is working.</p>
</div>
</body>
</html>`;

// Set up the default congratulations page
export async function setupDefaults(): Promise<void> {
        await generateDefaultConfig("congratulations", { html_content: DEFAULT_INDEX_HTML });
}
