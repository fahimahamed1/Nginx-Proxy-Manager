// SQLite database connection and Drizzle ORM setup
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DATABASE_URL } from "../env.ts";
import * as schema from "./schema.ts";

fs.mkdirSync(path.dirname(DATABASE_URL), { recursive: true });

const sqlite = new Database(DATABASE_URL);
try {
        sqlite.pragma("journal_mode = WAL");
} catch {
        // non-fatal — WAL mode is optional
}
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Return current UTC timestamp as ISO string
export function now(): string {
        return new Date().toISOString();
}
