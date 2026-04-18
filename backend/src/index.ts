// Application entry point
import "dotenv/config";
import { app } from "./app.ts";
import { migrateDatabase } from "./db/migrate.ts";
import { APP_VERSION, PORT } from "./env.ts";
import { initKeys } from "./lib/auth.ts";
import { logger } from "./lib/utils.ts";
import { MAX_STARTUP_RETRIES, STARTUP_RETRY_DELAY_MS } from "./lib/constants.ts";
import { initTimer as initCertTimer } from "./services/certificate.ts";
import { fetchIpRanges, initTimer as initIpRangesTimer } from "./services/ip-ranges.ts";
import { setupDefaults } from "./services/nginx.ts";

let server: any = null;

async function bootstrap() {
        logger.info(`Starting Nginx Proxy Manager v${APP_VERSION}...`);
        await initKeys();
        logger.info("JWT keys initialized");
        await migrateDatabase();
        logger.info("Database ready");

        try {
                await setupDefaults();
                logger.info("Nginx defaults configured");
        } catch (err) {
                logger.warn("Nginx setup skipped:", (err as Error).message);
        }

        initCertTimer();
        initIpRangesTimer();

        process.on("SIGTERM", async () => {
                logger.info("Shutting down...");
                if (server) server.close();
                process.exit(0);
        });
        process.on("SIGINT", async () => {
                logger.info("Shutting down...");
                if (server) server.close();
                process.exit(0);
        });
}

// Retry loop for initial startup
async function start() {
        let retries = 0;
        while (retries < MAX_STARTUP_RETRIES) {
                try {
                        await bootstrap();
                        const { serve } = await import("@hono/node-server");
                        logger.info(`Listening on port ${PORT}`);
                        server = serve({ fetch: app.fetch, port: PORT });
                        return;
                } catch (err) {
                        retries++;
                        logger.error(`Attempt ${retries}/${MAX_STARTUP_RETRIES} failed:`, (err as Error).message);
                        if (retries >= MAX_STARTUP_RETRIES) {
                                logger.error("Max retries reached");
                                process.exit(1);
                        }
                        await new Promise((r) => setTimeout(r, STARTUP_RETRY_DELAY_MS));
                }
        }
}

start();
