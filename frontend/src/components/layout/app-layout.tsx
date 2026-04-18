// Main app layout combining sidebar, header, and content area
import { type ReactNode, useEffect, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { getShortcutHandler } from "@/hooks/use-keyboard-shortcuts";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Global keyboard shortcut handler (/ for search, n for new)
  const isFormInput = useCallback((target: EventTarget | null) => {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "/": {
          if (isFormInput(e.target)) return;
          e.preventDefault();
          getShortcutHandler("focusSearch")?.();
          break;
        }
        case "n": {
          if (isFormInput(e.target)) return;
          e.preventDefault();
          getShortcutHandler("openCreate")?.();
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFormInput]);

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:z-40">
        <Sidebar />
      </aside>

      <div className="flex-1 lg:pl-[260px] min-w-0">
        <Header />
        <main className="min-h-[calc(100dvh-57px)] p-4 md:p-6 lg:p-8 max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
