import { Tray, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-default bg-bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <span className="text-text-muted">{icon ?? <Tray aria-hidden className="size-8" />}</span>
      <h3 className="text-h4 text-text-primary">{title}</h3>
      {description ? <p className="max-w-prose text-body-sm text-text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Error block: icon + text, never colour alone; shows the request ref when there is one. */
export function ErrorState({
  title = "Something went wrong",
  description,
  requestId,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  requestId?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-lg border border-border-default bg-bg-surface px-6 py-10 text-center", className)}>
      <WarningCircle aria-hidden weight="bold" className="size-8 text-error" />
      <h3 className="text-h4 text-text-primary">{title}</h3>
      {description ? <p className="max-w-prose text-body-sm text-text-muted">{description}</p> : null}
      {requestId ? <p className="font-mono text-code-sm text-text-muted">Ref: {requestId.slice(0, 8)}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
