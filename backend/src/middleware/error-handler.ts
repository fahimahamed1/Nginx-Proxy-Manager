// Global error handler middleware
import type { ErrorHandler } from "hono";
import { logger } from "../lib/utils.ts";

export const errorHandler: ErrorHandler = (err, c) => {
	const status = "status" in err ? (err.status as number) : 500;
	const fallbacks: Record<number, string> = {
		400: "Invalid request.",
		401: "Sign in required.",
		403: "Access denied.",
		404: "Not found.",
	};
	const message = err.message || fallbacks[status] || "Something went wrong.";
	if (status >= 500) logger.error(`[ERROR] ${err.message}`, err.stack);
	return c.json({ error: { message, code: status } }, status as 400 | 401 | 403 | 404 | 500);
};
