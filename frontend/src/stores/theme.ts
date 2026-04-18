// Theme state store with system preference detection and persistence
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      resolvedTheme: getSystemTheme(),
      setTheme: (theme: Theme) => {
        const resolved = theme === "system" ? getSystemTheme() : theme;
        applyTheme(resolved);
        set({ theme, resolvedTheme: resolved });
      },
    }),
    {
      name: "npm-theme",
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            applyTheme(state.resolvedTheme);
          }
        };
      },
    },
  ),
);

// Listen for OS theme changes when set to "system"
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const store = useThemeStore.getState();
      if (store.theme === "system") {
        const resolved = getSystemTheme();
        applyTheme(resolved);
        useThemeStore.setState({ resolvedTheme: resolved });
      }
    });
}
