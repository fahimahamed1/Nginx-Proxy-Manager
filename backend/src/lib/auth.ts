// JWT key management, token creation, and password utilities
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcrypt";
import { SignJWT, exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { db, now, sqlite } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { DATA_DIR } from "../env.ts";
import { logger } from "./utils.ts";

const KEYS_PATH = path.join(DATA_DIR, "keys", "jwk.json");
let privateKey: Awaited<ReturnType<typeof importJWK>> | null = null;
let publicKey: Awaited<ReturnType<typeof importJWK>> | null = null;

// Load existing RSA key pair or generate a new one
export async function initKeys(): Promise<void> {
        if (fs.existsSync(KEYS_PATH)) {
                try {
                        const data = JSON.parse(fs.readFileSync(KEYS_PATH, "utf-8"));
                        privateKey = await importJWK(data.private, "RS256", { extractable: false });
                        publicKey = await importJWK(data.public, "RS256", { extractable: true });
                        return;
                } catch (err) {
                        logger.warn("Failed to load existing keys, generating new ones:", (err as Error).message);
                }
        }

        logger.info("Generating RSA key pair for JWT...");
        const { publicKey: pub, privateKey: priv } = await generateKeyPair("RS256", {
                modulusLength: 2048,
                extractable: true,
        });
        const pubJwk = await exportJWK(pub);
        const privJwk = await exportJWK(priv);
        fs.writeFileSync(KEYS_PATH, JSON.stringify({ public: pubJwk, private: privJwk }, null, 2));
        privateKey = await importJWK(privJwk, "RS256");
        publicKey = await importJWK(pubJwk, "RS256");
        logger.info("RSA key pair generated");
}

// Sign a new JWT with 24h expiration
export async function createToken(payload: { userId: number; email: string; roles: string[] }): Promise<string> {
        if (!privateKey) throw new Error("Keys not initialized");
        return new SignJWT({ ...payload })
                .setProtectedHeader({ alg: "RS256" })
                .setIssuedAt()
                .setExpirationTime("24h")
                .setJti(crypto.randomUUID())
                .sign(privateKey);
}

export interface TokenPayload {
        userId: number;
        email: string;
        roles: string[];
        jti: string;
}

// Verify JWT and return full payload including jti
export async function verifyTokenFull(token: string): Promise<TokenPayload | null> {
        if (!publicKey) throw new Error("Keys not initialized");
        try {
                const { payload } = await jwtVerify(token, publicKey);
                return {
                        userId: (payload.userId as number) || 0,
                        email: (payload.email as string) || "",
                        roles: (payload.roles as string[]) || [],
                        jti: (payload.jti as string) || "",
                };
        } catch {
                return null;
        }
}

// Verify JWT and return user-facing payload (without jti)
async function verifyToken(token: string): Promise<{ userId: number; email: string; roles: string[] } | null> {
        const full = await verifyTokenFull(token);
        if (!full) return null;
        return { userId: full.userId, email: full.email, roles: full.roles };
}

// Extract the jti from a token without additional checks
export async function decodeJti(token: string): Promise<string | null> {
        const full = await verifyTokenFull(token);
        return full?.jti || null;
}

export async function hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
}

// Check if initial admin setup is needed
export function isSetupRequired(): boolean {
        const result = sqlite.prepare("SELECT COUNT(*) as count FROM users WHERE is_deleted = 0").get() as
                | { count: number }
                | undefined;
        return (result?.count ?? 0) === 0;
}
