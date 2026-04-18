// Hono application setup with routes and middleware
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as httpLogger } from "hono/logger";
import { APP_VERSION } from "./env.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { rateLimit } from "./middleware/rate-limit.ts";
import { accessListRoutes } from "./routes/access-lists.ts";
import { auditLogRoutes } from "./routes/audit-log.ts";
import { authRoutes } from "./routes/auth.ts";
import { certificateRoutes } from "./routes/certificates.ts";
import { deadHostRoutes } from "./routes/dead-hosts.ts";
import { healthRoutes } from "./routes/health.ts";
import { proxyHostRoutes } from "./routes/proxy-hosts.ts";
import { redirectionHostRoutes } from "./routes/redirection-hosts.ts";
import { reportRoutes } from "./routes/reports.ts";
import { settingRoutes } from "./routes/settings.ts";
import { streamRoutes } from "./routes/streams.ts";
import { tokenRoutes } from "./routes/tokens.ts";
import { userRoutes } from "./routes/users.ts";

export const app = new Hono();

// CORS configuration
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
	? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
	: ["http://localhost:3000"];
const ALLOW_ALL = ALLOWED_ORIGINS.length === 1 && ALLOWED_ORIGINS[0] === "*";

app.use(
	"*",
	cors({
		origin: ALLOW_ALL ? "*" : (origin) => (!origin || ALLOWED_ORIGINS.includes(origin) ? origin : undefined),
		credentials: true,
		exposeHeaders: ["X-Dataset-Total", "X-Dataset-Offset", "X-Dataset-Limit"],
	}),
);

app.use("*", httpLogger());

// Security headers
app.use("*", async (c, next) => {
	await next();
	c.header("X-Content-Type-Options", "nosniff");
	c.header("X-Frame-Options", "SAMEORIGIN");
	c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

app.onError(errorHandler);

// Public routes
app.route("/api/health", healthRoutes);
app.route("/api/auth", authRoutes);
app.get("/api/", (c) => c.json({ status: "OK", version: APP_VERSION }));

// Protected routes (require authentication and rate limiting)
const protectedApi = new Hono();
protectedApi.use("*", rateLimit({ windowMs: 60_000, maxRequests: 60 }, "api"));
protectedApi.use("*", authMiddleware);
protectedApi.route("/health/dashboard", healthRoutes);
protectedApi.route("/proxy-hosts", proxyHostRoutes);
protectedApi.route("/redirection-hosts", redirectionHostRoutes);
protectedApi.route("/dead-hosts", deadHostRoutes);
protectedApi.route("/streams", streamRoutes);
protectedApi.route("/certificates", certificateRoutes);
protectedApi.route("/access-lists", accessListRoutes);
protectedApi.route("/users", userRoutes);
protectedApi.route("/settings", settingRoutes);
protectedApi.route("/audit-log", auditLogRoutes);
protectedApi.route("/reports", reportRoutes);
protectedApi.route("/tokens", tokenRoutes);

app.route("/api", protectedApi);
app.notFound((c) => c.json({ error: { message: "Not found", code: 404 } }, 404));
