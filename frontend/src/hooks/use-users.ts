// User management hooks (list, create, update, delete, current profile)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import type { PaginatedResponse, User } from "@/types";

export function useUsers(params?: {
  search?: string;
  offset?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () =>
      api
        .get("users", {
          searchParams: {
            limit: params?.limit ?? ITEMS_PER_PAGE,
            offset: params?.offset ?? 0,
            search: params?.search,
          },
        })
        .json<PaginatedResponse<User>>(),
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string; roles: string[] }) =>
      api.post("users", { json: data }).json<User>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Partial<{ name: string; email: string; password: string; roles: string[]; isDisabled: boolean }>,
    ) => api.put(`users/${id}`, { json: data }).json<User>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`users/${id}`).json<Record<string, unknown>>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useCurrentProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get("auth/me").json<User>(),
    staleTime: 30_000,
  });
}
