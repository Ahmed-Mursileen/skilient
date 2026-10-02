import { Eye } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StartViewAsForm } from "@/components/ops/user-actions";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getUserRecord, getViewAsPage, VIEW_PAGES, type ViewPage } from "@/lib/data/ops-users";
import { dayLabel } from "@/lib/format/time";
import { describeNotification } from "@/supabase/functions/_shared/notify/describe";

export const metadata: Metadata = { title: "View as user" };

const LABELS: Record<ViewPage, string> = {
  profile: "Profile",
  me: "Me",
  cv: "CV",
  opportunities: "Opportunities",
  privacy: "Privacy",
  notifications: "Notifications",
};

type Doc = Record<string, unknown>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Doc[]) : []);
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-text-secondary">{k}</dt>
      <dd className="text-body-sm">{children}</dd>
    </div>
  );
}

function Items({ rows, empty, render }: { rows: Doc[]; empty: string; render: (r: Doc) => ReactNode }) {
  if (!rows.length) return <p className="text-body-sm text-text-secondary">{empty}</p>;
  return <ul className="flex flex-col divide-y divide-border-muted">{rows.map((r, i) => <li key={i} className="py-2 text-body-sm">{render(r)}</li>)}</ul>;
}

/**
 * /ops/users/[id]/view/[page] (PRD 5.26 "view as user"): the user's own pages, read-only, under a
 * banner. Each page needs a view session started with a reason in the last hour and is recorded on
 * it; the user was told. Chats are never available here.
 */
export default async function ViewAsPage({ params }: PageProps<"/ops/users/[id]/view/[page]">) {
  const { id, page } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !(VIEW_PAGES as readonly string[]).includes(page)) notFound();
  const view = await getViewAsPage(id, page as ViewPage);
  if (!view) {
    const r = await getUserRecord(id);
    if (!r) notFound();
    return (
      <main className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-h1">View as {r.account.name}</h1>
        <p className="text-body text-text-secondary">A view lasts an hour. Start a new one with a reason.</p>
        <StartViewAsForm userId={id} name={r.account.name} />
      </main>
    );
  }
  const d = view.doc;
  return (
    <main className="flex flex-col gap-4">
      <div role="note" className="flex flex-wrap items-center gap-2 rounded-md border border-border-strong bg-bg-subtle px-4 py-3 text-body-sm" data-testid="view-as-banner">
        <Eye aria-hidden weight="bold" className="size-4" />
        <span className="font-semibold">Viewing as {view.name}, read-only.</span>
        <span>Every page you open is logged and {view.name} has been told. Chats are never shown.</span>
        <Link href={`/ops/users/${id}` as Route} className="ml-auto font-semibold underline underline-offset-4">
          Stop viewing
        </Link>
      </div>
      <h1 className="font-display text-h1">{LABELS[page as ViewPage]}</h1>
      <nav aria-label="Their pages" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {VIEW_PAGES.map((p) => (
            <li key={p}>
              <Link
                href={`/ops/users/${id}/view/${p}` as Route}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap",
                  p === page ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {LABELS[p]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section className="rounded-lg border border-border-default bg-bg-surface p-4" data-testid="view-as-content">
        {page === "profile" ? (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Row k="Name">{txt(d.name)}</Row>
              <Row k="Username">{d.username ? `@${String(d.username)}` : "—"}</Row>
              <Row k="University">{txt(d.university)}</Row>
              <Row k="Department">{txt(d.department)}{d.graduation_year ? `, ${String(d.graduation_year)}` : ""}</Row>
              <Row k="Visibility">{txt(d.visibility)}</Row>
              <Row k="Endorsements">{txt(d.endorsements)}</Row>
            </dl>
            <p className="text-body break-words">{txt(d.bio)}</p>
            <Items rows={list(d.skills)} empty="No skills yet." render={(s) => `${txt(s.skill)} · L${txt(s.level)}`} />
            <Items rows={list(d.ventures)} empty="No ventures." render={(v) => `${txt(v.title)} (${txt(v.role)})`} />
          </div>
        ) : page === "me" ? (
          <div className="flex flex-col gap-4">
            {d.score ? (
              <dl className="grid gap-3 sm:grid-cols-4">
                <Row k="Score">{txt((d.score as Doc).total)}</Row>
                <Row k="Tier">{txt((d.score as Doc).tier)}</Row>
                <Row k="Ranked">{(d.score as Doc).ranked ? "Yes" : "Not yet"}</Row>
                <Row k="Held">{(d.score as Doc).held ? "Yes" : "No"}</Row>
              </dl>
            ) : (
              <p className="text-body-sm text-text-secondary">No score yet.</p>
            )}
            <Items rows={list(d.skills)} empty="No skills yet." render={(s) => `${txt(s.skill)} · L${txt(s.level)} · ${txt(s.repos)} repos`} />
            <Items rows={list(d.work)} empty="No ventures." render={(v) => `${txt(v.title)} (${txt(v.role)}), joined ${v.joined_at ? dayLabel(String(v.joined_at)) : "—"}`} />
          </div>
        ) : page === "cv" ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm">CV visibility: {txt((d.settings as Doc | null)?.visibility)}</p>
            <Items
              rows={list(d.records)}
              empty="No verified CV yet."
              render={(r) => `${txt(r.code)} v${txt(r.version)}, issued ${r.issued_at ? dayLabel(String(r.issued_at)) : "—"}${r.revoked_at ? `, revoked (${txt(r.revoked_reason)})` : ""}`}
            />
          </div>
        ) : page === "opportunities" ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-h3">Applications</h2>
            <Items rows={list(d.applications)} empty="No applications." render={(a) => `${txt(a.job)} at ${txt(a.org)}: ${txt(a.stage)}`} />
            <h2 className="text-h3">Contact requests</h2>
            <Items rows={list(d.contact_requests)} empty="No contact requests." render={(c) => `${txt(c.org)} (${txt(c.role_title)}): ${txt(c.status)}`} />
          </div>
        ) : page === "privacy" ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Row k="Profile visibility">{txt(d.visibility)}</Row>
            <Row k="Visible to recruiters">{d.recruiter_visible ? "Yes" : "No"}</Row>
            <Row k="Leaderboard">{d.leaderboard_opt_out ? "Opted out" : "Shown"}</Row>
            <Row k="Read receipts">{d.chat_read_receipts ? "On" : "Off"}</Row>
            <Row k="CV visibility">{txt(d.cv_visibility)}</Row>
            <Row k="Blocked companies">{txt(d.blocked_companies)}</Row>
          </dl>
        ) : list(d.items).length ? (
          <ul className="flex flex-col divide-y divide-border-muted">
            {list(d.items).map((n, i) => {
              const text = describeNotification({
                type: String(n.type),
                actorName: null,
                entityType: String(n.entity_type ?? ""),
                entityId: String(n.entity_id ?? ""),
                data: (n.data as Record<string, unknown>) ?? {},
              }).text;
              return (
                <li key={i} className="flex justify-between gap-3 py-2 text-body-sm">
                  <span>{text}</span>
                  <span className="shrink-0 text-caption text-text-secondary">{n.created_at ? dayLabel(String(n.created_at)) : ""}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No notifications" description="Nothing to show." />
        )}
      </section>
    </main>
  );
}
