// htpasswd file generation for access list auth
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { accessListAuth } from "../db/schema.ts";
import { DATA_DIR } from "../env.ts";
import { execSafeSync, logger } from "../lib/utils.ts";

// Build or regenerate the htpasswd file for an access list
export function buildHtpasswd(accessListId: number): void {
        const htpasswdPath = path.join(DATA_DIR, "access", `${accessListId}.htpasswd`);

        const items = db.select().from(accessListAuth).where(eq(accessListAuth.accessListId, accessListId)).all();

        if (items.length === 0) {
                if (fs.existsSync(htpasswdPath)) fs.unlinkSync(htpasswdPath);
                return;
        }

        const lines: string[] = [];

        for (const item of items) {
                // If password is masked, preserve existing hash from file
                if (!item.password || item.password === "••••••••") {
                        try {
                                const content = fs.existsSync(htpasswdPath) ? fs.readFileSync(htpasswdPath, "utf-8") : "";
                                const escaped = item.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                                const match = content.match(new RegExp(`^${escaped}:(.+)$`, "m"));
                                if (match) {
                                        lines.push(`${item.username}:${match[1]}`);
                                        continue;
                                }
                        } catch {
                                // file doesn't exist yet — start fresh
                        }
                }

                // Hash the password with openssl apr1
                try {
                        const { stdout } = execSafeSync("openssl", ["passwd", "-apr1", item.password]);
                        if (stdout.trim()) {
                                lines.push(`${item.username}:${stdout.trim()}`);
                        } else {
                                logger.warn(`Empty hash for user ${item.username}`);
                                lines.push(`${item.username}:${item.password}`);
                        }
                } catch (err) {
                        logger.warn(`Hash generation failed for ${item.username}:`, (err as Error).message);
                        lines.push(`${item.username}:${item.password}`);
                }
        }

        fs.mkdirSync(path.dirname(htpasswdPath), { recursive: true });
        fs.writeFileSync(htpasswdPath, `${lines.join("\n")}\n`, { mode: 0o644 });
        logger.info(`htpasswd file built for access list #${accessListId}`);
}
