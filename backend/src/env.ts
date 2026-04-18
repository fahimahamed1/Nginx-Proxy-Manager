// Environment configuration and data directory setup
import fs from "node:fs";
import path from "node:path";

const BACKEND_ROOT = path.resolve(import.meta.dirname, "..");

export const DATA_DIR = fs.existsSync("/data/nginx") ? "/data" : path.resolve(BACKEND_ROOT, "data");

export const APP_VERSION = process.env.APP_VERSION || (() => {
        const vf = path.resolve(BACKEND_ROOT, "../.version");
        try { return fs.readFileSync(vf, "utf-8").trim(); } catch { return "0.0.0"; }
})();
export const DATABASE_URL = path.join(DATA_DIR, "database.sqlite");
export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const IS_DEV = NODE_ENV === "development";
export const LE_STAGING = process.env.LE_STAGING === "true";
export const LE_SERVER = process.env.LE_SERVER || "";
export const DISABLE_IPV6 = process.env.DISABLE_IPV6 === "true";

// Ensure all required data directories exist
const DIRS = [
        DATA_DIR,
        `${DATA_DIR}/nginx/proxy_host`,
        `${DATA_DIR}/nginx/redirection_host`,
        `${DATA_DIR}/nginx/dead_host`,
        `${DATA_DIR}/nginx/stream`,
        `${DATA_DIR}/nginx/default_host`,
        `${DATA_DIR}/nginx/default_www`,
        `${DATA_DIR}/nginx/temp`,
        `${DATA_DIR}/nginx/custom`,
        `${DATA_DIR}/access`,
        `${DATA_DIR}/custom_ssl`,
        `${DATA_DIR}/letsencrypt-acme-challenge`,
        `${DATA_DIR}/logs`,
        `${DATA_DIR}/keys`,
];

for (const dir of DIRS) {
        try {
                fs.mkdirSync(dir, { recursive: true });
        } catch {
                // non-fatal — directory may already exist
        }
}
