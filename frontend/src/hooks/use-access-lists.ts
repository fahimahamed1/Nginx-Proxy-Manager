// Access list management hooks (list)
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import type {
  PaginatedResponse,
  AccessList,
} from "@/types";

export function useAccessLists(params?: {
  search?: string;
  offset?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["access-lists", params],
    queryFn: () =>
      api
        .get("access-lists", {
          searchParams: {
            limit: params?.limit ?? ITEMS_PER_PAGE,
            offset: params?.offset ?? 0,
            search: params?.search,
          },
        })
        .json<PaginatedResponse<AccessList>>(),
    staleTime: 60_000,
  });
}
