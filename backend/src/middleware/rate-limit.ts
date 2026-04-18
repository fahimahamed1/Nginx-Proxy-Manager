// In-memory rate limiting middleware
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/types.ts";

interface RateLimitEntry {
	count: number;
	resetAt: number;
	timer?: ReturnType<typeof setTimeout>;
}

interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
}

const store = new Map<string, RateLimitEntry>();

function scheduleExpiry(key: string, ttlMs: number): void {
	const entry = store.get(key);
	if (!entry) return;
	if (entry.timer) clearTimeout(entry.timer);
	entry.timer = setTimeout(() => {
		store.delete(key);
	}, ttlMs);
	// Don't prevent process exit on this timer
	if (entry.timer.unref) entry.timer.unref();
}

function getKey(ip: string, endpoint: string): string {
	return `${ip}:${endpoint}`;
}

export function rateLimit(config: RateLimitConfig, keyPrefix = "") {
	return createMiddleware<AppEnv>(async (c, next) => {
		const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
		const path = c.req.path;

		const endpoint = keyPrefix || path;
		const key = getKey(ip, endpoint);
		const now = Date.now();

		let entry = store.get(key);
		if (!entry || entry.resetAt <= now) {
			entry = { count: 0, resetAt: now + config.windowMs };
			store.set(key, entry);
			scheduleExpiry(key, config.windowMs);
		}

		entry.count++;
		const remaining = Math.max(0, config.maxRequests - entry.count);
		const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

		c.header("X-RateLimit-Limit", String(config.maxRequests));
		c.header("X-RateLimit-Remaining", String(remaining));
		c.header("X-RateLimit-Reset", String(retryAfter));

		if (entry.count > config.maxRequests) {
			return c.json(
				{ error: { message: "Too many requests", code: 429 } },
				429,
				{ "Retry-After": String(retryAfter) },
			);
		}

		await next();
	});
}
