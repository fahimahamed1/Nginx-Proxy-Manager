{/* TCP/UDP stream management page */}
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCrudPage } from "@/hooks/use-crud-page";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
        Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, MoreHorizontal, Pencil, Trash2, Power, Radio, Loader2 } from "lucide-react";
import {
        DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import type { Stream, CreateStream } from "@/types";

interface StreamFormData {
        incomingPort: number;
        forwardIp: string;
        forwardingPort: number;
        tcpForwarding: boolean;
        udpForwarding: boolean;
        enabled: boolean;
}

const defaultFormData: StreamFormData = {
        incomingPort: 0,
        forwardIp: "",
        forwardingPort: 0,
        tcpForwarding: true,
        udpForwarding: false,
        enabled: true,
};

export function StreamsPage() {
        const { addToast } = useToast();
        const location = useLocation();
        const { data, isLoading, offset, setOffset, search, setSearch, createOpen, editTarget, deleteTarget, setDeleteTarget, isEditing, openCreate, openEdit, closeDialog, createMutation, updateMutation, deleteMutation, toggleMutation, handleDelete } =
                useCrudPage<Stream, CreateStream>({ resource: "streams" });
        const [formData, setFormData] = useState<StreamFormData>(defaultFormData);

        useEffect(() => {
                if (location.state?.openCreate) {
                        openCreateRef.current?.();
                        window.history.replaceState({}, document.title);
                }
        }, [location.state]);

        const openEditWithForm = (stream: Stream) => {
                setFormData({
                        incomingPort: stream.incomingPort,
                        forwardIp: stream.forwardIp,
                        forwardingPort: stream.forwardingPort,
                        tcpForwarding: stream.tcpForwarding,
                        udpForwarding: stream.udpForwarding,
                        enabled: stream.enabled,
                });
                openEdit(stream);
        };

        const openCreateWithForm = () => {
                setFormData(defaultFormData);
                openCreate();
        };
        const openCreateRef = useRef(openCreateWithForm);
        openCreateRef.current = openCreateWithForm;

        {/* Validate and submit stream create/edit form */}
        const handleSubmit = async () => {
                if (!formData.incomingPort || !formData.forwardIp || !formData.forwardingPort) {
                        addToast({ title: "Validation Error", description: "All fields are required", variant: "destructive" });
                        return;
                }
                if (!formData.tcpForwarding && !formData.udpForwarding) {
                        addToast({ title: "Validation Error", description: "At least one of TCP or UDP must be enabled", variant: "destructive" });
                        return;
                }

                const payload: CreateStream = {
                        incomingPort: Number(formData.incomingPort),
                        forwardIp: formData.forwardIp,
                        forwardingPort: Number(formData.forwardingPort),
                        tcpForwarding: formData.tcpForwarding,
                        udpForwarding: formData.udpForwarding,
                        enabled: formData.enabled,
                };

                try {
                        if (isEditing && editTarget) {
                                await updateMutation.mutateAsync({ id: editTarget.id, data: payload });
                                addToast({ title: "Stream Updated", variant: "success" });
                        } else {
                                await createMutation.mutateAsync(payload);
                                addToast({ title: "Stream Created", variant: "success" });
                        }
                        closeDialog();
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const handleToggle = async (stream: Stream) => {
                try {
                        await toggleMutation.mutateAsync({ id: stream.id, enabled: !stream.enabled });
                        addToast({
                                title: stream.enabled ? "Stream Disabled" : "Stream Enabled",
                                description: `Stream on port ${stream.incomingPort} has been ${stream.enabled ? "disabled" : "enabled"}.`,
                                variant: "success",
                        });
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const columns: Column<Stream>[] = [
                { key: "status", header: "Status", render: (s) => <StatusBadge enabled={s.enabled} />, className: "w-[100px]" },
                {
                        key: "incoming", header: "Incoming Port", render: (s) => (
                                <span className="font-mono text-sm font-medium">{s.incomingPort}</span>
                        ),
                },
                {
                        key: "forward", header: "Forward To", render: (s) => (
                                <span className="font-mono text-sm">{s.forwardIp}:{s.forwardingPort}</span>
                        ),
                },
                {
                        key: "protocol", header: "Protocol", render: (s) => {
                                const badges: string[] = [];
                                if (s.tcpForwarding) badges.push("TCP");
                                if (s.udpForwarding) badges.push("UDP");
                                return (
                                        <div className="flex gap-1">
                                                {badges.map((b) => (
                                                        <span key={b} className="text-xs font-medium bg-muted px-2 py-0.5 rounded">{b}</span>
                                                ))}
                                        </div>
                                );
                        },
                },
        ];

        return (
                <div className="space-y-6">
                        <PageHeader title="Streams" description="Manage TCP and UDP stream forwarding configurations.">
                                <Button onClick={openCreateWithForm}><Plus className="h-4 w-4" /> New Stream</Button>
                        </PageHeader>

                        <DataTable
                                columns={columns} data={data?.items ?? []} total={data?.total ?? 0} offset={offset} limit={ITEMS_PER_PAGE}
                                onPageChange={setOffset} onSearch={setSearch} searchPlaceholder="Search ports or IPs..."
                                isLoading={isLoading} emptyTitle="No streams" emptyDescription="Create a stream to forward TCP/UDP traffic."
                                emptyIcon={<Radio className="h-6 w-6" />} getKey={(s) => s.id}
                                actions={(stream) => (
                                        <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => openEditWithForm(stream)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleToggle(stream)}>
                                                                <Power className="mr-2 h-4 w-4" /> {stream.enabled ? "Disable" : "Enable"}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => setDeleteTarget(stream)} className="text-destructive focus:text-destructive">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                </DropdownMenuContent>
                                        </DropdownMenu>
                                )}
                        />

                        {/* Create/Edit stream dialog */}
                        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
                                <DialogContent className="max-w-lg">
                                        <DialogHeader>
                                                <DialogTitle>{isEditing ? "Edit Stream" : "New Stream"}</DialogTitle>
                                                <DialogDescription>Configure a TCP/UDP stream forwarding rule.</DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                                <Label>Incoming Port</Label>
                                                                <Input type="number" value={formData.incomingPort} onChange={(e) => setFormData((p) => ({ ...p, incomingPort: Number(e.target.value) }))} placeholder="Port" />
                                                        </div>
                                                        <div className="space-y-2">
                                                                <Label>Forwarding Port</Label>
                                                                <Input type="number" value={formData.forwardingPort} onChange={(e) => setFormData((p) => ({ ...p, forwardingPort: Number(e.target.value) }))} placeholder="Port" />
                                                        </div>
                                                </div>
                                                <div className="space-y-2">
                                                        <Label>Forwarding IP</Label>
                                                        <Input value={formData.forwardIp} onChange={(e) => setFormData((p) => ({ ...p, forwardIp: e.target.value }))} placeholder="IP Address" />
                                                </div>
                                                <div className="space-y-4">
                                                        <div className="flex items-center justify-between">
                                                                <Label>TCP Forwarding</Label>
                                                                <Switch checked={formData.tcpForwarding} onCheckedChange={(c) => setFormData((p) => ({ ...p, tcpForwarding: c }))} />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                                <Label>UDP Forwarding</Label>
                                                                <Switch checked={formData.udpForwarding} onCheckedChange={(c) => setFormData((p) => ({ ...p, udpForwarding: c }))} />
                                                        </div>
                                                </div>
                                        </div>
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
                                title="Delete Stream" description={`Delete stream on port ${deleteTarget?.incomingPort}?`}
                                confirmLabel="Delete" variant="destructive" isLoading={deleteMutation.isPending} onConfirm={handleDelete}
                        />
                </div>
        );
}
