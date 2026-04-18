{/* Application settings page */}
import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings, useHealth } from "@/hooks/use-settings";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
        Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Settings, Server, Save, Loader2, Shield, Monitor, Trash2, LogOut } from "lucide-react";
import { DEFAULT_SITE_OPTIONS } from "@/lib/constants";
import { formatUptime, formatRelativeTime } from "@/lib/utils";
import { getApiErrorMessage, api } from "@/lib/api";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { DefaultSiteOption } from "@/types";

interface Session {
        id: string;
        userId: number;
        userName?: string;
        userAgent: string;
        ipAddress: string;
        createdAt: string;
        lastUsed: string;
        isCurrent: boolean;
}

export function SettingsPage() {
        const { addToast } = useToast();
        const qc = useQueryClient();
        const { data: settings, isLoading } = useSettings();
        const { data: health } = useHealth();
        const updateMutation = useUpdateSettings();

        {/* Active sessions management */}
        const { data: sessions, isLoading: sessionsLoading } = useQuery({
                queryKey: ["sessions"],
                queryFn: () => api.get("tokens").json<{ items: Session[] }>(),
                staleTime: 30_000,
        });

        const revokeMutation = useMutation({
                mutationFn: (id: string) => api.delete(`tokens/${id}`).json<unknown>(),
                onSuccess: () => {
                        qc.invalidateQueries({ queryKey: ["sessions"] });
                        addToast({ title: "Session Revoked", description: "The session has been terminated.", variant: "success" });
                },
                onError: (err) => {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                },
        });

        const revokeAllMutation = useMutation({
                mutationFn: () => api.post("tokens/revoke-others").json<unknown>(),
                onSuccess: () => {
                        qc.invalidateQueries({ queryKey: ["sessions"] });
                        addToast({ title: "Other Sessions Revoked", description: "All other sessions have been terminated.", variant: "success" });
                },
                onError: (err) => {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                },
        });

        const [tab, setTab] = useState<"settings" | "sessions">("settings");

        const SETTING_KEY = "default_site";
        const defaultSiteSetting = settings?.find((s) => s.id === SETTING_KEY || s.id === "default-site");
        const [defaultSite, setDefaultSite] = useState<DefaultSiteOption>(
                (defaultSiteSetting?.value as DefaultSiteOption) ?? "congratulations",
        );
        const [redirectUrl, setRedirectUrl] = useState("");
        const [htmlContent, setHtmlContent] = useState("");

        {/* Sync default site settings from server */}
        useEffect(() => {
                if (defaultSiteSetting) {
                        setDefaultSite((defaultSiteSetting.value as DefaultSiteOption) ?? "congratulations");
                        const meta = typeof defaultSiteSetting.meta === "string"
                                ? (() => { try { return JSON.parse(defaultSiteSetting.meta || "{}"); } catch { return {}; } })()
                                : (defaultSiteSetting.meta as Record<string, string> | undefined);
                        setRedirectUrl(meta?.redirect_url ?? "");
                        setHtmlContent(meta?.html_content ?? "");
                }
        }, [defaultSiteSetting]);

        const handleSave = async () => {
                try {
                        const settingId = SETTING_KEY;

                        const meta: Record<string, unknown> = {};
                        if (defaultSite === "redirect") {
                                meta.redirect_url = redirectUrl;
                        }
                        if (defaultSite === "html") {
                                meta.html_content = htmlContent;
                        }

                        await updateMutation.mutateAsync({ id: settingId, value: defaultSite, meta });
                        addToast({ title: "Settings Saved", description: "Your settings have been updated.", variant: "success" });
                } catch (err) {
                        addToast({ title: "Error", description: getApiErrorMessage(err), variant: "destructive" });
                }
        };

        {/* Parse user agent string into browser and OS */}
        const parseUserAgent = (ua: string) => {
                if (!ua) return { browser: "Unknown", os: "Unknown" };
                let browser = "Unknown";
                if (ua.includes("Edg/")) browser = "Edge";
                else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
                else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
                else if (ua.includes("Firefox/")) browser = "Firefox";
                else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";
                else if (ua.includes("MSIE") || ua.includes("Trident/")) browser = "IE";

                let os = "Unknown";
                if (ua.includes("Windows NT 10")) os = "Windows 10/11";
                else if (ua.includes("Windows")) os = "Windows";
                else if (ua.includes("Mac OS X")) os = "macOS";
                else if (ua.includes("Linux") && !ua.includes("Android")) os = "Linux";
                else if (ua.includes("Android")) os = "Android";
                else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

                return { browser, os };
        };

        const sessionsList = sessions?.items ?? [];

        return (
                <div className="space-y-6">
                        <PageHeader title="Settings" description="Configure global application settings and manage sessions.">
                                <div className="flex gap-2">
                                        {tab === "settings" && (
                                                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                                                        {updateMutation.isPending ? (
                                                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                                                        ) : (
                                                                <><Save className="h-4 w-4 mr-2" /> Save Settings</>
                                                        )}
                                                </Button>
                                        )}
                                </div>
                        </PageHeader>

                        {/* Tab switcher between General and Sessions */}
                        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                                <button
                                        type="button"
                                        onClick={() => setTab("settings")}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                                                tab === "settings" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                        <Settings className="h-4 w-4" />
                                        General
                                </button>
                                <button
                                        type="button"
                                        onClick={() => setTab("sessions")}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                                                tab === "sessions" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                        <Shield className="h-4 w-4" />
                                        Sessions
                                </button>
                        </div>

                        {tab === "settings" && (
                                <div className="grid gap-6 lg:grid-cols-2">
                                        {/* Default site configuration */}
                                        <Card>
                                                <CardHeader>
                                                        <CardTitle className="text-base flex items-center gap-2">
                                                                <Settings className="h-4 w-4 text-muted-foreground" />
                                                                Default Site
                                                        </CardTitle>
                                                        <CardDescription>
                                                                Configure what visitors see when they access an unconfigured domain.
                                                        </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                        {isLoading ? (
                                                                <div className="space-y-2">
                                                                        <Skeleton className="h-4 w-24" />
                                                                        <Skeleton className="h-9 w-full" />
                                                                </div>
                                                        ) : (
                                                                <div className="space-y-4">
                                                                        <div className="space-y-2">
                                                                                <Label>Default Site Behavior</Label>
                                                                                <Select value={defaultSite} onValueChange={(v) => setDefaultSite(v as DefaultSiteOption)}>
                                                                                        <SelectTrigger>
                                                                                                <SelectValue />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                                {DEFAULT_SITE_OPTIONS.map((opt) => (
                                                                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                                                                ))}
                                                                                        </SelectContent>
                                                                                </Select>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                        This applies to domains that don't match any configured host.
                                                                                </p>
                                                                        </div>

                                                                        {defaultSite === "redirect" && (
                                                                                <div className="space-y-2">
                                                                                        <Label htmlFor="redirect-url">Redirect URL</Label>
                                                                                        <Input
                                                                                                id="redirect-url"
                                                                                                value={redirectUrl}
                                                                                                onChange={(e) => setRedirectUrl(e.target.value)}
                                                                                                placeholder="URL"
                                                                                        />
                                                                                        <p className="text-xs text-muted-foreground">
                                                                                                Visitors will be redirected to this URL.
                                                                                        </p>
                                                                                </div>
                                                                        )}

                                                                        {defaultSite === "html" && (
                                                                                <div className="space-y-2">
                                                                                        <Label htmlFor="html-content">Custom HTML</Label>
                                                                                        <Textarea
                                                                                                id="html-content"
                                                                                                value={htmlContent}
                                                                                                onChange={(e) => setHtmlContent(e.target.value)}
                                                                                                placeholder="<h1>Welcome</h1>&#10;<p>This is a custom page.</p>"
                                                                                                className="font-mono text-sm min-h-[200px]"
                                                                                        />
                                                                                        <p className="text-xs text-muted-foreground">
                                                                                                This HTML will be served for unconfigured domains.
                                                                                        </p>
                                                                                </div>
                                                                        )}
                                                                </div>
                                                        )}
                                                </CardContent>
                                        </Card>

                                        {/* System status display */}
                                        <Card>
                                                <CardHeader>
                                                        <CardTitle className="text-base flex items-center gap-2">
                                                                <Server className="h-4 w-4 text-muted-foreground" />
                                                                System Status
                                                        </CardTitle>
                                                        <CardDescription>
                                                                Current system health and version information.
                                                        </CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                        <div className="space-y-4">
                                                                <div className="flex items-center justify-between">
                                                                        <span className="text-sm text-muted-foreground">Status</span>
                                                                        {health ? (
                                                                                <span className="flex items-center gap-1.5 text-sm font-medium">
                                                                                        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                                                                        {health.status === "OK" ? "Healthy" : "Unhealthy"}
                                                                                </span>
                                                                        ) : (
                                                                                <Skeleton className="h-5 w-16" />
                                                                        )}
                                                                </div>
                                                                {health?.version && (
                                                                        <div className="flex items-center justify-between">
                                                                                <span className="text-sm text-muted-foreground">Version</span>
                                                                                <span className="text-sm font-mono">{health.version}</span>
                                                                        </div>
                                                                )}
                                                                {health?.uptime !== undefined && (
                                                                        <div className="flex items-center justify-between">
                                                                                <span className="text-sm text-muted-foreground">Uptime</span>
                                                                                <span className="text-sm">{formatUptime(health.uptime)}</span>
                                                                        </div>
                                                                )}
                                                        </div>
                                                </CardContent>
                                        </Card>
                                </div>
                        )}

                        {/* Active sessions management */}
                        {tab === "sessions" && (
                                <Card>
                                        <CardHeader>
                                                <div className="flex items-center justify-between">
                                                        <div>
                                                                <CardTitle className="text-base flex items-center gap-2">
                                                                        <Shield className="h-4 w-4 text-muted-foreground" />
                                                                        Active Sessions
                                                                </CardTitle>
                                                                <CardDescription className="mt-1">
                                                                        Manage your active sessions across devices and browsers.
                                                                </CardDescription>
                                                        </div>
                                                        {sessionsList.length > 1 && (
                                                                <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => revokeAllMutation.mutate()}
                                                                        disabled={revokeAllMutation.isPending}
                                                                >
                                                                        <LogOut className="h-4 w-4 mr-1" />
                                                                        Revoke Others
                                                                </Button>
                                                        )}
                                                </div>
                                        </CardHeader>
                                        <CardContent>
                                                {sessionsLoading ? (
                                                        <div className="space-y-3">
                                                                {Array.from({ length: 3 }).map((_, i) => (
                                                                        <div key={i} className="flex items-center gap-3">
                                                                                <Skeleton className="h-10 w-10 rounded-lg" />
                                                                                <div className="flex-1 space-y-1">
                                                                                        <Skeleton className="h-4 w-32" />
                                                                                        <Skeleton className="h-3 w-48" />
                                                                                </div>
                                                                        </div>
                                                                ))}
                                                        </div>
                                                ) : sessionsList.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground text-center py-6">No active sessions found.</p>
                                                ) : (
                                                        <div className="space-y-3">
                                                                {sessionsList.map((session) => {
                                                                        const { browser, os } = parseUserAgent(session.userAgent);
                                                                        return (
                                                                                <div
                                                                                        key={session.id}
                                                                                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                                                                                                session.isCurrent ? "border-primary/30 bg-primary/5" : ""
                                                                                        }`}
                                                                                >
                                                                                        <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                                                                                                session.isCurrent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                                                                        }`}>
                                                                                                <Monitor className="h-5 w-5" />
                                                                                        </div>
                                                                                        <div className="flex-1 min-w-0">
                                                                                                <div className="flex items-center gap-2">
                                                                                                        <span className="text-sm font-medium">{browser} on {os}</span>
                                                                                                        {session.isCurrent && (
                                                                                                                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                                                                                                                        Current
                                                                                                                </span>
                                                                                                        )}
                                                                                                </div>
                                                                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                                                                        {session.ipAddress ? `IP: ${session.ipAddress} · ` : ""}Last used: {formatRelativeTime(session.lastUsed)}
                                                                                                </p>
                                                                                        </div>
                                                                                        {!session.isCurrent && (
                                                                                                <Button
                                                                                                        variant="ghost"
                                                                                                        size="sm"
                                                                                                        className="text-destructive hover:text-destructive shrink-0"
                                                                                                        onClick={() => revokeMutation.mutate(session.id)}
                                                                                                        disabled={revokeMutation.isPending}
                                                                                                >
                                                                                                        <Trash2 className="h-4 w-4" />
                                                                                                </Button>
                                                                                        )}
                                                                                </div>
                                                                        );
                                                                })}
                                                        </div>
                                                )}
                                        </CardContent>
                                </Card>
                        )}
                </div>
        );
}
