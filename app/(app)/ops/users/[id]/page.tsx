import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SanctionUserForm } from "@/components/ops/sanction-forms";
import { ReasonAction, ResetTwoFactorForm, StartViewAsForm } from "@/components/ops/user-actions";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getUserRecord } from "@/lib/data/ops-users";
import { staffRoles } from "@/lib/data/ops-trust";
import { SANCTION_LABELS, type SanctionKind } from "@/lib/ops/appeals";

export const metadata: Metadata = { title: "User record" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Score and evidence" },
  { id: "cvs", label: "CVs" },
  { id: "sanctions", label: "Sanctions" },
] as const;

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-text-secondary">{k}</dt>
      <dd className="text-body-sm">{children}</dd>
    </div>
  );
}

/**
 * /ops/users/[id] (PRD 5.26, screen spec 3.11): a read-only record. Actions are role-gated in SQL:
 * view-as (any staff), GitHub re-sync and skills recompute (trust), sanctions (moderators), two-factor
 * reset (super admins). Billing lives at /ops/billing.
 */
export default async function OpsUserPage({ params, searchParams }: PageProps<"/ops/users/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [r, roles, sp] = await Promise.all([getUserRecord(id), staffRoles(), searchParams]);
  if (!r) notFound();
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "overview";
  const a = r.account;
  return (
    <main className="flex flex-col gap-5">
      <p>
        <Link href={"/ops/users" as Route} className="text-body-sm underline underline-offset-4">
          Users
        </Link>
      </p>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1">{a.name}</h1>
        {r.restriction ? <Badge tone="error" data-testid="user-restriction">{r.restriction.kind === "ban" ? "Banned" : "Suspended"}</Badge> : null}
        {a.status === "deleting" ? <Badge tone="warning">Deleting {a.deleteAfter}</Badge> : null}
        {a.status === "graduate" ? <Badge>Graduate</Badge> : null}
      </header>
      <nav aria-label="Record sections" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={(t.id === "overview" ? `/ops/users/${id}` : `/ops/users/${id}?tab=${t.id}`) as Route}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap",
                  tab === t.id ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" ? (
        <>
          <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-border-default bg-bg-surface p-4 sm:grid-cols-3" data-testid="user-account">
            <Row k="Email">{a.email}{a.emailConfirmed ? "" : " (not confirmed)"}</Row>
            <Row k="Username">{a.username ? `@${a.username}` : "—"}</Row>
            <Row k="Role">{a.role}{a.staffRoles.length ? ` · staff: ${a.staffRoles.join(", ")}` : ""}</Row>
            <Row k="University">{a.university ?? "—"}</Row>
            <Row k="Department">{a.department ?? "—"}{a.graduationYear ? `, ${a.graduationYear}` : ""}</Row>
            <Row k="Profile visibility">{a.visibility}</Row>
            <Row k="Joined">{a.joined}</Row>
            <Row k="Last sign-in">{a.lastSignIn ?? "Never"}</Row>
            <Row k="Two-factor">{a.twoFactor ? `On (${a.backupCodes} backup codes left)` : "Off"}</Row>
            <Row k="GitHub">
              {r.github ? (
                <>
                  <span className="font-mono">{r.github.login}</span> ({r.github.githubId}){r.github.revoked ? ", access revoked" : ""}
                  {r.github.lastSync ? <span className="block text-caption text-text-secondary">Last sync {r.github.lastSync.status}, {r.github.lastSync.at}</span> : null}
                </>
              ) : (
                "Not connected"
              )}
            </Row>
            <Row k="Billing">
              <Link href={`/ops/billing/user/${id}` as Route} className="underline underline-offset-4">
                Subscriptions and invoices
              </Link>
            </Row>
          </dl>
          {r.hints.length ? (
            <section aria-labelledby="hints-h" className="flex flex-col gap-2 rounded-lg border border-border-strong bg-bg-surface p-4" data-testid="evasion-hints">
              <h2 id="hints-h" className="text-h3">
                Possible ban evasion
              </h2>
              <ul className="flex flex-col gap-1 text-body-sm">
                {r.hints.map((h) => (
                  <li key={`${h.userId}:${h.why}`}>
                    <Link href={`/ops/users/${h.userId}` as Route} className="font-semibold underline underline-offset-4">
                      {h.name ?? "Unnamed account"}
                    </Link>{" "}
                    · {h.why}
                    {h.restriction ? ` · ${h.restriction === "ban" ? "banned" : "suspended"}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {r.isMe ? null : (
            <div className="grid gap-4 lg:grid-cols-2">
              <StartViewAsForm userId={id} name={a.name} />
              {roles.has("trust_reviewer") ? (
                <section aria-labelledby="trust-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
                  <h2 id="trust-h" className="text-h3">
                    Evidence tools
                  </h2>
                  {r.github && !r.github.revoked ? (
                    <ReasonAction kind="resync" userId={id} label="Force GitHub re-sync" title="Re-sync GitHub now?" description="Queues a full sync of their repositories, skipping the hourly limit." />
                  ) : null}
                  <ReasonAction
                    kind="recompute"
                    userId={id}
                    label="Recompute skills"
                    title="Recompute skill levels now?"
                    description="Rebuilds their skill levels from the evidence; their score follows at the next nightly run."
                  />
                </section>
              ) : null}
              {roles.has("super_admin") ? <ResetTwoFactorForm userId={id} name={a.name} /> : null}
            </div>
          )}
        </>
      ) : null}

      {tab === "evidence" ? (
        <div className="flex flex-col gap-4">
          <section aria-labelledby="score-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="score-h" className="text-h3">
              Score
            </h2>
            {r.score ? (
              <dl className="mt-2 grid gap-3 sm:grid-cols-4">
                <Row k="Total">{r.score.total}{r.score.held ? " (held)" : ""}</Row>
                <Row k="Tier">{r.score.tier ?? (r.score.ranked ? "—" : "Not ranked yet")}</Row>
                <Row k="Proof / momentum / adjustments">{r.score.proof} / {r.score.momentum} / {r.score.adjustments}</Row>
                <Row k="Computed">{r.score.computed} (formula v{r.score.formulaVersion})</Row>
              </dl>
            ) : (
              <p className="mt-2 text-body-sm text-text-secondary">No score yet.</p>
            )}
          </section>
          <section aria-labelledby="skills-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="skills-h" className="text-h3">
              Skills
            </h2>
            {r.skills.length ? (
              <ul className="mt-2 flex flex-wrap gap-2 text-body-sm">
                {r.skills.map((k) => (
                  <li key={k.skill} className="rounded-md border border-border-default px-2 py-1">
                    {k.skill} · L{k.level}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-body-sm text-text-secondary">No skills yet.</p>
            )}
            <p className="mt-3 text-body-sm">
              Credentials: {Object.entries(r.credentials).map(([s, n]) => `${n} ${s}`).join(", ") || "none"} · Code checks:{" "}
              {r.codeChecks.map((c) => `${c.skill} ${c.status}`).join(", ") || "none"}
            </p>
          </section>
        </div>
      ) : null}

      {tab === "cvs" ? (
        r.cvs.length ? (
          <ul className="flex flex-col divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface">
            {r.cvs.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-body-sm">
                <span className="font-mono">{c.code}</span>
                <span>v{c.version}, issued {c.issued}</span>
                <span>{c.revoked ? `Revoked ${c.revoked} (${c.revokedReason})` : "Valid"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No verified CVs" description="Issued CVs appear here." />
        )
      ) : null}

      {tab === "sanctions" ? (
        <div className="flex flex-col gap-4">
          {r.sanctions.length ? (
            <ul className="flex flex-col divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface" data-testid="user-sanctions">
              {r.sanctions.map((s) => (
                <li key={s.id} className="flex flex-col gap-0.5 px-4 py-2 text-body-sm">
                  <span className="font-semibold">
                    {SANCTION_LABELS[s.kind as SanctionKind] ?? s.kind}
                    {s.until ? ` until ${s.until}` : ""}
                    {s.lifted ? " (lifted)" : ""}
                  </span>
                  <span>{s.reason}</span>
                  <span className="text-caption text-text-secondary">
                    {s.created} by {s.staffName ?? "former staff"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No sanctions" description="Warnings, suspensions and bans appear here." />
          )}
          {roles.has("moderator") && !r.isMe ? <SanctionUserForm userId={id} name={a.name} superAdmin={roles.has("super_admin")} /> : null}
        </div>
      ) : null}
    </main>
  );
}
