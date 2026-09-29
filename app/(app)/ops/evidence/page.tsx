import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CREDENTIAL_STATUS_LABELS } from "@/lib/credentials/constants";
import { STATUS_LABELS as CHECK_LABELS } from "@/lib/code-checks/constants";
import { getCodeCheckQueue } from "@/lib/data/code-checks";
import { getRankingFlagQueue } from "@/lib/data/ops-ranking";
import { getCredentialQueue, getFlagQueue, staffRoles } from "@/lib/data/ops-trust";
import { FLAG_LABELS, RANKING_FLAG_LABELS, RANKING_FLAG_STATUS } from "@/lib/ops/labels";

export const metadata: Metadata = { title: "Evidence" };

const TABS = [
  { key: "credentials", label: "Credentials" },
  { key: "reviewed", label: "Reviewed credentials" },
  { key: "checks", label: "Code checks" },
  { key: "graded", label: "Graded checks" },
  { key: "flags", label: "GitHub flags" },
  { key: "ranking", label: "Ranking flags" },
  { key: "ranking_reviewed", label: "Reviewed ranking flags" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * /ops/evidence (screen spec "Verification queues", PRD 5.26 "Trust and evidence"): trust
 * reviewers claim an item before deciding it, oldest first, with how long it has waited.
 */
export default async function OpsEvidencePage({ searchParams }: PageProps<"/ops/evidence">) {
  if (!(await staffRoles()).has("trust_reviewer")) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "credentials";

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-h1">Evidence</h1>
      <nav aria-label="Evidence queues" className="border-b border-border-default">
        <ul className="-mb-px flex flex-wrap gap-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={(t.key === "credentials" ? "/ops/evidence" : `/ops/evidence?tab=${t.key}`) as Route}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                  tab === t.key ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "ranking" || tab === "ranking_reviewed" ? (
        <RankingFlagTable status={tab === "ranking" ? "open" : "reviewed"} />
      ) : tab === "flags" ? (
        <FlagTable />
      ) : tab === "checks" || tab === "graded" ? (
        <CodeCheckTable status={tab === "graded" ? "graded" : "submitted"} />
      ) : (
        <CredentialTable status={tab === "reviewed" ? "reviewed" : "pending"} />
      )}
    </main>
  );
}

async function CredentialTable({ status }: { status: "pending" | "reviewed" }) {
  const rows = await getCredentialQueue(status);
  if (!rows.length) {
    return (
      <EmptyState
        title={status === "pending" ? "No credentials waiting" : "Nothing reviewed in the last 30 days"}
        description="Students' certificates appear here, oldest first."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
      <table className="w-full min-w-[880px] text-left text-body-sm" data-testid="credential-queue">
        <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Credential</th>
            <th scope="col" className="px-3 py-2 font-semibold">Student</th>
            <th scope="col" className="px-3 py-2 font-semibold">Issuer</th>
            <th scope="col" className="px-3 py-2 font-semibold">File</th>
            <th scope="col" className="px-3 py-2 font-semibold">{status === "pending" ? "Waiting" : "Reviewed"}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{status === "pending" ? "Claimed by" : "Outcome"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((r) => (
            <tr key={r.id} data-testid="credential-row">
              <td className="px-3 py-2 align-top">
                <Link href={`/ops/evidence/credentials/${r.id}` as Route} className="font-semibold underline underline-offset-4">
                  {r.title}
                </Link>
              </td>
              <td className="px-3 py-2 align-top">
                {r.student}
                {r.university ? <span className="block text-caption text-text-secondary">{r.university}</span> : null}
              </td>
              <td className="px-3 py-2 align-top">
                {r.issuer}
                {r.suggestedIssuer && status === "pending" ? <span className="block text-caption text-text-secondary">Recognised: likely</span> : null}
              </td>
              <td className="px-3 py-2 align-top">{r.fileType === "pdf" ? "PDF" : "Image"}</td>
              <td className="px-3 py-2 align-top tabular-nums">{status === "pending" ? r.age : r.reviewedLabel}</td>
              <td className="px-3 py-2 align-top">
                {status === "pending" ? (r.claimedByMe ? "You" : (r.claimedBy ?? "Nobody yet")) : CREDENTIAL_STATUS_LABELS[r.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function FlagTable() {
  const rows = await getFlagQueue();
  if (!rows.length) {
    return <EmptyState title="No GitHub flags open" description="Held commits (bursts, backdating, duplicated files) appear here." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
      <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="flag-queue">
        <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Flag</th>
            <th scope="col" className="px-3 py-2 font-semibold">Student</th>
            <th scope="col" className="px-3 py-2 font-semibold">Commits held</th>
            <th scope="col" className="px-3 py-2 font-semibold">Waiting</th>
            <th scope="col" className="px-3 py-2 font-semibold">Claimed by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 align-top">
                <Link href={`/ops/evidence/flags/${r.id}` as Route} className="font-semibold underline underline-offset-4">
                  {FLAG_LABELS[r.kind] ?? r.kind}
                </Link>
              </td>
              <td className="px-3 py-2 align-top">{r.student}</td>
              <td className="px-3 py-2 align-top tabular-nums">{r.commits}</td>
              <td className="px-3 py-2 align-top tabular-nums">{r.age}</td>
              <td className="px-3 py-2 align-top">{r.claimedByMe ? "You" : (r.claimedBy ?? "Nobody yet")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function RankingFlagTable({ status }: { status: "open" | "reviewed" }) {
  const rows = await getRankingFlagQueue(status);
  if (!rows.length) {
    return (
      <EmptyState
        title={status === "open" ? "No ranking flags open" : "Nothing reviewed in the last 30 days"}
        description="Endorsement rings and fast gains from the nightly ranking run appear here, oldest first."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
      <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="ranking-flag-queue">
        <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Flag</th>
            <th scope="col" className="px-3 py-2 font-semibold">Students</th>
            <th scope="col" className="px-3 py-2 font-semibold">What</th>
            <th scope="col" className="px-3 py-2 font-semibold">{status === "open" ? "Waiting" : "Reviewed"}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{status === "open" ? "Claimed by" : "Outcome"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((r) => (
            <tr key={r.id} data-testid="ranking-flag-row">
              <td className="px-3 py-2 align-top">
                <Link href={`/ops/evidence/ranking/${r.id}` as Route} className="font-semibold underline underline-offset-4">
                  {RANKING_FLAG_LABELS[r.kind]}
                </Link>
              </td>
              <td className="px-3 py-2 align-top">{r.members.join(", ")}</td>
              <td className="px-3 py-2 align-top tabular-nums">
                {r.kind === "rapid_gain"
                  ? `+${r.gain?.toFixed(2)} (${r.fromTotal?.toFixed(2)} to ${r.toTotal?.toFixed(2)})`
                  : `${r.endorsements} ${r.endorsements === 1 ? "endorsement" : "endorsements"}`}
              </td>
              <td className="px-3 py-2 align-top tabular-nums">{status === "open" ? r.age : r.reviewedLabel}</td>
              <td className="px-3 py-2 align-top">
                {status === "open" ? (r.claimedByMe ? "You" : (r.claimedBy ?? "Nobody yet")) : RANKING_FLAG_STATUS[r.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function CodeCheckTable({ status }: { status: "submitted" | "graded" }) {
  const rows = await getCodeCheckQueue(status);
  if (!rows.length) {
    return (
      <EmptyState
        title={status === "submitted" ? "No code checks to grade" : "Nothing graded in the last 30 days"}
        description="Students' answers appear here once they hand them in, oldest first. Teachers take these over in phase 7."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
      <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="code-check-queue">
        <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Skill</th>
            <th scope="col" className="px-3 py-2 font-semibold">Student</th>
            <th scope="col" className="px-3 py-2 font-semibold">{status === "submitted" ? "Waiting" : "Graded"}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{status === "submitted" ? "Claimed by" : "Outcome"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((r) => (
            <tr key={r.id} data-testid="code-check-row">
              <td className="px-3 py-2 align-top">
                <Link href={`/ops/evidence/code-checks/${r.id}` as Route} className="font-semibold underline underline-offset-4">
                  {r.skill}
                </Link>
                {r.conflict ? <span className="block text-caption text-text-secondary">You know this student: someone else grades it</span> : null}
              </td>
              <td className="px-3 py-2 align-top">{r.student}</td>
              <td className="px-3 py-2 align-top tabular-nums">
                {status === "submitted" ? r.age : r.gradedLabel}
                {r.overdue ? <strong className="block text-caption text-text-error">Overdue (72 h)</strong> : null}
              </td>
              <td className="px-3 py-2 align-top">
                {status === "submitted" ? (r.claimedByMe ? "You" : (r.claimedBy ?? "Nobody yet")) : CHECK_LABELS[r.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
