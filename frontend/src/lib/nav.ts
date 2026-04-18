// Navigation items and section definitions for sidebar
import {
  LayoutDashboard,
  Globe,
  ArrowRightLeft,
  Ban,
  Radio,
  Shield,
  Users,
  ScrollText,
  Settings,
} from "lucide-react";
import type { ElementType } from "react";

export interface NavItem {
  label: string;
  href: string;
  icon: ElementType;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Proxy Hosts", href: "/proxy-hosts", icon: Globe },
  { label: "Redirections", href: "/redirection-hosts", icon: ArrowRightLeft },
  { label: "Dead Hosts", href: "/dead-hosts", icon: Ban },
  { label: "Streams", href: "/streams", icon: Radio },
];

export const securityNavItems: NavItem[] = [
  { label: "Certificates", href: "/certificates", icon: Shield },
  { label: "Access Lists", href: "/access-lists", icon: Users },
];

export const adminNavItems: NavItem[] = [
  { label: "Audit Log", href: "/audit-log", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const allNavSections: NavSection[] = [
  { title: "Main", items: mainNavItems },
  { title: "Security", items: securityNavItems },
  { title: "Admin", items: adminNavItems },
];
