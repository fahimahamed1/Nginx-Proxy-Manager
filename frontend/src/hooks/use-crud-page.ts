// Generic CRUD page hook with pagination, search, create/edit/delete dialogs
import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { PaginatedResponse } from "@/types";

interface CrudPageOptions<T, TCreate> {
  resource: string;
  queryKey?: string;
  invalidateDashboard?: boolean;
}

export function useCrudPage<T extends { id: number }, TCreate = Partial<T>>({
  resource,
  queryKey,
  invalidateDashboard = true,
}: CrudPageOptions<T, TCreate>) {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const key = queryKey ?? resource;

  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  useEffect(() => { setOffset(0); }, [debouncedSearch]);

  const { data, isLoading } = useQuery({
    queryKey: [key, { search: debouncedSearch, offset, limit: ITEMS_PER_PAGE }],
    queryFn: () =>
      api
        .get(resource, {
          searchParams: { limit: ITEMS_PER_PAGE, offset, search: debouncedSearch },
        })
        .json<PaginatedResponse<T>>(),
    staleTime: 60_000,
  });

  const invalidate = useCallback(
    (alsoDashboard = false) => {
      qc.invalidateQueries({ queryKey: [key] });
      if (alsoDashboard && invalidateDashboard) {
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
    [qc, key, invalidateDashboard],
  );

  const createMutation = useMutation({
    mutationFn: (data: TCreate) => api.post(resource, { json: data }).json<T>(),
    onSuccess: () => invalidate(true),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TCreate> }) =>
      api.put(`${resource}/${id}`, { json: data }).json<T>(),
    onSuccess: () => invalidate(true),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      api.delete(`${resource}/${id}`).json<Record<string, unknown>>(),
    onSuccess: () => invalidate(true),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.post(`${resource}/${id}/${enabled ? "enable" : "disable"}`).json<T>(),
    onSuccess: () => invalidate(false),
  });

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setCreateOpen(true);
  }, []);

  const openEdit = useCallback((item: T) => {
    setEditTarget(item);
    setCreateOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setCreateOpen(false);
    setEditTarget(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      addToast({
        title: "Deleted",
        description: `"${resource}" has been deleted.`,
        variant: "success",
      });
      setDeleteTarget(null);
    } catch (err) {
      addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
    }
  }, [deleteTarget, deleteMutation, addToast, resource]);

  return {
    data,
    isLoading,
    offset,
    setOffset,
    search,
    setSearch,
    createOpen,
    editTarget,
    deleteTarget,
    setDeleteTarget,
    isEditing: editTarget !== null,
    openCreate,
    openEdit,
    closeDialog,
    createMutation,
    updateMutation,
    deleteMutation,
    toggleMutation,
    handleDelete,
    queryKey: key,
  };
}
