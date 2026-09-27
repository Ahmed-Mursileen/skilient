"use client";

import { useTheme } from "next-themes";
import { useMounted } from "./use-mounted";

export type ThemeMode = "light" | "dark" | "system";

/** Current theme preference plus the resolved light/dark value; null values until mounted. */
export function useThemeMode() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  return {
    mode: mounted ? ((theme as ThemeMode | undefined) ?? "system") : null,
    resolved: mounted ? ((resolvedTheme as "light" | "dark" | undefined) ?? null) : null,
    setMode: (mode: ThemeMode) => setTheme(mode),
  };
}
