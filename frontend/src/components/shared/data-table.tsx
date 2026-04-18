// Generic data table with search, sorting, pagination, and row selection
import { type ReactNode, useState, useMemo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "./empty-state";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total: number;
  offset: number;
  limit: number;
  onPageChange: (offset: number) => void;
  onSearch?: (search: string) => void;
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  actions?: (item: T) => ReactNode;
  getKey: (item: T) => string | number;
  selectable?: boolean;
  onBulkAction?: (selectedKeys: (string | number)[], action: string) => void;
  bulkActions?: { label: string; value: string; variant?: "default" | "destructive" }[];
}

type SortDirection = "asc" | "desc";

export function DataTable<T>({
  columns,
  data,
  total,
  offset,
  limit,
  onPageChange,
  onSearch,
  searchPlaceholder = "Search...",
  isLoading,
  emptyTitle = "No items found",
  emptyDescription = "There are no items to display.",
  emptyIcon,
  actions,
  getKey,
  selectable = false,
  onBulkAction,
  bulkActions,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    onSearch?.(value);
  };

  // Cycle sort: asc → desc → none
  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Client-side sort on current page data
  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const allKeys = useMemo(
    () => sortedData.map(getKey),
    [sortedData, getKey],
  );

  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k));
  const someSelected = allKeys.some((k) => selectedKeys.has(k)) && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allKeys));
    }
  }, [allSelected, allKeys]);

  const toggleRow = useCallback((key: string | number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const showPagination = total > 0 && totalPages > 1;
  const selectionCount = selectedKeys.size;

  return (
    <div className="space-y-4">
      {onSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {selectable && selectionCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
          <span className="font-medium">{selectionCount} selected</span>
          <div className="flex-1" />
          {bulkActions?.map((action) => (
            <Button
              key={action.value}
              size="sm"
              variant={action.variant === "destructive" ? "destructive" : "outline"}
              onClick={() => onBulkAction?.(Array.from(selectedKeys), action.value)}
            >
              {action.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {selectable && (
                  <TableHead className="w-[40px] pl-4">
                    <Checkbox
                      checked={allSelected}
                      ref={(el) => {
                        if (el) {
                          (el as unknown as { indeterminate: boolean }).indeterminate = someSelected;
                        }
                      }}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead key={col.key} className={cn(col.className, "whitespace-nowrap")}>
                    {col.sortable ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.header}
                        <ArrowUpDown
                          className={cn(
                            "h-3.5 w-3.5 transition-colors",
                            sortKey === col.key
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                ))}
                {actions && <TableHead className="w-[100px] text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {selectable && (
                      <TableCell className="pl-4">
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={col.key} className={col.className}>
                        <Skeleton className="h-5 w-full max-w-[120px]" />
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell>
                        <Skeleton className="h-8 w-8 ml-auto" />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : total === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)}
                    className="h-48"
                  >
                    <EmptyState
                      title={emptyTitle}
                      description={emptyDescription}
                      icon={emptyIcon}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((item) => {
                  const key = getKey(item);
                  return (
                    <TableRow key={key} data-selected={selectedKeys.has(key) ? "" : undefined} className={cn(selectedKeys.has(key) && "bg-muted/30")}>
                      {selectable && (
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={selectedKeys.has(key)}
                            onCheckedChange={() => toggleRow(key)}
                          />
                        </TableCell>
                      )}
                      {columns.map((col) => (
                        <TableCell key={col.key} className={col.className}>
                          {col.render
                            ? col.render(item)
                            : String((item as Record<string, unknown>)[col.key] ?? "")}
                        </TableCell>
                      ))}
                      {actions && (
                        <TableCell className="text-right">
                          {actions(item)}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {showPagination && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="text-sm">
            {total > 0 ? <>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</> : <>No results</>}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => onPageChange(0)}
              disabled={currentPage <= 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange((currentPage - 2) * limit)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(currentPage * limit)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => onPageChange((totalPages - 1) * limit)}
              disabled={currentPage >= totalPages}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
