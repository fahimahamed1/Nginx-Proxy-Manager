// Hooks for settings, health check, audit logs, and dashboard stats
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ITEMS_PER_PAGE, REFRESH_INTERVALS } from "@/lib/constants";
import type { AuditLogEntry, Setting, PaginatedResponse, DashboardStats } from "@/types";

export function useAuditLogs(params?: {
  search?: string;
  offset?: number;
  limit?: number;
  userId?: number;
  action?: string;
  objectType?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => {
      const sp: Record<string, string | number> = {
        limit: params?.limit ?? ITEMS_PER_PAGE,
        offset: params?.offset ?? 0,
      };
      if (params?.search) sp.search = params.search;
      if (params?.userId) sp.userId = params.userId;
      if (params?.action) sp.action = params.action;
      if (params?.objectType) sp.objectType = params.objectType;
      if (params?.dateFrom) sp.dateFrom = params.dateFrom;
      if (params?.dateTo) sp.dateTo = params.dateTo;
      return api
        .get("audit-log", { searchParams: sp })
        .json<PaginatedResponse<AuditLogEntry>>();
    },
    refetchInterval: REFRESH_INTERVALS.auditLog,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get("settings").json<{ items: Setting[] }>(),
    staleTime: 120_000,
    select: (data) => data.items,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value, meta }: { id: string; value: string; meta?: Record<string, unknown> }) =>
      api.put(`settings/${id}`, { json: { value, ...(meta ? { meta } : {}) } }).json<{ success: boolean }>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("health").json<{ status: string; version: string; setup: boolean; uptime: number }>(),
    refetchInterval: REFRESH_INTERVALS.default,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });
}

// Fetches totals from all resource endpoints in parallel
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [proxyHosts, redirHosts, deadHosts, streams, certs, users] = await Promise.all([
        api.get("proxy-hosts").json<PaginatedResponse<unknown>>(),
        api.get("redirection-hosts").json<PaginatedResponse<unknown>>(),
        api.get("dead-hosts").json<PaginatedResponse<unknown>>(),
        api.get("streams").json<PaginatedResponse<unknown>>(),
        api.get("certificates").json<PaginatedResponse<unknown>>(),
        api.get("users").json<PaginatedResponse<unknown>>(),
      ]);

      return {
        totalProxyHosts: proxyHosts.total,
        totalRedirectionHosts: redirHosts.total,
        totalDeadHosts: deadHosts.total,
        totalStreams: streams.total,
        totalCertificates: certs.total,
        activeUsers: users.total,
      } satisfies DashboardStats;
    },
    refetchInterval: REFRESH_INTERVALS.dashboard,
    staleTime: 60_000,
  });
}
