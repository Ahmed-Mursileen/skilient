import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Page heading with an optional line under it. */
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-h1">{title}</h1>
      {children ? <p className="max-w-prose text-body text-text-secondary">{children}</p> : null}
    </div>
  );
}

export function Section({ title, id, children, className }: { title: string; id: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <h2 id={id} className="text-h3">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Card({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={cn("rounded-lg border border-border-default bg-bg-surface p-4", className)}>
      {children}
    </div>
  );
}

/** A plain data table; headers are text/label. */
export function DataTable({ head, rows, testId, empty }: { head: string[]; rows: ReactNode[][]; testId?: string; empty?: string }) {
  if (rows.length === 0) return <p className="text-body text-text-secondary">{empty ?? "Nothing here yet."}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
      <table className="w-full min-w-[520px] text-left text-body-sm" data-testid={testId}>
        <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shown where the plan doesn't include a feature (the check itself is in SQL). */
export function Locked({ what, plans }: { what: string; plans: string }) {
  return (
    <Card testId="locked">
      <p className="text-body font-semibold">{what} is part of the {plans} licence.</p>
      <p className="text-body-sm text-text-secondary">Write to the Skilient team for an annual licence. Billing opens with invoices in a later release.</p>
    </Card>
  );
}
