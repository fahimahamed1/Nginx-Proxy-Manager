// Active/disabled status indicator badge
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  enabled: boolean;
  label?: string;
}

export function StatusBadge({ enabled, label }: StatusBadgeProps) {
  return (
    <Badge
      variant={enabled ? "success" : "secondary"}
      className={cn(
        "gap-1.5",
        enabled && "bg-success/15 text-success border-success/20 dark:bg-success/10",
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", enabled ? "bg-success" : "bg-muted-foreground/50")} />
      {label ?? (enabled ? "Active" : "Disabled")}
    </Badge>
  );
}
