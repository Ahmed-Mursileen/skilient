"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import { useThemeMode, type ThemeMode } from "@/lib/hooks/use-theme-mode";

const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light theme", icon: Sun },
  { mode: "dark", label: "Dark theme", icon: Moon },
  { mode: "system", label: "Use device theme", icon: Desktop },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useThemeMode();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex gap-1 rounded-md border border-border-default bg-bg-surface p-1", className)}>
      {options.map(({ mode: m, label, icon: Icon }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={label}
          title={label}
          onClick={() => setMode(m)}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-sm text-text-muted transition-colors duration-[120ms] ease-standard hover:text-text-primary",
            mode === m && "bg-bg-subtle text-text-primary",
          )}
        >
          <Icon aria-hidden className="size-4" weight="bold" />
        </button>
      ))}
    </div>
  );
}
