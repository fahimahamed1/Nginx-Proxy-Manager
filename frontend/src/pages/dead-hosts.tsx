{/* 404 host management page */}
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
        Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, MoreHorizontal, Pencil, Trash2, Power, Ban, Loader2 } from "lucide-react";
import {
        DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import type { DeadHost, CreateDeadHost } from "@/types";

interface DeadHostFormData {
        domainNames: string[];
        certificateId: number;
        sslForced: boolean;
        hstsEnabled: boolean;
        hstsSubdomains: boolean;
        http2Support: boolean;
        advancedConfig: string;
        enabled: boolean;
}

const defaultFormData: DeadHostFormData = {
        domainNames: [],
        certificateId: 0,
        sslForced: false,
        hstsEnabled: false,
        hstsSubdomains: false,
        http2Support: false,
        advancedConfig: "",
        enabled: true,
};

export function DeadHostsPage() {
        const { addToast } = useToast();
        const location = useLocation();
        const { data, isLoading, offset, setOffset, search, setSearch, createOpen, editTarget, deleteTarget, setDeleteTarget, isEditing, openCreate, openEdit, closeDialog, createMutation, updateMutation, deleteMutation, toggleMutation, handleDelete } =
                useCrudPage<DeadHost, CreateDeadHost>({ resource: "dead-hosts" });
        const [formData, setFormData] = useState<DeadHostFormData>(defaultFormData);

        const { data: certificates } = useCertificates({ limit: 500 });

        useEffect(() => {
                if (location.state?.openCreate) {
                        openCreateRef.current?.();
                        window.history.replaceState({}, document.title);
                }
        }, [location.state]);

        const openEditWithForm = (host: DeadHost) => {
                setFormData({
                        domainNames: [...host.domainNames],
                        certificateId: host.certificateId,
                        sslForced: host.sslForced,
                        hstsEnabled: host.hstsEnabled,
                        hstsSubdomains: host.hstsSubdomains,
                        http2Support: host.http2Support,
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

        {/* Validate and submit 404 host create/edit form */}
        const handleSubmit = async () => {
                if (formData.domainNames.length === 0) {
                        addToast({ title: "Validation Error", description: "At least one domain is required", variant: "destructive" });
                        return;
                }

                const payload: CreateDeadHost = {
                        domainNames: formData.domainNames,
                        certificateId: formData.certificateId || undefined,
                        sslForced: formData.sslForced,
                        hstsEnabled: formData.hstsEnabled,
                        hstsSubdomains: formData.hstsSubdomains,
                        http2Support: formData.http2Support,
                        advancedConfig: formData.advancedConfig || undefined,
                        enabled: formData.enabled,
                };

                try {
                        if (isEditing && editTarget) {
                                await updateMutation.mutateAsync({ id: editTarget.id, data: payload });
                                addToast({ title: "404 Host Updated", variant: "success" });
                        } else {
                                await createMutation.mutateAsync(payload);
                                addToast({ title: "404 Host Created", variant: "success" });
                        }
                        closeDialog();
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const handleToggle = async (host: DeadHost) => {
                try {
                        await toggleMutation.mutateAsync({ id: host.id, enabled: !host.enabled });
                        addToast({
                                title: host.enabled ? "404 Host Disabled" : "404 Host Enabled",
                                description: `"${host.domainNames[0]}" has been ${host.enabled ? "disabled" : "enabled"}.`,
                                variant: "success",
                        });
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const columns: Column<DeadHost>[] = [
                { key: "status", header: "Status", render: (host) => <StatusBadge enabled={host.enabled} />, className: "w-[100px]" },
                {
                        key: "domainNames", header: "Domains", render: (host) => (
                                <div className="flex flex-wrap gap-1">
                                        {host.domainNames.map((d) => <Badge key={d} variant="outline" className="font-mono text-xs">{d}</Badge>)}
                                </div>
                        ),
                },
                {
                        key: "ssl", header: "SSL", render: (host) => host.certificateId > 0
                                ? <Badge variant="default" className="gap-1">Active</Badge>
                                : <span className="text-xs text-muted-foreground">None</span>,
                        className: "w-[100px]",
                },
        ];

        return (
                <div className="space-y-6">
                        <PageHeader title="404 Hosts" description="Configure domains that should return a 404 Not Found response.">
                                <Button onClick={openCreateWithForm}><Plus className="h-4 w-4" /> New 404 Host</Button>
                        </PageHeader>

                        <DataTable
                                columns={columns} data={data?.items ?? []} total={data?.total ?? 0} offset={offset} limit={ITEMS_PER_PAGE}
                                onPageChange={setOffset} onSearch={setSearch} searchPlaceholder="Search domains..."
                                isLoading={isLoading} emptyTitle="No 404 hosts" emptyDescription="Create a 404 host to block specific domains."
                                emptyIcon={<Ban className="h-6 w-6" />} getKey={(host) => host.id}
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

                        {/* Create/Edit 404 host dialog */}
                        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
                                <DialogContent className="max-w-2xl sm:max-h-[85vh]">
                                        <DialogHeader>
                                                <DialogTitle>{isEditing ? "Edit 404 Host" : "New 404 Host"}</DialogTitle>
                                                <DialogDescription>Configure a domain to return 404 Not Found.</DialogDescription>
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
                                                                <DomainInput value={formData.domainNames} onChange={(d) => setFormData((p) => ({ ...p, domainNames: d }))} />
                                                                <p className="text-xs text-muted-foreground">Press Enter, comma, or Tab to add. Supports paste of multiple domains.</p>
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
                                                                <Label>Custom Nginx Configuration</Label>
                                                                <Textarea value={formData.advancedConfig} onChange={(e) => setFormData((p) => ({ ...p, advancedConfig: e.target.value }))} className="font-mono text-sm min-h-[200px]" placeholder="# Custom config" />
                                                        </div>
                                                </TabsContent>
                                        </Tabs>
                                        <DialogFooter>
                                                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                                                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                                                        {createMutation.isPending || updateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : isEditing ? "Update" : "Create"}
                                                </Button>
                                        </DialogFooter>
                                </DialogContent>
                        </Dialog>

                        {/* Delete confirmation dialog */}
                        <ConfirmDialog
                                open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                                title="Delete 404 Host" description={`Delete "${deleteTarget?.domainNames.join(", ")}"?`}
                                confirmLabel="Delete" variant="destructive" isLoading={deleteMutation.isPending} onConfirm={handleDelete}
                        />
                </div>
        );
}
