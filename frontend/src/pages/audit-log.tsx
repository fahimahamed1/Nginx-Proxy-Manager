{/* Audit log viewer page */}
import { useState } from "react";
import { useAuditLogs } from "@/hooks/use-settings";
import { useUsers } from "@/hooks/use-users";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
	Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollText, RefreshCw, Eye, Filter, X } from "lucide-react";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { formatRelativeTime, formatDateShort } from "@/lib/utils";
import type { AuditLogEntry } from "@/types";

const ACTION_TYPES = ["create", "update", "delete", "login", "setup", "enable", "disable"];
const OBJECT_TYPES = ["proxy-host", "redirection-host", "dead-host", "stream", "certificate", "user", "access-list", "setting"];

export function AuditLogPage() {
	const [offset, setOffset] = useState(0);
	const [search, setSearch] = useState("");
	const [detailLog, setDetailLog] = useState<AuditLogEntry | null>(null);
	const [showFilters, setShowFilters] = useState(false);

	{/* Filter state */}
	const [filterUserId, setFilterUserId] = useState<string>("all");
	const [filterAction, setFilterAction] = useState<string>("all");
	const [filterObjectType, setFilterObjectType] = useState<string>("all");
	const [filterDateFrom, setFilterDateFrom] = useState("");
	const [filterDateTo, setFilterDateTo] = useState("");

	const { data: usersData } = useUsers({ limit: 500 });
	const users = usersData?.items ?? [];

	const queryParams = {
		search,
		offset,
		limit: ITEMS_PER_PAGE,
		...(filterUserId !== "all" ? { userId: Number(filterUserId) } : {}),
		...(filterAction !== "all" ? { action: filterAction } : {}),
		...(filterObjectType !== "all" ? { objectType: filterObjectType } : {}),
		...(filterDateFrom ? { dateFrom: filterDateFrom } : {}),
		...(filterDateTo ? { dateTo: filterDateTo } : {}),
	};

	const { data, isLoading, refetch, isFetching } = useAuditLogs(queryParams);

	const hasActiveFilters = filterUserId !== "all" || filterAction !== "all" || filterObjectType !== "all" || filterDateFrom || filterDateTo;

	const clearFilters = () => {
		setFilterUserId("all");
		setFilterAction("all");
		setFilterObjectType("all");
		setFilterDateFrom("");
		setFilterDateTo("");
	};

	const columns: Column<AuditLogEntry>[] = [
		{
			key: "timestamp", header: "When", render: (log) => (
				<span className="text-sm text-muted-foreground whitespace-nowrap">{formatRelativeTime(log.createdAt)}</span>
			),
			className: "w-[140px]",
		},
		{
			key: "username", header: "User", render: (log) => (
				<span className="font-medium text-sm">{log.user?.name ?? log.userId}</span>
			),
			className: "w-[150px]",
		},
		{
			key: "action", header: "Action", render: (log) => (
				<Badge variant="outline" className="font-normal text-xs">{log.action}</Badge>
			),
		},
		{
			key: "objectType", header: "Type", render: (log) => (
				<span className="text-sm text-muted-foreground">{log.objectType}</span>
			),
		},
		{
			key: "objectId", header: "ID", render: (log) => (
				<span className="text-xs font-mono text-muted-foreground">#{log.objectId}</span>
			),
			className: "w-[80px]",
		},
		{
			key: "details", header: "", render: (log) => (
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0"
					onClick={() => setDetailLog(log)}
				>
					<Eye className="h-3.5 w-3.5" />
				</Button>
			),
			className: "w-[50px]",
		},
	];

	return (
		<div className="space-y-6">
			<PageHeader title="Audit Log" description="Review system activity and user actions. Auto-refreshes every 30 seconds.">
				<div className="flex items-center gap-2">
					<Button
						variant={showFilters ? "secondary" : "outline"}
						onClick={() => setShowFilters(!showFilters)}
					>
						<Filter className="h-4 w-4" />
						Filters
						{hasActiveFilters && (
							<span className="ml-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
								{[filterUserId !== "all", filterAction !== "all", filterObjectType !== "all", !!filterDateFrom, !!filterDateTo].filter(Boolean).length}
							</span>
						)}
					</Button>
					<Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
						<RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
						Refresh
					</Button>
				</div>
			</PageHeader>

			{/* Filter panel */}
			{showFilters && (
				<div className="rounded-lg border bg-card p-4 space-y-4">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">Filters</span>
						{hasActiveFilters && (
							<Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
								<X className="h-3 w-3 mr-1" /> Clear All
							</Button>
						)}
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">User</Label>
							<Select value={filterUserId} onValueChange={setFilterUserId}>
								<SelectTrigger className="h-9">
									<SelectValue placeholder="All Users" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Users</SelectItem>
									{users.map((u) => (
										<SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Action</Label>
							<Select value={filterAction} onValueChange={setFilterAction}>
								<SelectTrigger className="h-9">
									<SelectValue placeholder="All Actions" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Actions</SelectItem>
									{ACTION_TYPES.map((a) => (
										<SelectItem key={a} value={a}>{a}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Object Type</Label>
							<Select value={filterObjectType} onValueChange={setFilterObjectType}>
								<SelectTrigger className="h-9">
									<SelectValue placeholder="All Types" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Types</SelectItem>
									{OBJECT_TYPES.map((t) => (
										<SelectItem key={t} value={t}>{t}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">From</Label>
								<Input
									type="date"
									value={filterDateFrom}
									onChange={(e) => setFilterDateFrom(e.target.value)}
									className="h-9 text-sm"
								/>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">To</Label>
								<Input
									type="date"
									value={filterDateTo}
									onChange={(e) => setFilterDateTo(e.target.value)}
									className="h-9 text-sm"
								/>
							</div>
						</div>
					</div>
				</div>
			)}

			<DataTable
				columns={columns}
				data={data?.items ?? []}
				total={data?.total ?? 0}
				offset={offset}
				limit={ITEMS_PER_PAGE}
				onPageChange={setOffset}
				onSearch={setSearch}
				searchPlaceholder="Search actions..."
				isLoading={isLoading}
				emptyTitle="No audit logs"
				emptyDescription="Activity will appear here as users interact with the system."
				emptyIcon={<ScrollText className="h-6 w-6" />}
				getKey={(log) => log.id}
			/>

			{/* Log detail dialog */}
			<Dialog open={detailLog !== null} onOpenChange={(open) => { if (!open) setDetailLog(null); }}>
				<DialogContent className="max-w-2xl sm:max-h-[85vh]">
					<DialogHeader>
						<DialogTitle>Audit Log Details</DialogTitle>
						<DialogDescription>
							Full metadata for log entry #{detailLog?.id}
						</DialogDescription>
					</DialogHeader>

					{detailLog && (
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">User:</span>{" "}
									<span className="font-medium">{detailLog.user?.name ?? detailLog.userId}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Action:</span>{" "}
									<Badge variant="outline">{detailLog.action}</Badge>
								</div>
								<div>
									<span className="text-muted-foreground">Type:</span>{" "}
									<span>{detailLog.objectType}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Object ID:</span>{" "}
									<span className="font-mono">#{detailLog.objectId}</span>
								</div>
								<div className="col-span-2">
									<span className="text-muted-foreground">Timestamp:</span>{" "}
									<span>{new Date(detailLog.createdAt).toLocaleString()}</span>
								</div>
							</div>

							<div className="space-y-2">
								<span className="text-sm font-medium">Metadata</span>
								<pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words text-foreground">
									{JSON.stringify(detailLog.meta, null, 2)}
								</pre>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
