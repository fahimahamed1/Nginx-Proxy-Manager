// Mobile slide-out navigation drawer
import { NavLink, useLocation } from "react-router-dom";
import { Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { allNavSections } from "@/lib/nav";
import type { NavItem } from "@/lib/nav";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roles?.includes("admin");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="px-5 h-[57px] flex flex-row items-center gap-3 border-b">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
            <Server className="h-4 w-4 text-primary-foreground" />
          </div>
          <SheetTitle className="text-sm font-semibold">{APP_NAME}</SheetTitle>
        </SheetHeader>

        <nav className="py-4 px-3 overflow-y-auto max-h-[calc(100vh-57px)]">
          {allNavSections.map((section, idx) => {
            if (section.title === "Admin" && !isAdmin) return null;
            return (
              <div key={section.title}>
                {idx > 0 && <Separator className="my-4" />}
                <div className="space-y-1">
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </p>
                  {section.items.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      isActive={location.pathname === item.href}
                      onClick={() => onOpenChange(false)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLink({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <NavLink
      to={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </NavLink>
  );
}
