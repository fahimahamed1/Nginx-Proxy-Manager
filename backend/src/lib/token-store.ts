// In-memory token store for session management and revocation
export interface TokenEntry {
	userId: number;
	expiresAt: number;
	createdAt: string;
	userAgent: string;
	ipAddress: string;
	lastUsed: string;
}

export const tokenStore = new Map<string, TokenEntry>();

const CLEANUP_INTERVAL = 5 * 60_000;
let lastCleanup = Date.now();

// Remove expired tokens from the store
export function cleanupTokenStore(): void {
	const now = Date.now();
	if (now - lastCleanup < CLEANUP_INTERVAL) return;
	lastCleanup = now;
	for (const [jti, entry] of tokenStore) {
		if (entry.expiresAt <= now) tokenStore.delete(jti);
	}
}

export function storeToken(jti: string, userId: number, expiresAt: number, userAgent: string = "", ipAddress: string = ""): void {
	cleanupTokenStore();
	const now = new Date().toISOString();
	tokenStore.set(jti, {
		userId,
		expiresAt,
		createdAt: now,
		userAgent,
		ipAddress,
		lastUsed: now,
	});
}

export function revokeToken(jti: string): boolean {
	return tokenStore.delete(jti);
}

// Revoke all active tokens for a user, return count revoked
export function revokeAllUserTokens(userId: number): number {
	let count = 0;
	for (const [jti, entry] of tokenStore) {
		if (entry.userId === userId) {
			tokenStore.delete(jti);
			count++;
		}
	}
	return count;
}

// List all active tokens for a user
export function getUserTokens(userId: number): { jti: string; createdAt: string; expiresAt: number; userAgent: string; ipAddress: string; lastUsed: string }[] {
	cleanupTokenStore();
	const tokens: { jti: string; createdAt: string; expiresAt: number; userAgent: string; ipAddress: string; lastUsed: string }[] = [];
	for (const [jti, entry] of tokenStore) {
		if (entry.userId === userId) {
			tokens.push({ jti, createdAt: entry.createdAt, expiresAt: entry.expiresAt, userAgent: entry.userAgent, ipAddress: entry.ipAddress, lastUsed: entry.lastUsed });
		}
	}
	return tokens;
}

// Check if a token is still valid and belongs to the expected user
export function isTokenValid(jti: string, userId: number): boolean {
	cleanupTokenStore();
	const entry = tokenStore.get(jti);
	if (!entry) return false;
	if (entry.expiresAt <= Date.now()) {
		tokenStore.delete(jti);
		return false;
	}
	return entry.userId === userId;
}

// Update lastUsed timestamp without modifying other fields
export function touchToken(jti: string): void {
	const entry = tokenStore.get(jti);
	if (entry) {
		entry.lastUsed = new Date().toISOString();
	}
}
