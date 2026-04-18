// Desktop sidebar with app logo, navigation links, and user info
import { NavLink, useLocation } from "react-router-dom";
import { Server } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth";
import { allNavSections } from "@/lib/nav";
import type { NavItem } from "@/lib/nav";

export function Sidebar() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roles?.includes("admin");

  return (
    <div className="flex flex-col w-[260px] h-screen bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-5 h-[57px] border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
          <Server className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground leading-tight">
            {APP_NAME}
          </span>
          <span className="text-[10px] text-sidebar-muted-foreground leading-tight">Modern</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {allNavSections.map((section, idx) => {
          if (section.title === "Admin" && !isAdmin) return null;
          return (
            <div key={section.title}>
              <p className={cn("px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted-foreground", idx > 0 && "mt-6")}>
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarLink key={item.href} item={item} isActive={location.pathname === item.href} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            {user?.name ? getInitials(user.name) : "AD"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name ?? "Admin"}</p>
            <p className="text-xs text-sidebar-muted-foreground truncate">{user?.email ?? ""}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Individual sidebar navigation link with active state styling
function SidebarLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <NavLink
      to={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </NavLink>
  );
}
