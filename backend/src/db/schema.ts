// Drizzle ORM table schema definitions
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	nickname: text("nickname").notNull().default(""),
	avatar: text("avatar").notNull().default(""),
	roles: text("roles").notNull().default('["user"]'),
	isDeleted: integer("is_deleted").notNull().default(0),
	isDisabled: integer("is_disabled").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const userPermissions = sqliteTable("user_permissions", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" })
		.unique(),
	visibility: text("visibility").notNull().default("user"),
	proxyHosts: text("proxy_hosts").notNull().default("manage"),
	redirectionHosts: text("redirection_hosts").notNull().default("manage"),
	deadHosts: text("dead_hosts").notNull().default("manage"),
	streams: text("streams").notNull().default("manage"),
	accessLists: text("access_lists").notNull().default("manage"),
	certificates: text("certificates").notNull().default("manage"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const auth = sqliteTable("auth", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	type: text("type").notNull().default("password"),
	secret: text("secret").notNull(),
	createdAt: text("created_at").notNull(),
});

export const proxyHosts = sqliteTable("proxy_hosts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	domainNames: text("domain_names").notNull().default("[]"),
	forwardHost: text("forward_host").notNull(),
	forwardPort: integer("forward_port").notNull(),
	forwardScheme: text("forward_scheme").notNull().default("http"),
	allowWebsocketUpgrade: integer("allow_websocket_upgrade").notNull().default(0),
	accessListId: integer("access_list_id").notNull().default(0),
	certificateId: integer("certificate_id").notNull().default(0),
	sslForced: integer("ssl_forced").notNull().default(0),
	cachingEnabled: integer("caching_enabled").notNull().default(0),
	blockExploits: integer("block_exploits").notNull().default(1),
	http2Support: integer("http2_support").notNull().default(0),
	hstsEnabled: integer("hsts_enabled").notNull().default(0),
	hstsSubdomains: integer("hsts_subdomains").notNull().default(0),
	enabled: integer("enabled").notNull().default(1),
	trustForwardedProto: integer("trust_forwarded_proto").notNull().default(0),
	advancedConfig: text("advanced_config").notNull().default(""),
	locations: text("locations").notNull().default("[]"),
	meta: text("meta").notNull().default("{}"),
	isDeleted: integer("is_deleted").notNull().default(0),
	ownerUserId: integer("owner_user_id").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const redirectionHosts = sqliteTable("redirection_hosts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	domainNames: text("domain_names").notNull().default("[]"),
	forwardDomainName: text("forward_domain_name").notNull(),
	forwardScheme: text("forward_scheme").notNull().default("auto"),
	forwardHttpCode: integer("forward_http_code").notNull().default(302),
	preservePath: integer("preserve_path").notNull().default(1),
	certificateId: integer("certificate_id").notNull().default(0),
	sslForced: integer("ssl_forced").notNull().default(0),
	blockExploits: integer("block_exploits").notNull().default(1),
	http2Support: integer("http2_support").notNull().default(0),
	hstsEnabled: integer("hsts_enabled").notNull().default(0),
	hstsSubdomains: integer("hsts_subdomains").notNull().default(0),
	enabled: integer("enabled").notNull().default(1),
	advancedConfig: text("advanced_config").notNull().default(""),
	meta: text("meta").notNull().default("{}"),
	isDeleted: integer("is_deleted").notNull().default(0),
	ownerUserId: integer("owner_user_id").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const deadHosts = sqliteTable("dead_hosts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	domainNames: text("domain_names").notNull().default("[]"),
	certificateId: integer("certificate_id").notNull().default(0),
	sslForced: integer("ssl_forced").notNull().default(0),
	http2Support: integer("http2_support").notNull().default(0),
	hstsEnabled: integer("hsts_enabled").notNull().default(0),
	hstsSubdomains: integer("hsts_subdomains").notNull().default(0),
	enabled: integer("enabled").notNull().default(1),
	advancedConfig: text("advanced_config").notNull().default(""),
	meta: text("meta").notNull().default("{}"),
	isDeleted: integer("is_deleted").notNull().default(0),
	ownerUserId: integer("owner_user_id").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const streams = sqliteTable("streams", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	incomingPort: integer("incoming_port").notNull(),
	forwardIp: text("forward_ip").notNull(),
	forwardingPort: integer("forwarding_port").notNull(),
	tcpForwarding: integer("tcp_forwarding").notNull().default(1),
	udpForwarding: integer("udp_forwarding").notNull().default(0),
	enabled: integer("enabled").notNull().default(1),
	advancedConfig: text("advanced_config").notNull().default(""),
	meta: text("meta").notNull().default("{}"),
	isDeleted: integer("is_deleted").notNull().default(0),
	ownerUserId: integer("owner_user_id").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const accessLists = sqliteTable("access_lists", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	isDeleted: integer("is_deleted").notNull().default(0),
	ownerUserId: integer("owner_user_id").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const accessListAuth = sqliteTable("access_list_auth", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	accessListId: integer("access_list_id")
		.notNull()
		.references(() => accessLists.id, { onDelete: "cascade" }),
	username: text("username").notNull(),
	password: text("password").notNull(),
	createdAt: text("created_at").notNull(),
});

export const certificates = sqliteTable("certificates", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	provider: text("provider").notNull(),
	niceName: text("nice_name").notNull().default(""),
	domainNames: text("domain_names").notNull().default("[]"),
	expiresOn: text("expires_on").notNull(),
	meta: text("meta").notNull().default("{}"),
	autoRenew: integer("auto_renew").notNull().default(1),
	isDeleted: integer("is_deleted").notNull().default(0),
	ownerUserId: integer("owner_user_id").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description").notNull().default(""),
	value: text("value").notNull().default(""),
	meta: text("meta").notNull().default("{}"),
});

export const auditLog = sqliteTable("audit_log", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id").notNull(),
	action: text("action").notNull(),
	objectType: text("object_type").notNull(),
	objectId: integer("object_id").notNull(),
	meta: text("meta").notNull().default("{}"),
	createdAt: text("created_at").notNull(),
});
