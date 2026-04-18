{/* User management page */}
import { useState } from "react";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
import { useAuthStore } from "@/stores/auth";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
        Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
        Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Plus, MoreHorizontal, Pencil, Trash2, Users, Shield, LogIn, Key, Loader2 } from "lucide-react";
import {
        DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api";
import { getInitials } from "@/lib/utils";
import type { User } from "@/types";

type PermissionLevel = "manage" | "view" | "hidden";

interface UserPermissions {
        visibility: "user" | "all";
        proxyHosts: PermissionLevel;
        redirectionHosts: PermissionLevel;
        deadHosts: PermissionLevel;
        streams: PermissionLevel;
        accessLists: PermissionLevel;
        certificates: PermissionLevel;
}

const defaultPermissions: UserPermissions = {
        visibility: "all",
        proxyHosts: "manage",
        redirectionHosts: "manage",
        deadHosts: "manage",
        streams: "manage",
        accessLists: "manage",
        certificates: "manage",
};

interface UserFormData {
        name: string;
        email: string;
        password: string;
        roles: string[];
        isDisabled: boolean;
}

const defaultFormData: UserFormData = {
        name: "",
        email: "",
        password: "",
        roles: ["user"],
        isDisabled: false,
};

export function UsersPage() {
        const { addToast } = useToast();
        const { setAuth, clearAuth } = useAuthStore();
        const navigate = useNavigate();
        const currentUser = useAuthStore((s) => s.user);
        const isAdmin = currentUser?.roles?.includes("admin");
        const [offset, setOffset] = useState(0);
        const [search, setSearch] = useState("");
        const [createOpen, setCreateOpen] = useState(false);
        const [editUser, setEditUser] = useState<User | null>(null);
        const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
        const [formData, setFormData] = useState<UserFormData>(defaultFormData);
        const [permissionsTarget, setPermissionsTarget] = useState<User | null>(null);
        const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);
        const [permissionsSaving, setPermissionsSaving] = useState(false);
        const [impersonating, setImpersonating] = useState<string | null>(null);

        const { data, isLoading } = useUsers({ search, offset, limit: ITEMS_PER_PAGE });
        const createMutation = useCreateUser();
        const updateMutation = useUpdateUser(editUser?.id ?? 0);
        const deleteMutation = useDeleteUser(deleteTarget?.id ?? 0);

        const isEditing = editUser !== null;
        const isSelf = editUser?.id === currentUser?.id;

        const openCreate = () => { setEditUser(null); setFormData(defaultFormData); setCreateOpen(true); };

        const openEdit = (user: User) => {
                setEditUser(user);
                setFormData({ name: user.name, email: user.email, password: "", roles: [...user.roles], isDisabled: user.isDisabled });
                setCreateOpen(true);
        };

        {/* Load existing user permissions into form */}
        const openPermissions = (user: User) => {
                setPermissionsTarget(user);
                setPermissions({
                        visibility: (user.visibility as "user" | "all") ?? "all",
                        proxyHosts: (user.proxyHosts as PermissionLevel) ?? "manage",
                        redirectionHosts: (user.redirectionHosts as PermissionLevel) ?? "manage",
                        deadHosts: (user.deadHosts as PermissionLevel) ?? "manage",
                        streams: (user.streams as PermissionLevel) ?? "manage",
                        accessLists: (user.accessLists as PermissionLevel) ?? "manage",
                        certificates: (user.certificates as PermissionLevel) ?? "manage",
                });
        };

        {/* Save user permissions to API */}
        const handleSavePermissions = async () => {
                if (!permissionsTarget) return;
                setPermissionsSaving(true);
                try {
                        await api.put(`users/${permissionsTarget.id}/permissions`, { json: permissions }).json<Record<string, unknown>>();
                        addToast({ title: "Permissions Updated", description: `Permissions for "${permissionsTarget.name}" have been saved.`, variant: "success" });
                        setPermissionsTarget(null);
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                } finally {
                        setPermissionsSaving(false);
                }
        };

        {/* Admin sign-in as another user (impersonation) */}
        const handleSignInAs = async (user: User) => {
                if (!isAdmin || user.id === currentUser?.id) return;
                try {
                        const res = await api.post(`users/${user.id}/login`).json<{ token: string; expiresOn: string; user?: { id: number; name: string; email: string; roles: string[] } }>();
                        const roles = res.user?.roles ?? user.roles;
                        setAuth(res.token, { id: user.id, name: user.name, email: user.email, roles });
                        setImpersonating(user.email);
                        addToast({ title: "Signed In As User", description: `You are now signed in as ${user.email}.`, variant: "success" });
                        navigate("/");
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        {/* Validate and submit user create/edit form */}
        const handleSubmit = async () => {
                if (!formData.name || !formData.email) {
                        addToast({ title: "Validation Error", description: "Name and email are required", variant: "destructive" });
                        return;
                }
                if (!isEditing && !formData.password) {
                        addToast({ title: "Validation Error", description: "Password is required for new users", variant: "destructive" });
                        return;
                }
                if (!isEditing && formData.password.length < 8) {
                        addToast({ title: "Validation Error", description: "Password must be at least 8 characters", variant: "destructive" });
                        return;
                }

                try {
                        if (isEditing) {
                                const payload: Record<string, unknown> = { name: formData.name, email: formData.email, roles: formData.roles, isDisabled: formData.isDisabled };
                                if (formData.password) payload.password = formData.password;
                                await updateMutation.mutateAsync(payload as Parameters<typeof updateMutation.mutateAsync>[0]);
                                addToast({ title: "User Updated", variant: "success" });
                        } else {
                                await createMutation.mutateAsync({ name: formData.name, email: formData.email, password: formData.password, roles: formData.roles });
                                addToast({ title: "User Created", variant: "success" });
                        }
                        setCreateOpen(false);
                        setEditUser(null);
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const handleDelete = async () => {
                if (!deleteTarget) return;
                try {
                        await deleteMutation.mutateAsync();
                        addToast({ title: "User Deleted", variant: "success" });
                        setDeleteTarget(null);
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        const resourceLabels: { key: keyof UserPermissions; label: string }[] = [
                { key: "proxyHosts", label: "Proxy Hosts" },
                { key: "redirectionHosts", label: "Redirection Hosts" },
                { key: "deadHosts", label: "404 Hosts" },
                { key: "streams", label: "Streams" },
                { key: "accessLists", label: "Access Lists" },
                { key: "certificates", label: "Certificates" },
        ];

        const columns: Column<User>[] = [
                {
                        key: "name", header: "User", render: (user) => (
                                <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                                <AvatarFallback className="text-xs bg-muted">{getInitials(user.name)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                                <p className="font-medium text-sm">{user.name}</p>
                                                <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                </div>
                        ),
                },
                {
                        key: "role", header: "Role", render: (user) => (
                                user.roles?.includes("admin")
                                        ? <Badge variant="default" className="gap-1"><Shield className="h-3 w-3" /> Admin</Badge>
                                        : <Badge variant="secondary">User</Badge>
                        ),
                        className: "w-[100px]",
                },
                {
                        key: "status", header: "Status", render: (user) => (
                                <Badge variant={user.isDisabled ? "destructive" : "success"} className="gap-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${user.isDisabled ? "bg-destructive" : "bg-success"}`} />
                                        {user.isDisabled ? "Disabled" : "Active"}
                                </Badge>
                        ),
                        className: "w-[100px]",
                },
        ];

        return (
                <div className="space-y-6">
                        {impersonating && (
                                <div className="flex items-center justify-between bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
                                        <div className="flex items-center gap-2">
                                                <LogIn className="h-4 w-4 text-warning" />
                                                <span className="text-sm font-medium">
                                                        You are signed in as <span className="text-warning">{impersonating}</span>
                                                </span>
                                        </div>
                                        <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                        clearAuth();
                                                        setImpersonating(null);
                                                        navigate("/login");
                                                }}
                                        >
                                                Sign Out
                                        </Button>
                                </div>
                        )}

                        <PageHeader title="Users" description="Manage user accounts and permissions.">
                                <Button onClick={openCreate}><Plus className="h-4 w-4" /> New User</Button>
                        </PageHeader>

                        <DataTable
                                columns={columns} data={data?.items ?? []} total={data?.total ?? 0} offset={offset} limit={ITEMS_PER_PAGE}
                                onPageChange={setOffset} onSearch={setSearch} searchPlaceholder="Search users..."
                                isLoading={isLoading} emptyTitle="No users" emptyDescription="Create user accounts for team management."
                                emptyIcon={<Users className="h-6 w-6" />} getKey={(user) => user.id}
                                actions={(user) => (
                                        <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => openEdit(user)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => openPermissions(user)}><Key className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
                                                        {isAdmin && user.id !== currentUser?.id && (
                                                                <DropdownMenuItem onClick={() => handleSignInAs(user)}><LogIn className="mr-2 h-4 w-4" /> Sign In As</DropdownMenuItem>
                                                        )}
                                                        {user.id !== currentUser?.id && (
                                                                <>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem onClick={() => setDeleteTarget(user)} className="text-destructive focus:text-destructive">
                                                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                                        </DropdownMenuItem>
                                                                </>
                                                        )}
                                                </DropdownMenuContent>
                                        </DropdownMenu>
                                )}
                        />

                        {/* Create/Edit user dialog */}
                        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditUser(null); } }}>
                                <DialogContent className="max-w-md">
                                        <DialogHeader>
                                                <DialogTitle>{isEditing ? "Edit User" : "New User"}</DialogTitle>
                                                <DialogDescription>{isEditing ? "Update user account details." : "Create a new user account."}</DialogDescription>
                                        </DialogHeader>

                                        <div className="space-y-4">
                                                <div className="space-y-2">
                                                        <Label htmlFor="user-name">Name</Label>
                                                        <Input id="user-name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="Name" />
                                                </div>
                                                <div className="space-y-2">
                                                        <Label htmlFor="user-email">Email</Label>
                                                        <Input id="user-email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
                                                </div>
                                                <div className="space-y-2">
                                                        <Label htmlFor="user-password">{isEditing ? "New Password" : "Password"}</Label>
                                                        <Input id="user-password" type="password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} placeholder={isEditing ? "Leave blank to keep" : "Password"} />
                                                </div>
                                                <div className="space-y-2">
                                                        <Label>Role</Label>
                                                        <Select value={formData.roles[0] ?? "user"} onValueChange={(v) => setFormData((p) => ({ ...p, roles: [v] }))}>
                                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                        <SelectItem value="admin">Admin</SelectItem>
                                                                        <SelectItem value="user">User</SelectItem>
                                                                </SelectContent>
                                                        </Select>
                                                </div>
                                                {isEditing && !isSelf && (
                                                        <div className="flex items-center justify-between">
                                                                <div><Label>Disabled</Label><p className="text-xs text-muted-foreground">Prevent this user from signing in</p></div>
                                                                <Switch checked={formData.isDisabled} onCheckedChange={(c) => setFormData((p) => ({ ...p, isDisabled: c }))} />
                                                        </div>
                                                )}
                                        </div>

                                        <DialogFooter>
                                                <Button variant="outline" onClick={() => { setCreateOpen(false); setEditUser(null); }}>Cancel</Button>
                                                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                                                        {createMutation.isPending || updateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : isEditing ? "Update" : "Create"}
                                                </Button>
                                        </DialogFooter>
                                </DialogContent>
                        </Dialog>

                        {/* User permissions dialog */}
                        <Dialog open={permissionsTarget !== null} onOpenChange={(open) => { if (!open) setPermissionsTarget(null); }}>
                                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                                        <DialogHeader>
                                                <DialogTitle>
                                                        <div className="flex items-center gap-2">
                                                                <Key className="h-4 w-4" />
                                                                Permissions — {permissionsTarget?.name}
                                                        </div>
                                                </DialogTitle>
                                                <DialogDescription>
                                                        Configure resource access permissions for this user.
                                                </DialogDescription>
                                        </DialogHeader>

                                        <div className="space-y-6">
                                                {/* Visibility settings */}
                                                <div className="space-y-2">
                                                        <Label>Visibility</Label>
                                                        <p className="text-xs text-muted-foreground">Control which hosts this user can see.</p>
                                                        <div className="flex gap-4 mt-2">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                        <input
                                                                                type="radio"
                                                                                name="visibility"
                                                                                value="all"
                                                                                checked={permissions.visibility === "all"}
                                                                                onChange={() => setPermissions((p) => ({ ...p, visibility: "all" }))}
                                                                                className="accent-primary"
                                                                        />
                                                                        <span className="text-sm">All Hosts</span>
                                                                </label>
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                        <input
                                                                                type="radio"
                                                                                name="visibility"
                                                                                value="user"
                                                                                checked={permissions.visibility === "user"}
                                                                                onChange={() => setPermissions((p) => ({ ...p, visibility: "user" }))}
                                                                                className="accent-primary"
                                                                        />
                                                                        <span className="text-sm">Owned Only</span>
                                                                </label>
                                                        </div>
                                                </div>

                                                {/* Resource permission matrix */}
                                                <div className="space-y-3">
                                                        <Label>Resource Permissions</Label>
                                                        <div className="border rounded-lg divide-y">
                                                                {resourceLabels.map(({ key, label }) => (
                                                                        <div key={key} className="flex items-center justify-between px-4 py-2.5">
                                                                                <span className="text-sm">{label}</span>
                                                                                <Select
                                                                                        value={permissions[key]}
                                                                                        onValueChange={(val) => setPermissions((p) => ({ ...p, [key]: val as PermissionLevel }))}
                                                                                >
                                                                                        <SelectTrigger className="w-[130px] h-8">
                                                                                                <SelectValue />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                                <SelectItem value="manage">Manage</SelectItem>
                                                                                                <SelectItem value="view">View</SelectItem>
                                                                                                <SelectItem value="hidden">Hidden</SelectItem>
                                                                                        </SelectContent>
                                                                                </Select>
                                                                        </div>
                                                                ))}
                                                        </div>
                                                </div>
                                        </div>

                                        <DialogFooter>
                                                <Button variant="outline" onClick={() => setPermissionsTarget(null)}>Cancel</Button>
                                                <Button onClick={handleSavePermissions} disabled={permissionsSaving}>
                                                        {permissionsSaving ? "Saving..." : "Save Permissions"}
                                                </Button>
                                        </DialogFooter>
                                </DialogContent>
                        </Dialog>

                        {/* Delete confirmation dialog */}
                        <ConfirmDialog
                                open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                                title="Delete User" description={`Delete user "${deleteTarget?.name}"? This action cannot be undone.`}
                                confirmLabel="Delete" variant="destructive" isLoading={deleteMutation.isPending} onConfirm={handleDelete}
                        />
                </div>
        );
}
