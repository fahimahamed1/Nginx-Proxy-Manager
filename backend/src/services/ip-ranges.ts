// CloudFront and Cloudflare IP range fetching
import fs from "node:fs";
import path from "node:path";
import { logger } from "../lib/utils.ts";
import { IP_FETCH_TIMEOUT_MS } from "../lib/constants.ts";

const CLOUDFRONT_URL = "https://ip-ranges.amazonaws.com/ip-ranges.json";
const CLOUDFLARE_V4_URL = "https://www.cloudflare.com/ips-v4";
const CLOUDFLARE_V6_URL = "https://www.cloudflare.com/ips-v6";
const CONFIG_PATH = "/etc/nginx/conf.d/include/ip_ranges.conf";

async function fetchUrl(url: string): Promise<string> {
        try {
                const response = await fetch(url, { signal: AbortSignal.timeout(IP_FETCH_TIMEOUT_MS) });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.text();
        } catch (err) {
                logger.warn(`Failed to fetch ${url}:`, (err as Error).message);
                return "";
        }
}

// Extract CloudFront CIDR ranges from AWS JSON
async function fetchCloudFrontIps(): Promise<string[]> {
        try {
                const text = await fetchUrl(CLOUDFRONT_URL);
                if (!text) return [];
                const data = JSON.parse(text) as {
                        prefixes?: Array<{ ip_prefix: string; service: string }>;
                        ipv6_prefixes?: Array<{ ipv6_prefix: string; service: string }>;
                };
                const ips: string[] = [];
                for (const entry of data.prefixes || []) {
                        if (entry.service === "CLOUDFRONT") ips.push(entry.ip_prefix);
                }
                for (const entry of data.ipv6_prefixes || []) {
                        if (entry.service === "CLOUDFRONT") ips.push(entry.ipv6_prefix);
                }
                return ips;
        } catch {
                // return empty array if JSON parse fails
                return [];
        }
}

// Fetch Cloudflare IPv4 and IPv6 ranges in parallel
async function fetchCloudflareIps(): Promise<string[]> {
        const [cfV4, cfV6] = await Promise.all([fetchUrl(CLOUDFLARE_V4_URL), fetchUrl(CLOUDFLARE_V6_URL)]);
        const ips: string[] = [];
        for (const line of cfV4.trim().split("\n")) {
                const ip = line.trim();
                if (ip) ips.push(ip);
        }
        for (const line of cfV6.trim().split("\n")) {
                const ip = line.trim();
                if (ip) ips.push(ip);
        }
        return ips;
}

// Fetch both providers and write nginx set_real_ip_from directives
export async function fetchIpRanges(): Promise<void> {
        try {
                const [cloudFrontIps, cloudflareIps] = await Promise.all([fetchCloudFrontIps(), fetchCloudflareIps()]);

                const lines: string[] = ["# Auto-generated IP ranges — CloudFront & Cloudflare", ""];

                if (cloudFrontIps.length > 0) {
                        lines.push("# CloudFront");
                        for (const ip of cloudFrontIps) lines.push(`set_real_ip_from ${ip};`);
                        lines.push("");
                }

                if (cloudflareIps.length > 0) {
                        lines.push("# Cloudflare");
                        for (const ip of cloudflareIps) lines.push(`set_real_ip_from ${ip};`);
                        lines.push("");
                }

                fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
                fs.writeFileSync(CONFIG_PATH, lines.join("\n"));
                logger.info(`IP ranges updated (${cloudFrontIps.length} CloudFront + ${cloudflareIps.length} Cloudflare)`);
        } catch (err) {
                logger.error("Failed to fetch IP ranges:", err);
        }
}

let ipRangeTimer: ReturnType<typeof setInterval> | null = null;

// Start the 6-hourly IP ranges refresh timer
export function initTimer(): void {
        if (ipRangeTimer) return;

        fetchIpRanges().catch((err) => {
                logger.error("Initial IP ranges fetch failed:", err);
        });

        ipRangeTimer = setInterval(
                async () => {
                        try {
                                await fetchIpRanges();
                        } catch (err) {
                                logger.error("Periodic IP ranges refresh failed:", err);
                        }
                },
                6 * 60 * 60 * 1000,
        );

        logger.info("IP ranges refresh timer started (interval: 6h)");
}
