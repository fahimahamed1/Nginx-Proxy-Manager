// HTTP client (ky) with auth headers and error message extraction
import ky, { type BeforeErrorHook, type KyInstance } from "ky";
import { API_BASE } from "./constants";
import { useAuthStore } from "@/stores/auth";

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// Extract error message from API response body
const beforeError: BeforeErrorHook = async (error) => {
  const { response } = error;
  if (response) {
    try {
      const body = (await response.json()) as Record<string, unknown>;
      const errorObj = body?.error as Record<string, unknown> | string | undefined;
      const message =
        (typeof errorObj === "object" && errorObj !== null ? (errorObj as Record<string, unknown>).message as string | undefined : undefined) ||
        (typeof errorObj === "string" ? errorObj : undefined) ||
        (typeof body?.message === "string" ? body.message : undefined) ||
        response.statusText;

      if (message) error.message = message;
    } catch {
      error.message = response.statusText || "Request failed.";
    }
  }
  return error;
};

export const api: KyInstance = ky.create({
  prefixUrl: API_BASE,
  timeout: 30_000,
  hooks: {
    beforeRequest: [
      (request: Request) => {
        const headers = getAuthHeaders();
        for (const [key, value] of Object.entries(headers)) {
          request.headers.set(key, value);
        }
      },
    ],
    beforeError: [beforeError],
  },
});

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
  }
  return "Request failed.";
}
