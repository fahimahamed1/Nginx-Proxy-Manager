// App-level providers (QueryClient, Router, Toast, Tooltip, Auth)
import { type ReactNode, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { LoadingPage } from "@/components/shared/loading-page";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 60_000,
      },
    },
  });
}

// Verifies token validity on mount, clears auth on 401
function AuthChecker({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (token) {
      api
        .get("auth/me")
        .json<Record<string, unknown>>()
        .then(() => {})
        .catch((err: unknown) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 401) {
            clearAuth();
          }
        })
        .finally(() => setIsChecking(false));
    } else {
      setIsChecking(false);
    }
  }, [token, clearAuth]);

  if (isChecking) {
    return <LoadingPage />;
  }

  return <>{children}</>;
}

// Singleton query client for the browser
let queryClientSingleton: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return createQueryClient();
  }
  if (!queryClientSingleton) {
    queryClientSingleton = createQueryClient();
  }
  return queryClientSingleton;
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>
            <AuthChecker>
              {children}
            </AuthChecker>
          </ToastProvider>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
