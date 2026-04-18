// Domain overlap detection across proxy, redirection, and dead hosts
import { db } from "../db/index.ts";
import { proxyHosts, redirectionHosts, deadHosts } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { parseJson } from "./utils.ts";

interface DomainOverlap {
        domain: string;
        type: string;
        hostId: number;
}

interface HostRow {
        id: number;
        domainNames: string;
        isDeleted: number;
}

// Return an error string if any domain is already in use, or null
export function domainOverlapError(domains: string[], excludeId?: number): string | null {
        const overlaps = checkDomainOverlap(domains, excludeId);
        if (overlaps.length === 0) return null;
        const details = overlaps.map((o) => `${o.domain} (${o.type} #${o.hostId})`).join(", ");
        return `Domain(s) already in use: ${details}`;
}

// Check all host tables for overlapping domains
function checkDomainOverlap(
        domains: string[],
        excludeId?: number,
): DomainOverlap[] {
        const newDomains = new Set(domains.map(d => d.toLowerCase()));
        const overlaps: DomainOverlap[] = [];

        const tables: { type: string; rows: HostRow[] }[] = [
                {
                        type: "proxy_host",
                        rows: db
                                .select({ id: proxyHosts.id, domainNames: proxyHosts.domainNames, isDeleted: proxyHosts.isDeleted })
                                .from(proxyHosts)
                                .where(eq(proxyHosts.isDeleted, 0))
                                .all() as HostRow[],
                },
                {
                        type: "redirection_host",
                        rows: db
                                .select({ id: redirectionHosts.id, domainNames: redirectionHosts.domainNames, isDeleted: redirectionHosts.isDeleted })
                                .from(redirectionHosts)
                                .where(eq(redirectionHosts.isDeleted, 0))
                                .all() as HostRow[],
                },
                {
                        type: "dead_host",
                        rows: db
                                .select({ id: deadHosts.id, domainNames: deadHosts.domainNames, isDeleted: deadHosts.isDeleted })
                                .from(deadHosts)
                                .where(eq(deadHosts.isDeleted, 0))
                                .all() as HostRow[],
                },
        ];

        for (const { type, rows } of tables) {
                for (const row of rows) {
                        if (excludeId && row.id === excludeId) continue;
                        const existing = parseJson<string[]>(row.domainNames, []);
                        for (const d of existing) {
                                if (newDomains.has(d.toLowerCase())) {
                                        overlaps.push({ domain: d, type, hostId: row.id });
                                }
                        }
                }
        }

        return overlaps;
}
