import { Slot } from "@radix-ui/react-slot";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-text-on-primary hover:bg-primary-hover active:bg-primary-active",
  secondary:
    "border border-border-default bg-bg-surface text-text-primary hover:bg-bg-subtle active:border-border-strong",
  accent: "bg-accent text-text-on-accent hover:bg-accent-hover",
  ghost: "text-text-primary hover:bg-bg-subtle",
  // Error styling stays away from the primary button look (PRD 9.5): outlined, not filled.
  danger: "border border-error bg-transparent text-text-error hover:bg-bg-subtle",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1 px-3 text-body-sm",
  md: "h-10 gap-2 px-4 text-body",
  lg: "h-12 gap-2 px-5 text-body-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Render the child element (e.g. a Link) with button styling. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, asChild = false, disabled, className, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-md font-sans font-semibold whitespace-nowrap",
        "transition-colors duration-[120ms] ease-standard",
        "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-bg-muted disabled:text-text-disabled",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <CircleNotch aria-hidden className="size-4 animate-spin" weight="bold" />}
          {children}
        </>
      )}
    </Comp>
  );
});
