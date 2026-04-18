{/* URL redirection management page */}
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCertificates } from "@/hooks/use-certificates";
import { useCrudPage } from "@/hooks/use-crud-page";
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
        Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
        Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Plus, MoreHorizontal, Pencil, Trash2, Power, ArrowRightLeft, Lock, Loader2 } from "lucide-react";
import {
        DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import type { RedirectionHost, CreateRedirectionHost } from "@/types";

interface RedirectionFormData {
        domainNames: string[];
        forwardDomainName: string;
        forwardScheme: "auto" | "http" | "https";
        forwardHttpCode: 301 | 302;
        preservePath: boolean;
        certificateId: number;
        sslForced: boolean;
        hstsEnabled: boolean;
        hstsSubdomains: boolean;
        http2Support: boolean;
        blockExploits: boolean;
        advancedConfig: string;
        enabled: boolean;
}

const defaultFormData: RedirectionFormData = {
        domainNames: [],
        forwardDomainName: "",
        forwardScheme: "auto",
        forwardHttpCode: 302,
        preservePath: true,
        certificateId: 0,
        sslForced: false,
        hstsEnabled: false,
        hstsSubdomains: false,
        http2Support: false,
        blockExploits: true,
        advancedConfig: "",
        enabled: true,
};

export function RedirectionHostsPage() {
        const { addToast } = useToast();
        const location = useLocation();
        const { data, isLoading, offset, setOffset, search, setSearch, createOpen, editTarget, deleteTarget, setDeleteTarget, isEditing, openCreate, openEdit, closeDialog, createMutation, updateMutation, deleteMutation, toggleMutation, handleDelete } =
                useCrudPage<RedirectionHost, CreateRedirectionHost>({ resource: "redirection-hosts" });
        const [formData, setFormData] = useState<RedirectionFormData>(defaultFormData);

        const { data: certificates } = useCertificates({ limit: 500 });

        useEffect(() => {
                if (location.state?.openCreate) {
                        openCreateRef.current?.();
                        window.history.replaceState({}, document.title);
                }
        }, [location.state]);

        const openEditWithForm = (host: RedirectionHost) => {
                setFormData({
                        domainNames: [...host.domainNames],
                        forwardDomainName: host.forwardDomainName,
                        forwardScheme: (host.forwardScheme || "auto") as "auto" | "http" | "https",
                        forwardHttpCode: (host.forwardHttpCode || 302) as 301 | 302,
                        preservePath: host.preservePath,
                        certificateId: host.certificateId,
                        sslForced: host.sslForced,
                        hstsEnabled: host.hstsEnabled,
                        hstsSubdomains: host.hstsSubdomains,
                        http2Support: host.http2Support,
                        blockExploits: host.blockExploits,
                        advancedConfig: host.advancedConfig,
                        enabled: host.enabled,
                });
                openEdit(host);
        };

        const openCreateWithForm = () => {
                setFormData(defaultFormData);
                openCreate();
        };
        const openCreateRef = useRef(openCreateWithForm);
        openCreateRef.current = openCreateWithForm;

        {/* Validate and submit redirection create/edit form */}
        const handleSubmit = async () => {
                if (formData.domainNames.length === 0) {
                        addToast({ title: "Validation Error", description: "At least one domain is required", variant: "destructive" });
                        return;
                }

                const payload: CreateRedirectionHost = {
                        domainNames: formData.domainNames,
                        forwardDomainName: formData.forwardDomainName,
                        forwardScheme: formData.forwardScheme,
                        forwardHttpCode: formData.forwardHttpCode,
                        preservePath: formData.preservePath,
                        certificateId: formData.certificateId || undefined,
                        sslForced: formData.sslForced,
                        hstsEnabled: formData.hstsEnabled,
                        hstsSubdomains: formData.hstsSubdomains,
                        http2Support: formData.http2Support,
                        blockExploits: formData.blockExploits,
                        advancedConfig: formData.advancedConfig || undefined,
                        enabled: formData.enabled,
                };

                try {
                        if (isEditing && editTarget) {
                                await updateMutation.mutateAsync({ id: editTarget.id, data: payload });
                                addToast({ title: "Redirection Updated", variant: "success" });
                        } else {
                                await createMutation.mutateAsync(payload);
                                addToast({ title: "Redirection Created", variant: "success" });
                        }
                        closeDialog();
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const handleToggle = async (host: RedirectionHost) => {
                try {
                        await toggleMutation.mutateAsync({ id: host.id, enabled: !host.enabled });
                        addToast({
                                title: host.enabled ? "Redirection Disabled" : "Redirection Enabled",
                                description: `"${host.domainNames[0]}" has been ${host.enabled ? "disabled" : "enabled"}.`,
                                variant: "success",
                        });
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const columns: Column<RedirectionHost>[] = [
                { key: "status", header: "Status", render: (host) => <StatusBadge enabled={host.enabled} />, className: "w-[100px]" },
                {
                        key: "domainNames", header: "Domains", render: (host) => (
                                <div className="flex flex-wrap gap-1">
                                        {host.domainNames.map((d) => <Badge key={d} variant="outline" className="font-mono text-xs">{d}</Badge>)}
                                </div>
                        ),
                },
                {
                        key: "forward", header: "Redirect To", render: (host) => (
                                <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{host.forwardHttpCode ?? 302}</span>
                                        <span className="font-mono text-sm">{host.forwardDomainName}</span>
                                </div>
                        ),
                },
                {
                        key: "ssl", header: "SSL", render: (host) => (
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
                        <PageHeader title="Redirection Hosts" description="Manage URL redirections and rewrites.">
                                <Button onClick={openCreateWithForm}>
                                        <Plus className="h-4 w-4" /> New Redirection
                                </Button>
                        </PageHeader>

                        <DataTable
                                columns={columns} data={data?.items ?? []} total={data?.total ?? 0} offset={offset} limit={ITEMS_PER_PAGE}
                                onPageChange={setOffset} onSearch={setSearch} searchPlaceholder="Search domains..."
                                isLoading={isLoading} emptyTitle="No redirections" emptyDescription="Create your first URL redirection."
                                emptyIcon={<ArrowRightLeft className="h-6 w-6" />} getKey={(host) => host.id}
                                actions={(host) => (
                                        <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => openEditWithForm(host)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleToggle(host)}>
                                                                <Power className="mr-2 h-4 w-4" /> {host.enabled ? "Disable" : "Enable"}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => setDeleteTarget(host)} className="text-destructive focus:text-destructive">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                </DropdownMenuContent>
                                        </DropdownMenu>
                                )}
                        />

                        {/* Create/Edit redirection dialog */}
                        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
                                <DialogContent className="max-w-2xl sm:max-h-[85vh]">
                                        <DialogHeader>
                                                <DialogTitle>{isEditing ? "Edit Redirection" : "New Redirection"}</DialogTitle>
                                                <DialogDescription>Configure a URL redirection with custom scheme and HTTP code.</DialogDescription>
                                        </DialogHeader>

                                        <Tabs defaultValue="details" className="w-full">
                                                <TabsList className="w-full">
                                                        <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                                                        <TabsTrigger value="ssl" className="flex-1">SSL</TabsTrigger>
                                                        <TabsTrigger value="advanced" className="flex-1">Advanced</TabsTrigger>
                                                </TabsList>

                                                <TabsContent value="details" className="space-y-4 mt-4">
                                                        <div className="space-y-2">
                                                                <Label>Domain Names <span className="text-destructive">*</span></Label>
                                                                <DomainInput value={formData.domainNames} onChange={(domains) => setFormData((p) => ({ ...p, domainNames: domains }))} />
                                                                <p className="text-xs text-muted-foreground">Press Enter, comma, or Tab to add. Supports paste of multiple domains.</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                                <Label>Forward Domain</Label>
                                                                <Input value={formData.forwardDomainName} onChange={(e) => setFormData((p) => ({ ...p, forwardDomainName: e.target.value }))} placeholder="Domain Name" />
                                                                <p className="text-xs text-muted-foreground">The target domain to redirect to</p>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                                <div className="space-y-2">
                                                                        <Label>Redirect Scheme</Label>
                                                                        <Select value={formData.forwardScheme} onValueChange={(v) => setFormData((p) => ({ ...p, forwardScheme: v as "auto" | "http" | "https" }))}>
                                                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                                                <SelectContent>
                                                                                        <SelectItem value="auto">Auto</SelectItem>
                                                                                        <SelectItem value="http">HTTP</SelectItem>
                                                                                        <SelectItem value="https">HTTPS</SelectItem>
                                                                                </SelectContent>
                                                                        </Select>
                                                                        <p className="text-xs text-muted-foreground">Auto keeps the current scheme</p>
                                                                </div>
                                                                <div className="space-y-2">
                                                                        <Label>HTTP Code</Label>
                                                                        <Select value={String(formData.forwardHttpCode)} onValueChange={(v) => setFormData((p) => ({ ...p, forwardHttpCode: Number(v) as 301 | 302 }))}>
                                                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                                                <SelectContent>
                                                                                        <SelectItem value="301">301 - Permanent</SelectItem>
                                                                                        <SelectItem value="302">302 - Temporary</SelectItem>
                                                                                </SelectContent>
                                                                        </Select>
                                                                        <p className="text-xs text-muted-foreground">301 is cached by browsers</p>
                                                                </div>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                                <div><Label>Preserve Path</Label><p className="text-xs text-muted-foreground">Keep the original URL path when redirecting</p></div>
                                                                <Switch checked={formData.preservePath} onCheckedChange={(c) => setFormData((p) => ({ ...p, preservePath: c }))} />
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
                                                                <Label>Block Common Exploits</Label>
                                                                <Switch checked={formData.blockExploits} onCheckedChange={(c) => setFormData((p) => ({ ...p, blockExploits: c }))} />
                                                        </div>
                                                        <div className="space-y-2">
                                                                <Label>Custom Nginx Configuration</Label>
                                                                <Textarea value={formData.advancedConfig} onChange={(e) => setFormData((p) => ({ ...p, advancedConfig: e.target.value }))} className="font-mono text-sm min-h-[200px]" placeholder="# Custom nginx config" />
                                                        </div>
                                                </TabsContent>
                                        </Tabs>

                                        <DialogFooter>
                                                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                                                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                                                        {createMutation.isPending || updateMutation.isPending ? (
                                                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                                                        ) : isEditing ? "Update" : "Create"}
                                                </Button>
                                        </DialogFooter>
                                </DialogContent>
                        </Dialog>

                        {/* Delete confirmation dialog */}
                        <ConfirmDialog
                                open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                                title="Delete Redirection" description={`Delete "${deleteTarget?.domainNames.join(", ")}"?`}
                                confirmLabel="Delete" variant="destructive" isLoading={deleteMutation.isPending} onConfirm={handleDelete}
                        />
                </div>
        );
}
