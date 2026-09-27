import { CheckCircle, Info, SealCheck, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "primary" | "accent" | "verified" | "success" | "warning" | "error" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "border-border-default bg-bg-subtle text-text-secondary",
  primary: "border-primary bg-primary-subtle text-text-primary",
  accent: "border-accent bg-accent-subtle text-text-primary",
  verified: "border-verified bg-verified-subtle text-verified",
  success: "border-success text-text-primary",
  warning: "border-warning text-text-primary",
  error: "border-error text-text-error",
  info: "border-info text-text-primary",
};

// Status badges always carry an icon: never colour alone (PRD 9.5). Text stays on
// text tokens; the tone lives in the border and icon so every pair passes 4.5:1.
const icons: Partial<Record<BadgeTone, ReactNode>> = {
  verified: <SealCheck aria-hidden weight="fill" className="size-3.5" />,
  success: <CheckCircle aria-hidden weight="bold" className="size-3.5 text-success" />,
  warning: <Warning aria-hidden weight="bold" className="size-3.5 text-warning" />,
  error: <WarningCircle aria-hidden weight="bold" className="size-3.5" />,
  info: <Info aria-hidden weight="bold" className="size-3.5 text-info" />,
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-caption font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icons[tone]}
      {children}
    </span>
  );
}
