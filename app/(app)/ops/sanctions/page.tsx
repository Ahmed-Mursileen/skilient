import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiftSanctionButton, SanctionUserForm } from "@/components/ops/sanction-forms";
import { Badge, Button, EmptyState, Input, Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import { staffRoles } from "@/lib/data/ops-trust";
import { findAccount, getOpsSanctions } from "@/lib/data/sanctions";
import { SANCTION_LABELS } from "@/lib/ops/appeals";

export const metadata: Metadata = { title: "Sanctions" };

/**
 * /ops/sanctions (PRD 5.26): find an account and warn, suspend or ban it (moderators up to 7 days;
 * bans for super admins); active sanctions on users and organisations with a lift button.
 */
export default async function OpsSanctionsPage({ searchParams }: PageProps<"/ops/sanctions">) {
  const roles = await staffRoles();
  const moderator = roles.has("moderator");
  if (!moderator && !roles.has("accounts")) notFound();
  const sp = await searchParams;
  const tab = sp.tab === "recent" ? "recent" : "active";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 320) : "";
  const [rows, found] = await Promise.all([getOpsSanctions(tab === "active"), moderator && q ? findAccount(q) : Promise.resolve(null)]);
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Sanctions</h1>

      {moderator ? (
        <section aria-labelledby="find-h" className="flex flex-col gap-3">
          <h2 id="find-h" className="text-h3">
            Sanction an account
          </h2>
          <form method="get" action="/ops/sanctions" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="find-q">Email or username</Label>
              <Input id="find-q" name="q" defaultValue={q} autoComplete="off" maxLength={320} className="w-80" />
            </div>
            <Button type="submit" variant="secondary">
              Find
            </Button>
          </form>
          {q && !found ? <p className="text-body-sm text-text-secondary">No account with that email or username.</p> : null}
          {found ? (
            <div className="flex flex-col gap-2" data-testid="found-account">
              <p className="text-body-sm">
                <span className="font-semibold">{found.name ?? found.email}</span> {found.username ? `@${found.username}` : ""} · {found.email}
                {found.active ? <Badge tone="error" className="ml-2">{SANCTION_LABELS[found.active.kind]} active</Badge> : null}
              </p>
              <SanctionUserForm userId={found.userId} name={found.name ?? found.email} superAdmin={roles.has("super_admin")} />
            </div>
          ) : null}
        </section>
      ) : null}

      <nav aria-label="Sanction lists" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {(["active", "recent"] as const).map((t) => (
            <li key={t}>
              <Link
                href={(t === "active" ? "/ops/sanctions" : "/ops/sanctions?tab=recent") as Route}
                aria-current={tab === t ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                  tab === t ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t === "active" ? "Active" : "Last 90 days"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full min-w-[880px] text-left text-body-sm" data-testid="sanctions-table">
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Who</th>
                <th scope="col" className="px-3 py-2 font-semibold">Sanction</th>
                <th scope="col" className="px-3 py-2 font-semibold">Reason</th>
                <th scope="col" className="px-3 py-2 font-semibold">By</th>
                <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Lift</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {rows.map((r) => {
                const who = r.orgName ? `${r.orgName} (organisation)` : (r.userName ?? "Deleted account");
                return (
                  <tr key={r.id} data-testid="sanction-row">
                    <td className="px-3 py-2 align-top font-semibold">
                      {r.orgId ? <Link href={`/ops/orgs/${r.orgId}` as Route} className="underline underline-offset-4">{who}</Link> : who}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {SANCTION_LABELS[r.kind]}
                      {r.perDay ? `, ${r.perDay} a day` : ""}
                      <span className="block text-caption text-text-secondary">
                        {r.createdLabel}
                        {r.untilLabel ? ` to ${r.untilLabel}` : r.kind === "ban" || r.orgId ? ", until lifted" : ""}
                      </span>
                      {r.liftedLabel ? <span className="block text-caption text-text-secondary">Lifted {r.liftedLabel}: {r.liftReason}</span> : null}
                    </td>
                    <td className="max-w-[320px] px-3 py-2 align-top">
                      {r.reason}
                      {r.caseId ? (
                        <Link href={`/ops/reports/${r.caseId}` as Route} className="block text-caption underline underline-offset-4">
                          Report case
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top">{r.staffIsMe ? "You" : (r.staffName ?? "Former staff")}</td>
                    <td className="px-3 py-2 text-right align-top">
                      {!r.liftedLabel && r.kind !== "warn" ? <LiftSanctionButton id={r.id} label={`${SANCTION_LABELS[r.kind]} of ${who}`} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={tab === "active" ? "No active sanctions" : "No sanctions in the last 90 days"} description="Suspensions, bans and throttles appear here." />
      )}
    </main>
  );
}
