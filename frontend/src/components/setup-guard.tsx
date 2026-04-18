// Redirects unauthenticated users to /setup on first launch
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { LoadingPage } from "@/components/shared/loading-page";

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    if (isAuthenticated || location.pathname === "/setup") {
      setChecked(true);
      return;
    }

    api
      .get("health")
      .json<{ setup: boolean }>()
      .then((data) => {
        if (!data.setup) {
          navigate("/setup", { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [isAuthenticated, location.pathname, navigate]);

  if (!checked) {
    return <LoadingPage />;
  }

  return <>{children}</>;
}
