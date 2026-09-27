"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** request_id from the server, shown as "Ref: 7f3a…" so reports map to a log line (PRD 10). */
  requestId?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const toneIcon = {
  info: <Info aria-hidden weight="bold" className="size-5 text-info" />,
  success: <CheckCircle aria-hidden weight="bold" className="size-5 text-success" />,
  error: <WarningCircle aria-hidden weight="bold" className="size-5 text-error" />,
} satisfies Record<ToastTone, ReactNode>;

export function ToastCard({ title, description, tone = "info", requestId, className, ...props }: ToastInput & ToastPrimitive.ToastProps) {
  return (
    <ToastPrimitive.Root
      type={tone === "error" ? "foreground" : "background"}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border border-border-default bg-bg-elevated p-4 shadow-3",
        className,
      )}
      {...props}
    >
      <span className="mt-0.5 shrink-0">{toneIcon[tone]}</span>
      <div className="min-w-0 flex-1">
        <ToastPrimitive.Title className="text-body font-semibold text-text-primary">{title}</ToastPrimitive.Title>
        {description ? (
          <ToastPrimitive.Description className="mt-1 text-body-sm text-text-secondary">{description}</ToastPrimitive.Description>
        ) : null}
        {requestId ? (
          <p className="mt-1 font-mono text-code-sm text-text-muted">Ref: {requestId.slice(0, 8)}</p>
        ) : null}
      </div>
      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary"
      >
        <X aria-hidden className="size-4" weight="bold" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function ToastViewport({ className }: { className?: string }) {
  return (
    <ToastPrimitive.Viewport
      className={cn("fixed right-0 bottom-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none", className)}
    />
  );
}

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((toast: ToastInput) => {
    setItems((prev) => [...prev, { ...toast, id: Date.now() + Math.random() }]);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={6000}>
        {children}
        {items.map(({ id, ...toast }) => (
          <ToastCard
            key={id}
            {...toast}
            onOpenChange={(open) => {
              if (!open) setItems((prev) => prev.filter((t) => t.id !== id));
            }}
          />
        ))}
        <ToastViewport />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return ctx;
}
