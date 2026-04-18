// Certificate management hooks (list, detail, create, delete, renew)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import type {
  PaginatedResponse,
  Certificate,
  CreateCertificate,
} from "@/types";

export function useCertificates(params?: {
  search?: string;
  offset?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["certificates", params],
    queryFn: () =>
      api
        .get("certificates", {
          searchParams: {
            limit: params?.limit ?? ITEMS_PER_PAGE,
            offset: params?.offset ?? 0,
            search: params?.search,
          },
        })
        .json<PaginatedResponse<Certificate>>(),
    staleTime: 60_000,
  });
}

export function useCreateCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCertificate) =>
      api.post("certificates", { json: data }).json<Certificate>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteCertificate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`certificates/${id}`).json<Record<string, unknown>>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

