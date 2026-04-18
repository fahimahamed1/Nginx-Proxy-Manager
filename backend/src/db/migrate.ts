// Database schema creation and migration
import { logger } from "../lib/utils.ts";
import { sqlite } from "./index.ts";
import { now } from "./index.ts";

export async function migrateDatabase(): Promise<void> {
	logger.info("Running database migration...");

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			nickname TEXT NOT NULL DEFAULT '',
			avatar TEXT NOT NULL DEFAULT '',
			roles TEXT NOT NULL DEFAULT '["user"]',
			is_deleted INTEGER NOT NULL DEFAULT 0,
			is_disabled INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS user_permissions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
			visibility TEXT NOT NULL DEFAULT 'user',
			proxy_hosts TEXT NOT NULL DEFAULT 'manage',
			redirection_hosts TEXT NOT NULL DEFAULT 'manage',
			dead_hosts TEXT NOT NULL DEFAULT 'manage',
			streams TEXT NOT NULL DEFAULT 'manage',
			access_lists TEXT NOT NULL DEFAULT 'manage',
			certificates TEXT NOT NULL DEFAULT 'manage',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS auth (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			type TEXT NOT NULL DEFAULT 'password',
			secret TEXT NOT NULL,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS proxy_hosts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			domain_names TEXT NOT NULL DEFAULT '[]',
			forward_host TEXT NOT NULL,
			forward_port INTEGER NOT NULL,
			forward_scheme TEXT NOT NULL DEFAULT 'http',
			allow_websocket_upgrade INTEGER NOT NULL DEFAULT 0,
			access_list_id INTEGER NOT NULL DEFAULT 0,
			certificate_id INTEGER NOT NULL DEFAULT 0,
			ssl_forced INTEGER NOT NULL DEFAULT 0,
			caching_enabled INTEGER NOT NULL DEFAULT 0,
			block_exploits INTEGER NOT NULL DEFAULT 1,
			http2_support INTEGER NOT NULL DEFAULT 0,
			hsts_enabled INTEGER NOT NULL DEFAULT 0,
			hsts_subdomains INTEGER NOT NULL DEFAULT 0,
			enabled INTEGER NOT NULL DEFAULT 1,
			trust_forwarded_proto INTEGER NOT NULL DEFAULT 0,
			advanced_config TEXT NOT NULL DEFAULT '',
			locations TEXT NOT NULL DEFAULT '[]',
			meta TEXT NOT NULL DEFAULT '{}',
			is_deleted INTEGER NOT NULL DEFAULT 0,
			owner_user_id INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS redirection_hosts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			domain_names TEXT NOT NULL DEFAULT '[]',
			forward_domain_name TEXT NOT NULL,
			forward_scheme TEXT NOT NULL DEFAULT 'auto',
			forward_http_code INTEGER NOT NULL DEFAULT 302,
			preserve_path INTEGER NOT NULL DEFAULT 1,
			certificate_id INTEGER NOT NULL DEFAULT 0,
			ssl_forced INTEGER NOT NULL DEFAULT 0,
			block_exploits INTEGER NOT NULL DEFAULT 1,
			http2_support INTEGER NOT NULL DEFAULT 0,
			hsts_enabled INTEGER NOT NULL DEFAULT 0,
			hsts_subdomains INTEGER NOT NULL DEFAULT 0,
			enabled INTEGER NOT NULL DEFAULT 1,
			advanced_config TEXT NOT NULL DEFAULT '',
			meta TEXT NOT NULL DEFAULT '{}',
			is_deleted INTEGER NOT NULL DEFAULT 0,
			owner_user_id INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS dead_hosts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			domain_names TEXT NOT NULL DEFAULT '[]',
			certificate_id INTEGER NOT NULL DEFAULT 0,
			ssl_forced INTEGER NOT NULL DEFAULT 0,
			http2_support INTEGER NOT NULL DEFAULT 0,
			hsts_enabled INTEGER NOT NULL DEFAULT 0,
			hsts_subdomains INTEGER NOT NULL DEFAULT 0,
			enabled INTEGER NOT NULL DEFAULT 1,
			advanced_config TEXT NOT NULL DEFAULT '',
			meta TEXT NOT NULL DEFAULT '{}',
			is_deleted INTEGER NOT NULL DEFAULT 0,
			owner_user_id INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS streams (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			incoming_port INTEGER NOT NULL,
			forward_ip TEXT NOT NULL,
			forwarding_port INTEGER NOT NULL,
			tcp_forwarding INTEGER NOT NULL DEFAULT 1,
			udp_forwarding INTEGER NOT NULL DEFAULT 0,
			enabled INTEGER NOT NULL DEFAULT 1,
			advanced_config TEXT NOT NULL DEFAULT '',
			meta TEXT NOT NULL DEFAULT '{}',
			is_deleted INTEGER NOT NULL DEFAULT 0,
			owner_user_id INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS access_lists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			is_deleted INTEGER NOT NULL DEFAULT 0,
			owner_user_id INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS access_list_auth (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			access_list_id INTEGER NOT NULL REFERENCES access_lists(id) ON DELETE CASCADE,
			username TEXT NOT NULL,
			password TEXT NOT NULL,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS certificates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			provider TEXT NOT NULL,
			nice_name TEXT NOT NULL DEFAULT '',
			domain_names TEXT NOT NULL DEFAULT '[]',
			expires_on TEXT NOT NULL,
			meta TEXT NOT NULL DEFAULT '{}',
			auto_renew INTEGER NOT NULL DEFAULT 1,
			is_deleted INTEGER NOT NULL DEFAULT 0,
			owner_user_id INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS settings (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			value TEXT NOT NULL DEFAULT '',
			meta TEXT NOT NULL DEFAULT '{}'
		);

		CREATE TABLE IF NOT EXISTS audit_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			action TEXT NOT NULL,
			object_type TEXT NOT NULL,
			object_id INTEGER NOT NULL,
			meta TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_proxy_hosts_deleted ON proxy_hosts(is_deleted);
		CREATE INDEX IF NOT EXISTS idx_redirection_hosts_deleted ON redirection_hosts(is_deleted);
		CREATE INDEX IF NOT EXISTS idx_dead_hosts_deleted ON dead_hosts(is_deleted);
		CREATE INDEX IF NOT EXISTS idx_streams_deleted ON streams(is_deleted);
		CREATE INDEX IF NOT EXISTS idx_certificates_deleted ON certificates(is_deleted);
		CREATE INDEX IF NOT EXISTS idx_access_lists_deleted ON access_lists(is_deleted);
		CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
	`);

	// Seed default site setting
	const defaultSiteExists = sqlite
		.prepare("SELECT id FROM settings WHERE id IN ('default-site', 'default_site')")
		.get();
	if (!defaultSiteExists) {
		sqlite
			.prepare("INSERT INTO settings (id, name, description, value, meta) VALUES (?, ?, ?, ?, ?)")
			.run(
				"default_site",
				"Default Site",
				"What to show when Nginx is hit with an unknown Host",
				"congratulations",
				"{}",
			);
	} else {
		sqlite.prepare("UPDATE settings SET id = 'default_site' WHERE id = 'default-site'").run();
	}

	// Add auto_renew column to certificates if missing
	try {
		const certCols = sqlite.prepare("PRAGMA table_info(certificates)").all() as Array<{ name: string }>;
		if (!certCols.some((c) => c.name === "auto_renew")) {
			sqlite.exec("ALTER TABLE certificates ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 1");
			logger.info("Added auto_renew column to certificates table");
		}
	} catch (err) {
		logger.warn("Failed to add auto_renew column (may already exist):", (err as Error).message);
	}

	logger.info("Database migration complete");
}
