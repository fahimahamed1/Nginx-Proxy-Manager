{/* Access list management page */}
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCrudPage } from "@/hooks/use-crud-page";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, MoreHorizontal, Pencil, Trash2, Users, ShieldCheck, X, Loader2 } from "lucide-react";
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import type { AccessList, CreateAccessList, AccessListAuthItem } from "@/types";

interface AccessListFormData {
	name: string;
	items: AccessListAuthItem[];
}

const defaultFormData: AccessListFormData = {
	name: "",
	items: [],
};

export function AccessListsPage() {
	const { addToast } = useToast();
	const location = useLocation();
	const { data, isLoading, offset, setOffset, search, setSearch, createOpen, editTarget, deleteTarget, setDeleteTarget, isEditing, openCreate, openEdit, closeDialog, createMutation, updateMutation, deleteMutation } =
		useCrudPage<AccessList, CreateAccessList>({ resource: "access-lists", invalidateDashboard: false });
	const [formData, setFormData] = useState<AccessListFormData>(defaultFormData);

	useEffect(() => {
		if (location.state?.openCreate) {
			openCreateRef.current?.();
			window.history.replaceState({}, document.title);
		}
	}, [location.state]);

	const openEditWithForm = (list: AccessList) => {
		setFormData({
			name: list.name,
			items: list.items.map((i) => ({ id: i.id, username: i.username, password: "" })),
		});
		openEdit(list);
	};

	const openCreateWithForm = () => {
		setFormData(defaultFormData);
		openCreate();
	};
	const openCreateRef = useRef(openCreateWithForm);
	openCreateRef.current = openCreateWithForm;

	{/* Validate and submit access list create/edit form */}
	const handleSubmit = async () => {
		if (!formData.name) {
			addToast({ title: "Validation Error", description: "Name is required", variant: "destructive" });
			return;
		}

		const payload: CreateAccessList = {
			name: formData.name,
			items: formData.items,
		};

		try {
			if (isEditing) {
				await updateMutation.mutateAsync({ id: editTarget!.id, data: payload });
				addToast({ title: "Access List Updated", variant: "success" });
			} else {
				await createMutation.mutateAsync(payload);
				addToast({ title: "Access List Created", variant: "success" });
			}
			closeDialog();
		} catch (err) {
			addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
		}
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		try {
			await deleteMutation.mutateAsync(deleteTarget.id);
			addToast({ title: "Access List Deleted", variant: "success" });
			setDeleteTarget(null);
		} catch (err) {
			addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
		}
	};

	{/* Auth item management helpers */}
	const addAuthItem = () => {
		setFormData((p) => ({ ...p, items: [...p.items, { username: "", password: "" }] }));
	};

	const removeAuthItem = (index: number) => {
		setFormData((p) => ({ ...p, items: p.items.filter((_, i) => i !== index) }));
	};

	const updateAuthItem = (index: number, field: keyof AccessListAuthItem, value: string) => {
		setFormData((p) => ({
			...p,
			items: p.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
		}));
	};

	const columns: Column<AccessList>[] = [
		{ key: "name", header: "Name", render: (al) => <span className="font-medium text-sm">{al.name}</span> },
		{
			key: "auth_count", header: "Basic Auth", render: (al) => (
				<div className="flex items-center gap-1.5">
					<ShieldCheck className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm">{al.items?.length ?? 0} users</span>
				</div>
			),
		},
	];

	return (
		<div className="space-y-6">
			<PageHeader title="Access Lists" description="Manage basic authentication for your hosts.">
				<Button onClick={openCreateWithForm}><Plus className="h-4 w-4" /> New Access List</Button>
			</PageHeader>

			<DataTable
				columns={columns} data={data?.items ?? []} total={data?.total ?? 0} offset={offset} limit={ITEMS_PER_PAGE}
				onPageChange={setOffset} onSearch={setSearch} searchPlaceholder="Search access lists..."
				isLoading={isLoading} emptyTitle="No access lists" emptyDescription="Create an access list to protect your hosts."
				emptyIcon={<Users className="h-6 w-6" />} getKey={(al) => al.id}
				actions={(al) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => openEditWithForm(al)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setDeleteTarget(al)} className="text-destructive focus:text-destructive">
								<Trash2 className="mr-2 h-4 w-4" /> Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			{/* Create/Edit access list dialog */}
			<Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
				<DialogContent className="max-w-2xl sm:max-h-[85vh]">
					<DialogHeader>
						<DialogTitle>{isEditing ? "Edit Access List" : "New Access List"}</DialogTitle>
						<DialogDescription>Configure basic authentication for your hosts.</DialogDescription>
					</DialogHeader>

					<div className="space-y-6">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input id="name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="Access List Name" />
						</div>

						{/* Basic authorization entries */}
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label>Basic Authorization</Label>
								<Button type="button" variant="outline" size="sm" onClick={addAuthItem}>
									<Plus className="h-3.5 w-3.5 mr-1" /> Add User
								</Button>
							</div>
							{formData.items.length === 0 ? (
								<p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">No authorization entries. Click "Add User" to add one.</p>
							) : (
								<div className="space-y-2 max-h-48 overflow-y-auto">
									{formData.items.map((item, idx) => (
										<div key={idx} className="flex items-center gap-2">
											<Input value={item.username} onChange={(e) => updateAuthItem(idx, "username", e.target.value)} placeholder="Username" className="flex-1" />
											<Input value={item.password} onChange={(e) => updateAuthItem(idx, "password", e.target.value)} placeholder={isEditing ? "Leave blank to keep" : "Password"} type="password" className="flex-1" />
											<Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeAuthItem(idx)}>
												<X className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							)}
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
				title="Delete Access List" description={`Delete "${deleteTarget?.name}"? This may affect proxy hosts using this list.`}
				confirmLabel="Delete" variant="destructive" isLoading={deleteMutation.isPending} onConfirm={handleDelete}
			/>
		</div>
	);
}
