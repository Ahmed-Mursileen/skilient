import type { Metadata, Route } from "next";
import Link from "next/link";
import { AuditDiff } from "@/components/ops/audit-diff";
import { Button, EmptyState, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { getAudit, getAuditFilterOptions, type AuditFilters } from "@/lib/data/ops-shell";
import { staffRoles } from "@/lib/data/ops-trust";
import { pktDayRange } from "@/lib/ops/diff";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;

function param(v: string | string[] | undefined, max = 200): string | undefined {
  return typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined;
}

/**
 * /ops/audit (PRD 5.26, screen spec 3.11): every staff action, newest first, filterable, with
 * the reason and the before/after. Append-only: nothing here edits a row. Super admins can
 * export the filtered rows as CSV (the export is audited too).
 */
export default async function OpsAuditPage({ searchParams }: PageProps<"/ops/audit">) {
  const sp = await searchParams;
  const roles = await staffRoles();
  const raw = {
    staff: param(sp.staff, 36),
    action: param(sp.action, 80),
    target_type: param(sp.target_type, 40),
    target_id: param(sp.target_id),
    from: param(sp.from, 10),
    to: param(sp.to, 10),
  };
  const range = pktDayRange(raw.from, raw.to);
  const filters: AuditFilters = {
    staff: raw.staff && /^[0-9a-f-]{36}$/.test(raw.staff) ? raw.staff : undefined,
    action: raw.action,
    targetType: raw.target_type,
    targetId: raw.target_id,
    from: range.from,
    to: range.to,
  };
  const before = param(sp.before, 40);
  const cursor = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;
  const [rows, options] = await Promise.all([getAudit(filters, cursor, PAGE), getAuditFilterOptions()]);
  const kept = new URLSearchParams(Object.entries(raw).filter((e): e is [string, string] => Boolean(e[1])));
  const older = rows.length === PAGE ? `/ops/audit?${new URLSearchParams([...kept, ["before", rows[rows.length - 1].createdAt]])}` : null;
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Audit log</h1>
      <form method="get" action="/ops/audit" className="grid gap-3 rounded-lg border border-border-default bg-bg-surface p-4 md:grid-cols-3" aria-label="Filter the audit log">
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-staff">Staff member</Label>
          <select id="audit-staff" name="staff" defaultValue={raw.staff ?? ""} className={cn(controlBase, "h-10")}>
            <option value="">Anyone</option>
            {options.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-action">Action</Label>
          <select id="audit-action" name="action" defaultValue={raw.action ?? ""} className={cn(controlBase, "h-10")}>
            <option value="">Any action</option>
            {options.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-type">Target type</Label>
          <select id="audit-type" name="target_type" defaultValue={raw.target_type ?? ""} className={cn(controlBase, "h-10")}>
            <option value="">Any type</option>
            {options.targetTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-target">Target id</Label>
          <Input id="audit-target" name="target_id" defaultValue={raw.target_id ?? ""} maxLength={200} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-from">From (Karachi)</Label>
          <Input id="audit-from" name="from" type="date" defaultValue={raw.from ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-to">To (Karachi)</Label>
          <Input id="audit-to" name="to" type="date" defaultValue={raw.to ?? ""} />
        </div>
        <div className="flex gap-2 md:col-span-3">
          <Button type="submit">Filter</Button>
          <Button variant="ghost" asChild>
            <Link href={"/ops/audit" as Route}>Clear</Link>
          </Button>
        </div>
      </form>

      {rows.length ? (
        <ol className="flex flex-col divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface" data-testid="audit-rows">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3" data-testid="audit-row">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-body-sm">
                  <span className="font-mono font-semibold">{r.action}</span> on {r.targetType}{" "}
                  <span className="font-mono text-caption text-text-secondary">{r.targetId}</span>
                </p>
                <p className="text-caption text-text-secondary">
                  {r.staffName} · <time dateTime={r.createdAt}>{r.when}</time>
                </p>
              </div>
              <p className="text-body-sm">{r.reason}</p>
              <details className="text-body-sm">
                <summary className="cursor-pointer text-text-secondary underline underline-offset-4">Before and after</summary>
                <div className="mt-2 overflow-x-auto">
                  <AuditDiff before={r.before} after={r.after} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No matching actions" description="Try fewer filters." />
      )}
      {older ? (
        <Link href={older as Route} className="self-start text-body-sm font-semibold underline underline-offset-4">
          Older actions
        </Link>
      ) : null}

      {roles.has("super_admin") ? (
        <form method="post" action="/api/ops/audit/export" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4" aria-labelledby="audit-export-h">
          <h2 id="audit-export-h" className="text-h3">
            Export these rows
          </h2>
          <p className="text-body-sm text-text-secondary">CSV of up to 10,000 rows matching the filters above. The export itself is recorded here.</p>
          {Object.entries(raw).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <div className="flex flex-col gap-2">
            <Label htmlFor="audit-export-reason">Reason</Label>
            <Textarea id="audit-export-reason" name="reason" rows={2} minLength={3} maxLength={2000} required />
          </div>
          <Button type="submit" variant="secondary" className="self-start">
            Download CSV
          </Button>
        </form>
      ) : null}
    </main>
  );
}
