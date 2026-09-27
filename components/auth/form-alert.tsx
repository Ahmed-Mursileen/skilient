import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Form-level message: icon + text (never colour alone), with the request ref when there is one. */
export function FormAlert({
  tone = "error",
  children,
  requestId,
  className,
}: {
  tone?: "error" | "success";
  children: ReactNode;
  requestId?: string;
  className?: string;
}) {
  const Icon = tone === "error" ? WarningCircle : CheckCircle;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2.5 text-body-sm",
        tone === "error" ? "border-error text-text-error" : "border-success text-text-primary",
        className,
      )}
    >
      <Icon aria-hidden weight="bold" className={cn("mt-0.5 size-4 shrink-0", tone === "success" && "text-success")} />
      <div className="min-w-0">
        <div>{children}</div>
        {requestId ? <p className="mt-1 font-mono text-code-sm text-text-muted">Ref: {requestId.slice(0, 8)}</p> : null}
      </div>
    </div>
  );
}
