// Toast notification system with context provider
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-lg transition-all",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "border-destructive/50 bg-destructive text-destructive-foreground",
        success:
          "border-success/50 bg-success text-success-foreground",
        warning:
          "border-warning/50 bg-warning text-warning-foreground",
        info:
          "border-primary/50 bg-primary text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success" | "warning" | "info";
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Selects icon based on toast variant
function ToastIcon({ variant }: { variant: Toast["variant"] }) {
  switch (variant) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />;
    case "info":
      return <Info className="h-4 w-4 shrink-0 mt-0.5" />;
    case "destructive":
      return <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />;
    default:
      return null;
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [exitingIds, setExitingIds] = React.useState<Set<string>>(new Set());

  const removeToast = React.useCallback((id: string) => {
    setExitingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  }, []);

  const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  return (
    <ToastContext value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:max-w-sm max-w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              toastVariants({ variant: toast.variant }),
              "pointer-events-auto",
              exitingIds.has(toast.id)
                ? "animate-out fade-out slide-out-to-right-full"
                : "animate-in fade-in slide-in-from-bottom-full sm:slide-in-from-bottom-2",
            )}
          >
            <ToastIcon variant={toast.variant} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{toast.title}</p>
              {toast.description && (
                <p className="text-sm opacity-90 mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export { toastVariants };
