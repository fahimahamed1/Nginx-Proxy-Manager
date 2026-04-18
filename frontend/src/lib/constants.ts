// Application constants
export const APP_NAME = "Nginx Proxy Manager";
export const API_BASE = "/api";

export const ITEMS_PER_PAGE = 20;

export const DEFAULT_SITE_OPTIONS = [
  { value: "congratulations", label: "Default Page" },
  { value: "404", label: "404 Not Found" },
  { value: "redirect", label: "Redirect" },
  { value: "html", label: "Custom HTML" },
] as const;

export const SIDEBAR_WIDTH = 260;
export const REFRESH_INTERVALS = {
  auditLog: 30_000,
  dashboard: 60_000,
  default: 60_000,
} as const;
