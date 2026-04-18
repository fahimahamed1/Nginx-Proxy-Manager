// Shared utility functions: logging, type conversion, exec helpers, audit logging
import { execFile, execFileSync } from "node:child_process";
import { db, now } from "../db/index.ts";
import { auditLog } from "../db/schema.ts";
import { EXEC_TIMEOUT_MS, EXEC_MAX_BUFFER, SYNC_EXEC_TIMEOUT_MS } from "./constants.ts";

export const logger = {
        info: (...args: unknown[]) => console.log(`[INFO]  ${new Date().toISOString()}`, ...args),
        warn: (...args: unknown[]) => console.warn(`[WARN]  ${new Date().toISOString()}`, ...args),
        error: (...args: unknown[]) => console.error(`[ERROR] ${new Date().toISOString()}`, ...args),
        debug: (...args: unknown[]) => {
                if (process.env.NODE_ENV === "development") {
                        console.log(`[DEBUG] ${new Date().toISOString()}`, ...args);
                }
        },
};

// Convert various types to boolean
export function toBool(val: unknown): boolean {
        if (typeof val === "boolean") return val;
        if (typeof val === "number") return val === 1;
        if (typeof val === "string") return val === "1" || val === "true";
        return false;
}

export function fromBool(val: boolean): number {
        return val ? 1 : 0;
}

// Safely parse JSON with a fallback value
export function parseJson<T = unknown>(str: string | null | undefined, fallback: T): T {
        if (!str) return fallback;
        try {
                return JSON.parse(str) as T;
        } catch {
                // return fallback value on parse error
                return fallback;
        }
}

// Async command execution with large buffer
export function execSafe(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
                execFile(cmd, args, { maxBuffer: EXEC_MAX_BUFFER, timeout: EXEC_TIMEOUT_MS }, (err, stdout, stderr) => {
                        if (err) reject(err);
                        else resolve({ stdout, stderr });
                });
        });
}

// Synchronous command execution
export function execSafeSync(cmd: string, args: string[]): { stdout: string; stderr: string } {
        try {
                const stdout = execFileSync(cmd, args, { encoding: "utf-8", timeout: SYNC_EXEC_TIMEOUT_MS }) as string;
                return { stdout, stderr: "" };
        } catch (err) {
                throw new Error(`Command failed: ${cmd} ${args.join(" ")} — ${(err as Error).message}`);
        }
}

// Stringify any value, returning "{}" on failure
function safeJsonStringify(val: unknown): string {
        try {
                return JSON.stringify(val);
        } catch {
                // return empty object on stringify error
                return "{}";
        }
}

// Insert a row into the audit_log table
export function addAuditLog(
        userId: number,
        action: string,
        objectType: string,
        objectId: number,
        meta: Record<string, unknown> = {},
): void {
        try {
                db.insert(auditLog)
                        .values({
                                userId,
                                action,
                                objectType,
                                objectId,
                                meta: safeJsonStringify(meta),
                                createdAt: now(),
                        } as any)
                        .run();
        } catch (err) {
                logger.error("Audit log failed:", (err as Error).message);
        }
}

export function getBearerToken(c: any): string {
        const h = c.req.header("Authorization");
        return h?.startsWith("Bearer ") ? h.slice(7) : "";
}

export function getClientIp(c: any): string {
        return c.req.header("X-Forwarded-For")?.split(",")[0]?.trim()
                || c.req.header("X-Real-IP")
                || "";
}

// Escape special characters for SQL LIKE patterns
export function escapeLike(str: string): string {
        return str.replace(/[%_\\]/g, '\\$&');
}
