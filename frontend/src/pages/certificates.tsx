{/* SSL/TLS certificate management page */}
import { useState, useRef } from "react";
import { useCertificates, useCreateCertificate, useDeleteCertificate } from "@/hooks/use-certificates";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DomainInput } from "@/components/shared/domain-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, MoreHorizontal, Trash2, RefreshCw, Shield, Upload, Globe, Download, FileKey, FileText, Link } from "lucide-react";
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
	DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateShort, cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { Certificate, CreateCertificate, CertificateProvider } from "@/types";

export function CertificatesPage() {
	const { addToast } = useToast();
	const qc = useQueryClient();
	const [offset, setOffset] = useState(0);
	const [search, setSearch] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const [createTab, setCreateTab] = useState<string>("http");
	const [deleteTarget, setDeleteTarget] = useState<Certificate | null>(null);
	const [autoRenewTarget, setAutoRenewTarget] = useState<{ cert: Certificate; enable: boolean } | null>(null);

	const { data, isLoading } = useCertificates({ search, offset, limit: ITEMS_PER_PAGE });
	const createMutation = useCreateCertificate();
	const deleteMutation = useDeleteCertificate(deleteTarget?.id ?? 0);
	const autoRenewMutation = useMutation({
		mutationFn: async ({ id, autoRenew }: { id: number; autoRenew: boolean }) =>
			api.put(`certificates/${id}`, { json: { autoRenew } }).json<Record<string, unknown>>(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["certificates"] });
		},
	});

	{/* Let's Encrypt form state */}
	const [leForm, setLeForm] = useState({ domainNames: [] as string[], email: "" });

	{/* Custom certificate upload form state */}
	const [customForm, setCustomForm] = useState({ niceName: "", domainNames: [] as string[] });
	const certFileRef = useRef<HTMLInputElement>(null);
	const keyFileRef = useRef<HTMLInputElement>(null);
	const [certFileName, setCertFileName] = useState("");
	const [keyFileName, setKeyFileName] = useState("");
	const [certFile, setCertFile] = useState<File | null>(null);
	const [keyFile, setKeyFile] = useState<File | null>(null);

	const openCreate = () => {
		setLeForm({ domainNames: [], email: "" });
		setCustomForm({ niceName: "", domainNames: [] });
		setCertFileName("");
		setKeyFileName("");
		setCertFile(null);
		setKeyFile(null);
		setCreateTab("http");
		setCreateOpen(true);
	};

	{/* Handle Let's Encrypt request or custom certificate upload */}
	const handleCreate = async () => {
		if (createTab === "http") {
			if (leForm.domainNames.length === 0) {
				addToast({ title: "Validation Error", description: "At least one domain is required", variant: "destructive" });
				return;
			}
			if (!leForm.email) {
				addToast({ title: "Validation Error", description: "Email is required for Let's Encrypt", variant: "destructive" });
				return;
			}

			try {
				const payload: CreateCertificate = {
					provider: "letsencrypt",
					domainNames: leForm.domainNames,
					meta: { letsencryptEmail: leForm.email, letsencryptAgree: true },
				};
				await createMutation.mutateAsync(payload);
				addToast({ title: "Certificate Requested", description: "Your Let's Encrypt certificate request has been submitted.", variant: "success" });
				setCreateOpen(false);
			} catch (err) {
				addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
			}
		} else {
			if (customForm.domainNames.length === 0) {
				addToast({ title: "Validation Error", description: "At least one domain is required", variant: "destructive" });
				return;
			}
			if (!certFile || !keyFile) {
				addToast({ title: "Validation Error", description: "Certificate file and key file are required", variant: "destructive" });
				return;
			}

			try {
				const payload: CreateCertificate = {
					provider: "other",
					niceName: customForm.niceName || undefined,
					domainNames: customForm.domainNames,
				};
				const created = await createMutation.mutateAsync(payload);

				const formData = new FormData();
				formData.append("certificate", certFile);
				formData.append("certificate_key", keyFile);

				await api.post(`certificates/${created.id}/upload`, { body: formData }).json<Record<string, unknown>>();

				addToast({ title: "Certificate Uploaded", description: "Your custom certificate has been uploaded.", variant: "success" });
				qc.invalidateQueries({ queryKey: ["certificates"] });
				setCreateOpen(false);
			} catch (err) {
				addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
			}
		}
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		try {
			await deleteMutation.mutateAsync();
			addToast({ title: "Certificate Deleted", variant: "success" });
			setDeleteTarget(null);
		} catch (err) {
			addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
		}
	};

	{/* Download certificate files (fullchain, private key, or CA chain) */}
	const handleDownload = async (certId: number, type: "fullchain" | "privkey" | "chain") => {
		try {
			const token = useAuthStore.getState().token ?? "";
			const response = await fetch(`/api/certificates/${certId}/download?type=${type}`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!response.ok) {
				const err = await response.json().catch(() => ({ error: { message: "Download failed" } }));
				throw new Error((err as any)?.error?.message || "Download failed");
			}
			const disposition = response.headers.get("Content-Disposition");
			let fileName = `certificate-${type}.pem`;
			if (disposition) {
				const match = disposition.match(/filename="?([^";\n]+)"?/);
				if (match) fileName = match[1];
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			addToast({ title: "Downloaded", description: `${fileName} has been downloaded.`, variant: "success" });
		} catch (err) {
			addToast({ title: "Download Failed", description: getApiErrorMessage(err), variant: "destructive" });
		}
	};

	const handleRenew = async (cert: Certificate) => {
		try {
			await api.post(`certificates/${cert.id}/renew`).json<Record<string, unknown>>();
			addToast({ title: "Renewal Requested", description: "Certificate renewal has been initiated.", variant: "success" });
		} catch (err) {
			addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
		}
	};

	const handleAutoRenewToggle = (cert: Certificate, enable: boolean) => {
		setAutoRenewTarget({ cert, enable });
	};

	const confirmAutoRenew = async () => {
		if (!autoRenewTarget) return;
		try {
			await autoRenewMutation.mutateAsync({
				id: autoRenewTarget.cert.id,
				autoRenew: autoRenewTarget.enable,
			});
			addToast({
				title: autoRenewTarget.enable ? "Auto-Renewal Enabled" : "Auto-Renewal Disabled",
				description: `Certificate "${autoRenewTarget.cert.niceName || autoRenewTarget.cert.domainNames[0]}" will ${autoRenewTarget.enable ? "" : "no longer "}renew automatically.`,
				variant: "success",
			});
			setAutoRenewTarget(null);
		} catch (err) {
			addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
		}
	};

	const getProviderLabel = (provider: CertificateProvider) => {
		const labels: Record<string, string> = { letsencrypt: "Let's Encrypt", other: "Custom" };
		return labels[provider] ?? provider;
	};

	const columns: Column<Certificate>[] = [
		{
			key: "name", header: "Name", render: (cert) => (
				<div className="flex flex-col">
					<span className="font-medium text-sm">{cert.niceName || cert.domainNames[0]}</span>
					<div className="flex flex-wrap gap-1 mt-1">
						{cert.domainNames.slice(0, 3).map((d) => <span key={d} className="text-xs font-mono text-muted-foreground">{d}</span>)}
						{cert.domainNames.length > 3 && <span className="text-xs text-muted-foreground">+{cert.domainNames.length - 3}</span>}
					</div>
				</div>
			),
		},
		{
			key: "provider", header: "Provider", render: (cert) => (
				<Badge variant="outline" className="text-xs">{getProviderLabel(cert.provider)}</Badge>
			),
			className: "w-[160px]",
		},
		{
			key: "expires", header: "Expires", render: (cert) => {
				const isExpiring = cert.expiresOn
					? new Date(cert.expiresOn).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
					: false;
				return (
					<span className={cn("text-sm", isExpiring ? "text-destructive font-medium" : "text-muted-foreground")}>
						{cert.expiresOn ? formatDateShort(cert.expiresOn) : "N/A"}
					</span>
				);
			},
			className: "w-[160px]",
		},
		{
			key: "status", header: "Status", render: (cert) => {
				const isExpiring = cert.expiresOn
					? (() => { const diff = new Date(cert.expiresOn).getTime() - Date.now(); return diff >= 0 && diff < 30 * 24 * 60 * 60 * 1000; })()
					: false;
				return cert.provider === "letsencrypt"
					? <Badge variant={isExpiring ? "warning" : "success"} className="gap-1">
							<span className={cn("w-1.5 h-1.5 rounded-full", isExpiring ? "bg-warning" : "bg-success")} />
							{isExpiring ? "Expiring" : "Valid"}
						</Badge>
					: <Badge variant="secondary">Custom</Badge>;
			},
			className: "w-[100px]",
		},
		{
			key: "autoRenew", header: "Auto-Renew", render: (cert) => (
				cert.provider === "letsencrypt" ? (
					<Switch
						checked={cert.autoRenew}
						onCheckedChange={(checked) => handleAutoRenewToggle(cert, checked)}
						className="scale-75 origin-left"
					/>
				) : (
					<span className="text-xs text-muted-foreground">N/A</span>
				)
			),
			className: "w-[110px]",
		},
	];

	return (
		<div className="space-y-6">
			<PageHeader title="Certificates" description="Manage SSL/TLS certificates for your hosts.">
				<Button onClick={openCreate}><Plus className="h-4 w-4" /> Request Certificate</Button>
			</PageHeader>

			<DataTable
				columns={columns} data={data?.items ?? []} total={data?.total ?? 0} offset={offset} limit={ITEMS_PER_PAGE}
				onPageChange={setOffset} onSearch={setSearch} searchPlaceholder="Search certificates..."
				isLoading={isLoading} emptyTitle="No certificates" emptyDescription="Request your first SSL certificate."
				emptyIcon={<Shield className="h-6 w-6" />} getKey={(cert) => cert.id}
				actions={(cert) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuSub>
								<DropdownMenuSubTrigger><Download className="mr-2 h-4 w-4" /> Download</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									<DropdownMenuItem onClick={() => handleDownload(cert.id, "fullchain")}>
										<FileText className="mr-2 h-4 w-4" /> Certificate (Full Chain)
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => handleDownload(cert.id, "privkey")}>
										<FileKey className="mr-2 h-4 w-4" /> Private Key
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => handleDownload(cert.id, "chain")}>
										<Link className="mr-2 h-4 w-4" /> CA Chain
									</DropdownMenuItem>
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							{cert.provider === "letsencrypt" && (
								<DropdownMenuItem onClick={() => handleRenew(cert)}><RefreshCw className="mr-2 h-4 w-4" /> Renew</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setDeleteTarget(cert)} className="text-destructive focus:text-destructive">
								<Trash2 className="mr-2 h-4 w-4" /> Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			{/* Create certificate dialog */}
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="max-w-2xl sm:max-h-[85vh]">
					<DialogHeader>
						<DialogTitle>Request Certificate</DialogTitle>
						<DialogDescription>Choose a method to obtain an SSL certificate.</DialogDescription>
					</DialogHeader>

					<Tabs value={createTab} onValueChange={setCreateTab} className="w-full">
						<TabsList className="w-full">
							<TabsTrigger value="http" className="flex-1 gap-2"><Globe className="h-3.5 w-3.5" /> HTTP Challenge</TabsTrigger>
							<TabsTrigger value="custom" className="flex-1 gap-2"><Upload className="h-3.5 w-3.5" /> Custom</TabsTrigger>
						</TabsList>

						<TabsContent value="http" className="space-y-4 mt-4">
							<div className="space-y-2">
								<Label>Domain Names <span className="text-destructive">*</span></Label>
								<DomainInput value={leForm.domainNames} onChange={(d) => setLeForm((p) => ({ ...p, domainNames: d }))} />
								<p className="text-xs text-muted-foreground">Press Enter, comma, or Tab to add. Supports paste of multiple domains.</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="le-email">Email for Let's Encrypt</Label>
								<Input id="le-email" type="email" value={leForm.email} onChange={(e) => setLeForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
								<p className="text-xs text-muted-foreground">Used for Let's Encrypt notifications and registration</p>
							</div>
						</TabsContent>

						<TabsContent value="custom" className="space-y-4 mt-4">
							<div className="space-y-2">
								<Label htmlFor="custom-nice-name">Nice Name</Label>
								<Input
									id="custom-nice-name"
									value={customForm.niceName}
									onChange={(e) => setCustomForm((p) => ({ ...p, niceName: e.target.value }))}
									placeholder="My Custom Certificate"
								/>
								<p className="text-xs text-muted-foreground">A friendly name to identify this certificate</p>
							</div>

							<div className="space-y-2">
								<Label>Domain Names <span className="text-destructive">*</span></Label>
								<DomainInput value={customForm.domainNames} onChange={(d) => setCustomForm((p) => ({ ...p, domainNames: d }))} />
								<p className="text-xs text-muted-foreground">Press Enter, comma, or Tab to add. Supports paste of multiple domains.</p>
							</div>

							<div className="space-y-2">
								<Label>Certificate File</Label>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => certFileRef.current?.click()}
									>
										<Upload className="h-3.5 w-3.5 mr-1.5" />
										Choose File
									</Button>
									<span className="text-sm text-muted-foreground">
										{certFileName || "No file selected"}
									</span>
									<input
										ref={certFileRef}
										type="file"
										accept=".pem,.crt"
										className="hidden"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) {
												setCertFile(file);
												setCertFileName(file.name);
											}
										}}
									/>
								</div>
								<p className="text-xs text-muted-foreground">Upload a .pem or .crt certificate file</p>
							</div>

							<div className="space-y-2">
								<Label>Certificate Key File</Label>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => keyFileRef.current?.click()}
									>
										<Upload className="h-3.5 w-3.5 mr-1.5" />
										Choose File
									</Button>
									<span className="text-sm text-muted-foreground">
										{keyFileName || "No file selected"}
									</span>
									<input
										ref={keyFileRef}
										type="file"
										accept=".pem,.key"
										className="hidden"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) {
												setKeyFile(file);
												setKeyFileName(file.name);
											}
										}}
									/>
								</div>
								<p className="text-xs text-muted-foreground">Upload a .pem or .key private key file</p>
							</div>
						</TabsContent>
					</Tabs>

					<DialogFooter>
						<Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
						<Button onClick={handleCreate} disabled={createMutation.isPending}>
							{createMutation.isPending ? "Creating..." : createTab === "custom" ? "Upload" : "Request"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation dialog */}
			<ConfirmDialog
				open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
				title="Delete Certificate" description={`Delete certificate "${deleteTarget?.niceName || deleteTarget?.domainNames[0]}"?`}
				confirmLabel="Delete" variant="destructive" isLoading={deleteMutation.isPending} onConfirm={handleDelete}
			/>

			{/* Auto-renewal toggle confirmation */}
			<ConfirmDialog
				open={autoRenewTarget !== null}
				onOpenChange={(open) => { if (!open) setAutoRenewTarget(null); }}
				title={autoRenewTarget?.enable ? "Enable Auto-Renewal" : "Disable Auto-Renewal"}
				description={
					autoRenewTarget?.enable
						? `Enable automatic renewal for "${autoRenewTarget?.cert.niceName || autoRenewTarget?.cert.domainNames[0]}"? The system will automatically renew this Let's Encrypt certificate before it expires.`
						: `Disable automatic renewal for "${autoRenewTarget?.cert.niceName || autoRenewTarget?.cert.domainNames[0]}"? You will need to manually renew the certificate before it expires to avoid downtime.`
				}
				confirmLabel={autoRenewTarget?.enable ? "Enable" : "Disable"}
				variant={autoRenewTarget?.enable ? "default" : "destructive"}
				isLoading={autoRenewMutation.isPending}
				onConfirm={confirmAutoRenew}
			/>
		</div>
	);
}
