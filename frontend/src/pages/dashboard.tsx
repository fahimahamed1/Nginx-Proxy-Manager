{/* Dashboard overview page */}
import { useNavigate } from "react-router-dom";
import { Globe, ArrowRightLeft, Radio, Ban, Shield, Users, Clock, Server, AlertTriangle, Lock } from "lucide-react";
import { useDashboardStats, useHealth, useAuditLogs } from "@/hooks/use-settings";
import { useCertificates } from "@/hooks/use-certificates";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeTime, formatUptime } from "@/lib/utils";

interface StatCardProps {
        title: string;
        value: number | undefined;
        icon: React.ReactNode;
        href: string;
        color: string;
        subtitle?: string;
}

function StatCard({ title, value, icon, href, color, subtitle }: StatCardProps) {
        const navigate = useNavigate();

        return (
                <Card
                        className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 group"
                        onClick={() => navigate(href)}
                >
                        <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                        <div>
                                                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                                                <p className="text-3xl font-bold mt-1">
                                                        {value !== undefined ? value : <Skeleton className="h-9 w-12 inline-block" />}
                                                </p>
                                                {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
                                        </div>
                                        <div className={cn("flex items-center justify-center w-12 h-12 rounded-xl transition-transform group-hover:scale-110", color)}>
                                                {icon}
                                        </div>
                                </div>
                        </CardContent>
                </Card>
        );
}

export function DashboardPage() {
        const navigate = useNavigate();
        const { data: stats } = useDashboardStats();
        const { data: health } = useHealth();
        const { data: auditData } = useAuditLogs({ limit: 5 });
        const { data: certsData } = useCertificates({ limit: 100 });

        const recentLogs = auditData?.items ?? [];
        const allCerts = certsData?.items ?? [];

        {/* Find certificates expiring within 30 days */}
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const expiringCerts = allCerts.filter((c) => {
                if (!c.expiresOn) return false;
                const expiry = new Date(c.expiresOn);
                return expiry <= thirtyDaysFromNow && expiry > new Date();
        });

        const openCreateDialog = (path: string) => {
                navigate(path, { state: { openCreate: true } });
        };

        return (
                <div className="space-y-6">
                        <PageHeader
                                title="Dashboard"
                                description="Welcome back! Here's an overview of your proxy configuration."
                        />

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <StatCard
                                        title="Proxy Hosts"
                                        value={stats?.totalProxyHosts}
                                        icon={<Globe className="h-6 w-6 text-blue-600 dark:text-blue-400" />}
                                        href="/proxy-hosts"
                                        color="bg-blue-50 dark:bg-blue-950/30"
                                />
                                <StatCard
                                        title="Redirections"
                                        value={stats?.totalRedirectionHosts}
                                        icon={<ArrowRightLeft className="h-6 w-6 text-violet-600 dark:text-violet-400" />}
                                        href="/redirection-hosts"
                                        color="bg-violet-50 dark:bg-violet-950/30"
                                />
                                <StatCard
                                        title="Streams"
                                        value={stats?.totalStreams}
                                        icon={<Radio className="h-6 w-6 text-amber-600 dark:text-amber-400" />}
                                        href="/streams"
                                        color="bg-amber-50 dark:bg-amber-950/30"
                                />
                                <StatCard
                                        title="Dead Hosts"
                                        value={stats?.totalDeadHosts}
                                        icon={<Ban className="h-6 w-6 text-rose-600 dark:text-rose-400" />}
                                        href="/dead-hosts"
                                        color="bg-rose-50 dark:bg-rose-950/30"
                                />
                        </div>

                        <div className="grid gap-6 lg:grid-cols-3">
                                <Card className="lg:col-span-2">
                                        <CardHeader className="pb-3">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                                        Recent Activity
                                                </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                                {recentLogs.length === 0 ? (
                                                        <div className="text-center py-8">
                                                                <p className="text-sm text-muted-foreground">No recent activity</p>
                                                        </div>
                                                ) : (
                                                        <div className="space-y-3">
                                                                {recentLogs.map((log) => (
                                                                        <div
                                                                                key={log.id}
                                                                                className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                                                                        >
                                                                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0 mt-0.5">
                                                                                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                        <p className="text-sm font-medium truncate">{log.action}</p>
                                                                                        <p className="text-xs text-muted-foreground">
                                                                                                {log.user?.name ?? log.userId} · {log.objectType}
                                                                                                {log.objectId ? ` #{log.objectId}` : ""}
                                                                                        </p>
                                                                                </div>
                                                                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                                                        {formatRelativeTime(log.createdAt)}
                                                                                </span>
                                                                        </div>
                                                                ))}
                                                        </div>
                                                )}
                                        </CardContent>
                                </Card>

                                <div className="space-y-6">
                                        <Card>
                                                <CardHeader className="pb-3">
                                                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                                <Server className="h-4 w-4 text-muted-foreground" />
                                                                System Info
                                                        </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                        <div className="space-y-3">
                                                                <div className="flex items-center justify-between">
                                                                        <span className="text-sm text-muted-foreground">Status</span>
                                                                        {health ? (
                                                                                <span className="flex items-center gap-1.5 text-sm font-medium">
                                                                                        <span className={cn("w-2 h-2 rounded-full animate-pulse", health.status === "OK" ? "bg-green-500" : "bg-red-500")} />
                                                                                        {health.status === "OK" ? "Healthy" : "Unhealthy"}
                                                                                </span>
                                                                        ) : (
                                                                                <Skeleton className="h-5 w-16" />
                                                                        )}
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                        <span className="text-sm text-muted-foreground">Version</span>
                                                                        {health?.version ? (
                                                                                <span className="text-sm font-mono">{health.version}</span>
                                                                        ) : (
                                                                                <Skeleton className="h-5 w-20" />
                                                                        )}
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                        <span className="text-sm text-muted-foreground">Uptime</span>
                                                                        {health?.uptime !== undefined ? (
                                                                                <span className="text-sm">{formatUptime(health.uptime)}</span>
                                                                        ) : (
                                                                                <Skeleton className="h-5 w-16" />
                                                                        )}
                                                                </div>
                                                        </div>
                                                </CardContent>
                                        </Card>

                                        {expiringCerts.length > 0 && (
                                                <Card className="border-amber-200 dark:border-amber-900/50">
                                                        <CardHeader className="pb-3">
                                                                <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                                                        <AlertTriangle className="h-4 w-4" />
                                                                        Certificate Warnings
                                                                </CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2">
                                                                {expiringCerts.slice(0, 5).map((cert) => {
                                                                        const daysLeft = Math.ceil((new Date(cert.expiresOn).getTime() - Date.now()) / 86400000);
                                                                        return (
                                                                                <div key={cert.id} className="flex items-center gap-2 text-sm">
                                                                                        <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                                                        <span className="font-mono text-xs truncate flex-1">{cert.domainNames[0]}</span>
                                                                                        <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
                                                                                                {daysLeft}d left
                                                                                        </span>
                                                                                </div>
                                                                        );
                                                                })}
                                                                {expiringCerts.length > 5 && (
                                                                        <button
                                                                                type="button"
                                                                                onClick={() => navigate("/certificates")}
                                                                                className="text-xs text-primary hover:underline cursor-pointer"
                                                                        >
                                                                                +{expiringCerts.length - 5} more
                                                                        </button>
                                                                )}
                                                        </CardContent>
                                                </Card>
                                        )}

                                        <Card>
                                                <CardHeader className="pb-3">
                                                        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-1">
                                                        <QuickAction
                                                                label="New Proxy Host"
                                                                icon={<Globe className="h-4 w-4" />}
                                                                onClick={() => openCreateDialog("/proxy-hosts")}
                                                        />
                                                        <QuickAction
                                                                label="New Redirection"
                                                                icon={<ArrowRightLeft className="h-4 w-4" />}
                                                                onClick={() => openCreateDialog("/redirection-hosts")}
                                                        />
                                                        <QuickAction
                                                                label="New Stream"
                                                                icon={<Radio className="h-4 w-4" />}
                                                                onClick={() => openCreateDialog("/streams")}
                                                        />
                                                        <QuickAction
                                                                label="New Certificate"
                                                                icon={<Shield className="h-4 w-4" />}
                                                                onClick={() => openCreateDialog("/certificates")}
                                                        />
                                                        <QuickAction
                                                                label="New Access List"
                                                                icon={<Users className="h-4 w-4" />}
                                                                onClick={() => openCreateDialog("/access-lists")}
                                                        />
                                                </CardContent>
                                        </Card>
                                </div>
                        </div>
                </div>
        );
}

{/* Quick action button component */}
function QuickAction({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
        return (
                <button
                        type="button"
                        onClick={onClick}
                        className="flex items-center gap-3 w-full p-3 rounded-lg text-sm font-medium text-left hover:bg-accent transition-colors cursor-pointer"
                >
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted">
                                {icon}
                        </span>
                        {label}
                </button>
        );
}
