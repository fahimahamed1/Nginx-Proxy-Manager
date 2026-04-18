{/* Proxy host management page */}
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProxyHosts, useCreateProxyHost, useUpdateProxyHost, useDeleteProxyHost } from "@/hooks/use-proxy-hosts";
import { useCertificates } from "@/hooks/use-certificates";
import { useAccessLists } from "@/hooks/use-access-lists";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { DomainInput } from "@/components/shared/domain-input";
import { SslTab } from "@/components/shared/ssl-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle,
} from "@/components/ui/dialog";
import {
        Select,
        SelectContent,
        SelectItem,
        SelectTrigger,
        SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Plus, MoreHorizontal, Pencil, Trash2, Power, Globe, Lock, MapPin, Blocks, Zap, CheckCircle2, XCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

import type { ProxyHost, CreateProxyHost, ForwardScheme } from "@/types";

interface LocationFormData {
        path: string;
        forwardScheme: ForwardScheme;
        forwardHost: string;
        forwardPort: number;
        advancedConfig: string;
}

interface ProxyHostFormData {
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
        accessListId: number;
        advancedConfig: string;
        enabled: boolean;
        locations: LocationFormData[];
}

interface TestResult {
        dnsResolved: boolean;
        dnsIp?: string;
        forwardReachable: boolean;
        responseTime?: number;
        error?: string;
}

interface HostCheckResult {
        host: string;
        isIp: boolean;
        resolvedIp: string;
        dnsResolved: boolean;
        reachable: boolean;
        responseTime: number;
        error?: string;
}

const defaultFormData: ProxyHostFormData = {
        domainNames: [],
        forwardHost: "",
        forwardPort: 80,
        forwardScheme: "http",
        certificateId: 0,
        sslForced: false,
        hstsEnabled: false,
        hstsSubdomains: false,
        http2Support: false,
        blockExploits: true,
        cachingEnabled: false,
        allowWebsocketUpgrade: false,
        accessListId: 0,
        advancedConfig: "",
        enabled: true,
        locations: [],
};

export function ProxyHostsPage() {
        const { addToast } = useToast();
        const qc = useQueryClient();
        const location = useLocation();
        const [offset, setOffset] = useState(0);
        const [search, setSearch] = useState("");
        const [createOpen, setCreateOpen] = useState(false);
        const [editHost, setEditHost] = useState<ProxyHost | null>(null);
        const [deleteTarget, setDeleteTarget] = useState<ProxyHost | null>(null);
        const [formData, setFormData] = useState<ProxyHostFormData>(defaultFormData);

        {/* Connectivity test state */}
        const [testHost, setTestHost] = useState<ProxyHost | null>(null);
        const [testResult, setTestResult] = useState<TestResult | null>(null);
        const [testLoading, setTestLoading] = useState(false);
        const [hostCheck, setHostCheck] = useState<HostCheckResult | null>(null);
        const [hostCheckLoading, setHostCheckLoading] = useState(false);

        const { data, isLoading } = useProxyHosts({ search, offset, limit: ITEMS_PER_PAGE });
        const { data: certificates } = useCertificates({ limit: 500 });
        const { data: accessLists } = useAccessLists({ limit: 500 });
        const createMutation = useCreateProxyHost();
        const updateMutation = useUpdateProxyHost(editHost?.id ?? 0);
        const deleteMutation = useDeleteProxyHost(deleteTarget?.id ?? 0);
        const toggleMutation = useMutation({
                mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
                        api.post(`proxy-hosts/${id}/${enabled ? "enable" : "disable"}`).json(),
                onSuccess: () => qc.invalidateQueries({ queryKey: ["proxy-hosts"] }),
        });

        const isEditing = editHost !== null;

        {/* Auto-open create dialog when navigated from dashboard */}
        useEffect(() => {
                if (location.state?.openCreate) {
                        openCreateRef.current?.();

                        window.history.replaceState({}, document.title);
                }
        }, [location.state]);

        const openCreateRef = useRef<() => void>(() => {});

        const openCreate = () => {
                setEditHost(null);
                setFormData(defaultFormData);
                setHostCheck(null);
                setCreateOpen(true);
        };
        openCreateRef.current = openCreate;

        const openEdit = (host: ProxyHost) => {
                setEditHost(host);
                setHostCheck(null);
                setFormData({
                        domainNames: [...host.domainNames],
                        forwardHost: host.forwardHost,
                        forwardPort: host.forwardPort,
                        forwardScheme: host.forwardScheme,
                        certificateId: host.certificateId,
                        sslForced: host.sslForced,
                        hstsEnabled: host.hstsEnabled,
                        hstsSubdomains: host.hstsSubdomains,
                        http2Support: host.http2Support,
                        blockExploits: host.blockExploits,
                        cachingEnabled: host.cachingEnabled,
                        allowWebsocketUpgrade: host.allowWebsocketUpgrade,
                        accessListId: host.accessListId,
                        advancedConfig: host.advancedConfig,
                        enabled: host.enabled,
                        locations: (host.locations ?? []).map((loc) => ({
                                path: loc.path,
                                forwardScheme: loc.forwardScheme,
                                forwardHost: loc.forwardHost,
                                forwardPort: loc.forwardPort,
                                advancedConfig: loc.advancedConfig,
                        })),
                });
                setCreateOpen(true);
        };

        {/* Test proxy host connectivity */}
        const handleTest = async (host: ProxyHost) => {
                setTestHost(host);
                setTestResult(null);
                setTestLoading(true);
                try {
                        const result = await api.post(`proxy-hosts/${host.id}/test`).json<TestResult>();
                        setTestResult(result);
                } catch {
                        setTestResult({
                                dnsResolved: false,
                                forwardReachable: false,
                                error: "Failed to run test. The endpoint may not be available.",
                        });
                } finally {
                        setTestLoading(false);
                }
        };

        {/* Check if forward host is reachable */}
        const handleCheckHost = async () => {
                if (!formData.forwardHost.trim()) return;
                setHostCheck(null);
                setHostCheckLoading(true);
                try {
                        const result = await api.post("proxy-hosts/check-host", { json: { host: formData.forwardHost.trim() } }).json<HostCheckResult>();
                        setHostCheck(result);
                } catch {
                        setHostCheck({ host: formData.forwardHost, isIp: false, resolvedIp: "", dnsResolved: false, reachable: false, responseTime: 0, error: "Check failed" });
                } finally {
                        setHostCheckLoading(false);
                }
        };

        {/* Validate and submit create/edit form */}
        const handleSubmit = async () => {
                if (formData.domainNames.length === 0) {
                        addToast({ title: "Validation Error", description: "At least one domain is required", variant: "destructive" });
                        return;
                }
                if (!formData.forwardHost) {
                        addToast({ title: "Validation Error", description: "Forward host is required", variant: "destructive" });
                        return;
                }

                const payload: CreateProxyHost = {
                        domainNames: formData.domainNames,
                        forwardHost: formData.forwardHost,
                        forwardPort: Number(formData.forwardPort),
                        forwardScheme: formData.forwardScheme,
                        certificateId: formData.certificateId || undefined,
                        sslForced: formData.sslForced,
                        hstsEnabled: formData.hstsEnabled,
                        hstsSubdomains: formData.hstsSubdomains,
                        http2Support: formData.http2Support,
                        blockExploits: formData.blockExploits,
                        cachingEnabled: formData.cachingEnabled,
                        allowWebsocketUpgrade: formData.allowWebsocketUpgrade,
                        accessListId: formData.accessListId || undefined,
                        advancedConfig: formData.advancedConfig || undefined,
                        enabled: formData.enabled,
                        locations: formData.locations.length > 0
                                ? formData.locations.map((loc) => ({
                                                path: loc.path,
                                                forwardScheme: loc.forwardScheme,
                                                forwardHost: loc.forwardHost,
                                                forwardPort: Number(loc.forwardPort),
                                                advancedConfig: loc.advancedConfig,
                                        }))
                                : undefined,
                };

                try {
                        if (isEditing) {
                                await updateMutation.mutateAsync(payload);
                                addToast({ title: "Proxy Host Updated", description: `"${formData.domainNames[0]}" has been updated.`, variant: "success" });
                        } else {
                                await createMutation.mutateAsync(payload);
                                addToast({ title: "Proxy Host Created", description: `"${formData.domainNames[0]}" has been created.`, variant: "success" });
                        }
                        setCreateOpen(false);
                        setEditHost(null);
                        setFormData(defaultFormData);
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const handleDelete = async () => {
                if (!deleteTarget) return;
                try {
                        await deleteMutation.mutateAsync();
                        addToast({ title: "Proxy Host Deleted", description: `"${deleteTarget.domainNames[0]}" has been deleted.`, variant: "success" });
                        setDeleteTarget(null);
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const handleToggle = async (host: ProxyHost) => {
                try {
                        await toggleMutation.mutateAsync({ id: host.id, enabled: !host.enabled });
                        addToast({
                                title: host.enabled ? "Proxy Host Disabled" : "Proxy Host Enabled",
                                description: `"${host.domainNames[0]}" has been ${host.enabled ? "disabled" : "enabled"}.`,
                                variant: "success",
                        });
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const columns: Column<ProxyHost>[] = [
                {
                        key: "status",
                        header: "Status",
                        render: (host) => (
                                <StatusBadge enabled={host.enabled} />
                        ),
                        className: "w-[100px]",
                },
                {
                        key: "domainNames",
                        header: "Domains",
                        render: (host) => (
                                <div className="flex flex-wrap gap-1">
                                        {host.domainNames.map((d) => (
                                                <Badge key={d} variant="outline" className="font-mono text-xs">
                                                        {d}
                                                </Badge>
                                        ))}
                                </div>
                        ),
                },
                {
                        key: "forward",
                        header: "Forward To",
                        render: (host) => (
                                <span className="font-mono text-sm">
                                        {host.forwardScheme}://{host.forwardHost}:{host.forwardPort}
                                </span>
                        ),
                },
                {
                        key: "ssl",
                        header: "SSL",
                        render: (host) => (
                                host.certificateId > 0 ? (
                                        <Badge variant="default" className="gap-1">
                                                <Lock className="h-3 w-3" />
                                                {host.sslForced ? "Forced" : "Active"}
                                        </Badge>
                                ) : (
                                        <span className="text-xs text-muted-foreground">None</span>
                                )
                        ),
                        className: "w-[100px]",
                },
        ];

        return (
                <div className="space-y-6">
                        <PageHeader
                                title="Proxy Hosts"
                                description="Manage your reverse proxy hosts and their configurations."
                        >
                                <Button onClick={openCreate}>
                                        <Plus className="h-4 w-4" />
                                        New Proxy Host
                                </Button>
                        </PageHeader>

                        <DataTable
                                columns={columns}
                                data={data?.items ?? []}
                                total={data?.total ?? 0}
                                offset={offset}
                                limit={ITEMS_PER_PAGE}
                                onPageChange={setOffset}
                                onSearch={setSearch}
                                searchPlaceholder="Search by domain..."
                                isLoading={isLoading}
                                emptyTitle="No proxy hosts found"
                                emptyDescription="Create your first proxy host to start routing traffic."
                                emptyIcon={<Globe className="h-6 w-6" />}
                                getKey={(host) => host.id}
                                actions={(host) => (
                                        <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => openEdit(host)}>
                                                                <Pencil className="mr-2 h-4 w-4" /> Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleToggle(host)}>
                                                                <Power className="mr-2 h-4 w-4" />
                                                                {host.enabled ? "Disable" : "Enable"}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleTest(host)}>
                                                                <Zap className="mr-2 h-4 w-4" /> Test
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                                onClick={() => setDeleteTarget(host)}
                                                                className="text-destructive focus:text-destructive"
                                                        >
                                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                </DropdownMenuContent>
                                        </DropdownMenu>
                                )}
                        />

                        {/* Create/Edit proxy host dialog */}
                        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditHost(null); } }}>
                                <DialogContent className="max-w-2xl sm:max-h-[85vh]">
                                        <DialogHeader>
                                                <DialogTitle>{isEditing ? "Edit Proxy Host" : "New Proxy Host"}</DialogTitle>
                                                <DialogDescription>
                                                        {isEditing ? "Update the proxy host configuration." : "Configure a new reverse proxy host."}
                                                </DialogDescription>
                                        </DialogHeader>

                                        <Tabs defaultValue="details" className="w-full">
                                                <TabsList className="w-full">
                                                        <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                                                        <TabsTrigger value="ssl" className="flex-1">SSL</TabsTrigger>
                                                        <TabsTrigger value="advanced" className="flex-1">Advanced</TabsTrigger>
                                                        <TabsTrigger value="locations" className="flex-1">Locations</TabsTrigger>
                                                </TabsList>

                                                <TabsContent value="details" className="space-y-4 mt-4">
                                                        <div className="space-y-2">
                                                                <Label>Domain Names <span className="text-destructive">*</span></Label>
                                                                <DomainInput
                                                                        value={formData.domainNames}
                                                                        onChange={(domains) => setFormData((prev) => ({ ...prev, domainNames: domains }))}
                                                                        placeholder="Domain Names"
                                                                />
                                                                <p className="text-xs text-muted-foreground">Press Enter, comma, or Tab to add. Supports paste of multiple domains.</p>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                <div className="sm:col-span-2 space-y-2">
                                                                        <Label htmlFor="forward-host">Forward Host / IP</Label>
                                                                        <div className="flex gap-2">
                                                                                <div className="flex-1 relative">
                                                                                        <Input
                                                                                                id="forward-host"
                                                                                                value={formData.forwardHost}
                                                                                                onChange={(e) => { setFormData((prev) => ({ ...prev, forwardHost: e.target.value })); setHostCheck(null); }}
                                                                                                placeholder="Forward Host"
                                                                                        />
                                                                                        {hostCheck && (
                                                                                                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                                                                                        {hostCheck.reachable ? (
                                                                                                                <Wifi className="h-4 w-4 text-green-500" />
                                                                                                        ) : (
                                                                                                                <WifiOff className="h-4 w-4 text-red-400" />
                                                                                                        )}
                                                                                                </div>
                                                                                        )}
                                                                                </div>
                                                                                <Button
                                                                                        type="button"
                                                                                        variant="outline"
                                                                                        size="icon"
                                                                                        className="shrink-0"
                                                                                        disabled={!formData.forwardHost.trim() || hostCheckLoading}
                                                                                        onClick={handleCheckHost}
                                                                                >
                                                                                        {hostCheckLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                                                                </Button>
                                                                        </div>
                                                                        {hostCheck && (
                                                                                <div className={cn("text-xs rounded-md px-2 py-1.5", hostCheck.reachable ? "text-green-600 dark:text-green-400 bg-green-500/10" : "text-red-600 dark:text-red-400 bg-red-500/10")}>
                                                                                        {hostCheck.isIp ? (
                                                                                                <span>IP Address: {hostCheck.host}</span>
                                                                                        ) : hostCheck.dnsResolved ? (
                                                                                                <span>Hostname resolved to {hostCheck.resolvedIp}</span>
                                                                                        ) : (
                                                                                                <span>DNS resolution failed</span>
                                                                                        )}
                                                                                        {hostCheck.reachable ? (
                                                                                                <span className="ml-1"> — reachable ({hostCheck.responseTime}ms)</span>
                                                                                        ) : (
                                                                                                <span className="ml-1"> — {hostCheck.error || "unreachable"}</span>
                                                                                        )}
                                                                                </div>
                                                                        )}
                                                                </div>
                                                                <div className="space-y-2">
                                                                        <Label htmlFor="forward-port">Port</Label>
                                                                        <Input
                                                                                id="forward-port"
                                                                                type="number"
                                                                                value={formData.forwardPort}
                                                                                onChange={(e) => setFormData((prev) => ({ ...prev, forwardPort: Number(e.target.value) }))}
                                                                                placeholder="Port"
                                                                        />
                                                                </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                                <Label htmlFor="forward-scheme">Forward Scheme</Label>
                                                                <Select
                                                                        value={formData.forwardScheme}
                                                                        onValueChange={(val) => setFormData((prev) => ({ ...prev, forwardScheme: val as ForwardScheme }))}
                                                                >
                                                                        <SelectTrigger>
                                                                                <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                                <SelectItem value="http">HTTP</SelectItem>
                                                                                <SelectItem value="https">HTTPS</SelectItem>
                                                                        </SelectContent>
                                                                </Select>
                                                        </div>

                                                        <div className="space-y-2">
                                                                <Label htmlFor="access-list">Access List</Label>
                                                                <Select
                                                                        value={String(formData.accessListId)}
                                                                        onValueChange={(val) => setFormData((prev) => ({ ...prev, accessListId: Number(val) }))}
                                                                >
                                                                        <SelectTrigger>
                                                                                <SelectValue placeholder="None" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                                <SelectItem value="0">None (Public)</SelectItem>
                                                                                {(accessLists?.items ?? []).map((al) => (
                                                                                        <SelectItem key={al.id} value={String(al.id)}>{al.name}</SelectItem>
                                                                                ))}
                                                                        </SelectContent>
                                                                </Select>
                                                        </div>

                                                        <div className="space-y-4">
                                                                <div className="flex items-center justify-between">
                                                                        <div>
                                                                                <Label>WebSocket Support</Label>
                                                                                <p className="text-xs text-muted-foreground">Allow WebSocket upgrades for this host</p>
                                                                        </div>
                                                                        <Switch
                                                                                checked={formData.allowWebsocketUpgrade}
                                                                                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, allowWebsocketUpgrade: checked }))}
                                                                        />
                                                                </div>

                                                                <div className="flex items-center justify-between">
                                                                        <div>
                                                                                <Label className="flex items-center gap-1.5"><Blocks className="h-3.5 w-3.5" /> Block Common Exploits</Label>
                                                                                <p className="text-xs text-muted-foreground">Enable protection against common web attacks</p>
                                                                        </div>
                                                                        <Switch
                                                                                checked={formData.blockExploits}
                                                                                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, blockExploits: checked }))}
                                                                        />
                                                                </div>

                                                                <div className="flex items-center justify-between">
                                                                        <div>
                                                                                <Label>Caching</Label>
                                                                                <p className="text-xs text-muted-foreground">Enable caching for this proxy host</p>
                                                                                {formData.cachingEnabled && (
                                                                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                                                                Warning: Caching may serve stale content. Do not enable for dynamic sites.
                                                                                        </p>
                                                                                )}
                                                                        </div>
                                                                        <Switch
                                                                                checked={formData.cachingEnabled}
                                                                                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, cachingEnabled: checked }))}
                                                                        />
                                                                </div>
                                                        </div>
                                                </TabsContent>

                                                <TabsContent value="ssl" className="space-y-4 mt-4">
                                                        <SslTab
                                                                certificateId={formData.certificateId}
                                                                onCertificateIdChange={(v) => setFormData((p) => ({ ...p, certificateId: v }))}
                                                                sslForced={formData.sslForced}
                                                                onSslForcedChange={(v) => setFormData((p) => ({ ...p, sslForced: v }))}
                                                                http2={formData.http2Support}
                                                                onHttp2Change={(v) => setFormData((p) => ({ ...p, http2Support: v }))}
                                                                hsts={formData.hstsEnabled}
                                                                onHstsChange={(v) => setFormData((p) => ({ ...p, hstsEnabled: v }))}
                                                                hstsSubdomains={formData.hstsSubdomains}
                                                                onHstsSubdomainsChange={(v) => setFormData((p) => ({ ...p, hstsSubdomains: v }))}
                                                                certificates={certificates?.items ?? []}
                                                        />
                                                </TabsContent>

                                                <TabsContent value="advanced" className="space-y-4 mt-4">
                                                        <div className="space-y-2">
                                                                <Label htmlFor="advanced-config">Custom Nginx Configuration</Label>
                                                                <Textarea
                                                                        id="advanced-config"
                                                                        value={formData.advancedConfig}
                                                                        onChange={(e) => setFormData((prev) => ({ ...prev, advancedConfig: e.target.value }))}
                                                                        placeholder="# Add custom nginx configuration here"
                                                                        className="font-mono text-sm min-h-[200px]"
                                                                />
                                                                <p className="text-xs text-muted-foreground">
                                                                        This configuration will be injected into the server block. Use with caution.
                                                                </p>
                                                        </div>
                                                </TabsContent>

                                                <TabsContent value="locations" className="space-y-4 mt-4">
                                                        <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                        <Label>Custom Locations</Label>
                                                                        <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="sm"
                                                                                onClick={() => setFormData((prev) => ({
                                                                                        ...prev,
                                                                                        locations: [...prev.locations, { path: "/", forwardScheme: "http", forwardHost: "", forwardPort: 80, advancedConfig: "" }],
                                                                                }))}
                                                                        >
                                                                                <Plus className="h-3.5 w-3.5 mr-1" />
                                                                                Add Location
                                                                        </Button>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground">
                                                                        Add custom location blocks with their own forwarding settings.
                                                                </p>
                                                        </div>

                                                        {formData.locations.length === 0 && (
                                                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                                                        <MapPin className="h-8 w-8 mb-2" />
                                                                        <p className="text-sm">No custom locations configured.</p>
                                                                        <p className="text-xs">Click "Add Location" to create one.</p>
                                                                </div>
                                                        )}

                                                        {formData.locations.map((loc, index) => (
                                                                <div key={index} className="border rounded-lg p-4 space-y-3">
                                                                        <div className="flex items-center justify-between">
                                                                                <span className="text-sm font-medium">Location #{index + 1}</span>
                                                                                <Button
                                                                                        type="button"
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                                                                                        onClick={() => setFormData((prev) => ({
                                                                                                ...prev,
                                                                                                locations: prev.locations.filter((_, i) => i !== index),
                                                                                        }))}
                                                                                >
                                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                                <Label className="text-xs">Path</Label>
                                                                                <Input
                                                                                        value={loc.path}
                                                                                        onChange={(e) => setFormData((prev) => ({
                                                                                                ...prev,
                                                                                                locations: prev.locations.map((l, i) => i === index ? { ...l, path: e.target.value } : l),
                                                                                        }))}
                                                                                        placeholder="Path"
                                                                                        className="font-mono text-sm"
                                                                                />
                                                                        </div>
                                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                                                <div className="col-span-1 space-y-2">
                                                                                        <Label className="text-xs">Scheme</Label>
                                                                                        <Select
                                                                                                value={loc.forwardScheme}
                                                                                                onValueChange={(val) => setFormData((prev) => ({
                                                                                                        ...prev,
                                                                                                        locations: prev.locations.map((l, i) => i === index ? { ...l, forwardScheme: val as ForwardScheme } : l),
                                                                                                }))}
                                                                                        >
                                                                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                                                                <SelectContent>
                                                                                                        <SelectItem value="http">HTTP</SelectItem>
                                                                                                        <SelectItem value="https">HTTPS</SelectItem>
                                                                                                </SelectContent>
                                                                                        </Select>
                                                                                </div>
                                                                                <div className="col-span-1 space-y-2">
                                                                                        <Label className="text-xs">Forward Host</Label>
                                                                                        <Input
                                                                                                value={loc.forwardHost}
                                                                                                onChange={(e) => setFormData((prev) => ({
                                                                                                        ...prev,
                                                                                                        locations: prev.locations.map((l, i) => i === index ? { ...l, forwardHost: e.target.value } : l),
                                                                                                }))}
                                                                                                placeholder="IP Address"
                                                                                                className="h-9"
                                                                                        />
                                                                                </div>
                                                                                <div className="col-span-1 space-y-2">
                                                                                        <Label className="text-xs">Port</Label>
                                                                                        <Input
                                                                                                type="number"
                                                                                                value={loc.forwardPort}
                                                                                                onChange={(e) => setFormData((prev) => ({
                                                                                                        ...prev,
                                                                                                        locations: prev.locations.map((l, i) => i === index ? { ...l, forwardPort: Number(e.target.value) } : l),
                                                                                                }))}
                                                                                                placeholder="Port"
                                                                                                className="h-9"
                                                                                        />
                                                                                </div>
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                                <Label className="text-xs">Advanced Config</Label>
                                                                                <Textarea
                                                                                        value={loc.advancedConfig}
                                                                                        onChange={(e) => setFormData((prev) => ({
                                                                                                ...prev,
                                                                                                locations: prev.locations.map((l, i) => i === index ? { ...l, advancedConfig: e.target.value } : l),
                                                                                        }))}
                                                                                        placeholder="# Custom nginx config for this location"
                                                                                        className="font-mono text-sm min-h-[80px]"
                                                                                />
                                                                        </div>
                                                                </div>
                                                        ))}
                                                </TabsContent>
                                        </Tabs>

                                        <DialogFooter>
                                                <Button variant="outline" onClick={() => { setCreateOpen(false); setEditHost(null); }}>
                                                        Cancel
                                                </Button>
                                                <Button
                                                        onClick={handleSubmit}
                                                        disabled={createMutation.isPending || updateMutation.isPending}
                                                >
                                                        {createMutation.isPending || updateMutation.isPending
                                                                ? "Saving..."
                                                                : isEditing
                                                                        ? "Update Proxy Host"
                                                                        : "Create Proxy Host"}
                                                </Button>
                                        </DialogFooter>
                                </DialogContent>
                        </Dialog>

                        {/* Connectivity test result dialog */}
                        <Dialog open={testHost !== null} onOpenChange={(open) => { if (!open) { setTestHost(null); setTestResult(null); } }}>
                                <DialogContent className="max-w-md">
                                        <DialogHeader>
                                                <DialogTitle className="flex items-center gap-2">
                                                        <Zap className="h-5 w-5" />
                                                        Proxy Host Test
                                                </DialogTitle>
                                                <DialogDescription>
                                                        Testing connectivity for {testHost?.domainNames[0]}
                                                </DialogDescription>
                                        </DialogHeader>

                                        {testLoading && (
                                                <div className="flex flex-col items-center justify-center py-8 gap-3">
                                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                        <p className="text-sm text-muted-foreground">Running connectivity test...</p>
                                                </div>
                                        )}

                                        {testResult && !testLoading && (
                                                <div className="space-y-4">
                                                        <div className="space-y-3">
                                                                <TestCheckItem
                                                                        label="DNS Resolution"
                                                                        success={testResult.dnsResolved}
                                                                        detail={testResult.dnsResolved && testResult.dnsIp ? `Resolved to ${testResult.dnsIp}` : undefined}
                                                                />
                                                                <TestCheckItem
                                                                        label="Forward Host Reachability"
                                                                        success={testResult.forwardReachable}
                                                                        detail={testResult.forwardReachable && testResult.responseTime ? `${testResult.responseTime}ms response time` : undefined}
                                                                />
                                                        </div>

                                                        {testResult.error && (
                                                                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                                                                        <p className="text-sm text-destructive font-medium">Error</p>
                                                                        <p className="text-sm text-muted-foreground mt-1">{testResult.error}</p>
                                                                </div>
                                                        )}
                                                </div>
                                        )}
                                </DialogContent>
                        </Dialog>

                        {/* Delete confirmation dialog */}
                        <ConfirmDialog
                                open={deleteTarget !== null}
                                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                                title="Delete Proxy Host"
                                description={`Are you sure you want to delete "${deleteTarget?.domainNames.join(", ")}"? This action cannot be undone.`}
                                confirmLabel="Delete"
                                variant="destructive"
                                isLoading={deleteMutation.isPending}
                                onConfirm={handleDelete}
                        />
                </div>
        );
}

{/* Connectivity test check item display */}
function TestCheckItem({ label, success, detail }: { label: string; success: boolean; detail?: string }) {
        return (
                <div className="flex items-start gap-3">
                        {success ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                                <p className="text-sm font-medium">{label}</p>
                                {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
                        </div>
                </div>
        );
}
