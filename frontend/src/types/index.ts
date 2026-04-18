// Application type definitions
export interface User {
  id: number;
  email: string;
  name: string;
  nickname: string;
  roles: string[];
  isDeleted: boolean;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  visibility?: string;
  proxyHosts?: string;
  redirectionHosts?: string;
  deadHosts?: string;
  streams?: string;
  accessLists?: string;
  certificates?: string;
}

export type CertificateProvider = "letsencrypt" | "other";
export type ForwardScheme = "http" | "https" | "auto";

export interface ProxyLocation {
  id: number;
  path: string;
  forwardScheme: ForwardScheme;
  forwardHost: string;
  forwardPort: number;
  advancedConfig: string;
}

export interface ProxyHostMeta {
  nginxOnline: boolean;
  sslForcing: boolean;
  hsts: boolean;
  http2: boolean;
  certExpiring: boolean;
}

export interface ProxyHost {
  id: number;
  createdAt: string;
  updatedAt: string;
  domainNames: string[];
  forwardHost: string;
  forwardPort: number;
  forwardScheme: ForwardScheme;
  certificateId: number;
  sslForced: boolean;
  hstsEnabled: boolean;
  hstsSubdomains: boolean;
  http2Support: boolean;
  blockExploits: boolean;
  cachingEnabled: boolean;
  allowWebsocketUpgrade: boolean;
  trustForwardedProto: boolean;
  accessListId: number;
  advancedConfig: string;
  locations: ProxyLocation[];
  meta: ProxyHostMeta;
  enabled: boolean;
  ownerUserId: number;
}

export interface CreateProxyHost {
  domainNames: string[];
  forwardHost: string;
  forwardPort: number;
  forwardScheme: ForwardScheme;
  certificateId?: number;
  sslForced?: boolean;
  hstsEnabled?: boolean;
  hstsSubdomains?: boolean;
  http2Support?: boolean;
  blockExploits?: boolean;
  cachingEnabled?: boolean;
  allowWebsocketUpgrade?: boolean;
  trustForwardedProto?: boolean;
  accessListId?: number;
  advancedConfig?: string;
  enabled?: boolean;
  locations?: Omit<ProxyLocation, "id">[];
}

export interface RedirectionHostMeta {
  nginxOnline: boolean;
  nginxErr: string | null;
  sslForcing: boolean;
  hsts: boolean;
  http2: boolean;
  certExpiring: boolean;
}

export interface RedirectionHost {
  id: number;
  createdAt: string;
  updatedAt: string;
  domainNames: string[];
  forwardDomainName: string;
  forwardScheme: ForwardScheme;
  forwardHttpCode: number;
  preservePath: boolean;
  certificateId: number;
  sslForced: boolean;
  blockExploits: boolean;
  http2Support: boolean;
  hstsEnabled: boolean;
  hstsSubdomains: boolean;
  enabled: boolean;
  advancedConfig: string;
  meta: RedirectionHostMeta;
  ownerUserId: number;
}

export interface CreateRedirectionHost {
  domainNames: string[];
  forwardDomainName: string;
  forwardScheme?: "auto" | "http" | "https";
  forwardHttpCode?: number;
  preservePath?: boolean;
  certificateId?: number;
  sslForced?: boolean;
  blockExploits?: boolean;
  http2Support?: boolean;
  hstsEnabled?: boolean;
  hstsSubdomains?: boolean;
  advancedConfig?: string;
  enabled?: boolean;
}

export interface DeadHostMeta {
  nginxOnline: boolean;
  nginxErr: string | null;
  sslForcing: boolean;
  hsts: boolean;
  http2: boolean;
  certExpiring: boolean;
}

export interface DeadHost {
  id: number;
  createdAt: string;
  updatedAt: string;
  domainNames: string[];
  certificateId: number;
  sslForced: boolean;
  http2Support: boolean;
  hstsEnabled: boolean;
  hstsSubdomains: boolean;
  enabled: boolean;
  advancedConfig: string;
  meta: DeadHostMeta;
  ownerUserId: number;
}

export interface CreateDeadHost {
  domainNames: string[];
  certificateId?: number;
  sslForced?: boolean;
  hstsEnabled?: boolean;
  hstsSubdomains?: boolean;
  http2Support?: boolean;
  advancedConfig?: string;
  enabled?: boolean;
}

export interface StreamMeta {
  nginxOnline: boolean;
  nginxErr: string | null;
}

export interface Stream {
  id: number;
  createdAt: string;
  updatedAt: string;
  incomingPort: number;
  forwardIp: string;
  forwardingPort: number;
  tcpForwarding: boolean;
  udpForwarding: boolean;
  enabled: boolean;
  advancedConfig: string;
  meta: StreamMeta;
  ownerUserId: number;
}

export interface CreateStream {
  incomingPort: number;
  forwardIp: string;
  forwardingPort: number;
  tcpForwarding?: boolean;
  udpForwarding?: boolean;
  enabled?: boolean;
}

export interface CertificateMeta {
  letsencryptEmail: string;
  letsencryptAgree: boolean;
}

export interface Certificate {
  id: number;
  createdAt: string;
  updatedAt: string;
  provider: CertificateProvider;
  niceName: string;
  domainNames: string[];
  expiresOn: string;
  meta: CertificateMeta;
  autoRenew: boolean;
  ownerUserId: number;
}

export interface CreateCertificate {
  provider: CertificateProvider;
  niceName?: string;
  domainNames: string[];
  meta?: {
    letsencryptEmail: string;
    letsencryptAgree: boolean;
  };
}

export interface AccessList {
  id: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  items: AccessListAuthItem[];
  meta: Record<string, unknown>;
  ownerUserId: number;
}

export interface AccessListAuthItem {
  id?: number;
  username: string;
  password: string;
}

export interface CreateAccessList {
  name: string;
  items: AccessListAuthItem[];
}

export type DefaultSiteOption = "congratulations" | "404" | "redirect" | "html";

export interface Setting {
  id: string;
  name: string;
  description: string;
  value: string;
  meta: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: number;
  createdAt: string;
  userId: number;
  action: string;
  objectType: string;
  objectId: number;
  meta: Record<string, unknown>;
  user?: {
    name: string;
    email: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface DashboardStats {
  totalProxyHosts: number;
  totalRedirectionHosts: number;
  totalStreams: number;
  totalDeadHosts: number;
  totalCertificates: number;
  activeUsers: number;
}
