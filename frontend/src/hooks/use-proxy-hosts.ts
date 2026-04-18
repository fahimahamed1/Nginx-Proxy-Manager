// Proxy hosts data hooks (list, detail, create, update, delete)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import type {
  PaginatedResponse,
  ProxyHost,
  CreateProxyHost,
} from "@/types";

export function useProxyHosts(params?: {
  search?: string;
  offset?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["proxy-hosts", params],
    queryFn: () =>
      api
        .get("proxy-hosts", {
          searchParams: {
            limit: params?.limit ?? ITEMS_PER_PAGE,
            offset: params?.offset ?? 0,
            search: params?.search,
          },
        })
        .json<PaginatedResponse<ProxyHost>>(),
    staleTime: 60_000,
  });
}

export function useCreateProxyHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProxyHost) =>
      api.post("proxy-hosts", { json: data }).json<ProxyHost>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxy-hosts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateProxyHost(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateProxyHost>) =>
      api.put(`proxy-hosts/${id}`, { json: data }).json<ProxyHost>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxy-hosts"] });
      qc.invalidateQueries({ queryKey: ["proxy-host", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteProxyHost(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`proxy-hosts/${id}`).json<Record<string, unknown>>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxy-hosts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
