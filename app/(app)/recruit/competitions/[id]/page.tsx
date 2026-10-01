import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetitionForm, FinishButton, ScoreForm } from "@/components/recruit/competition-forms";
import { Badge } from "@/components/ui";
import { getCompetitionManage, getMyOrg, getTalentFacets } from "@/lib/data/recruit";
import { isRefusal } from "@/lib/data/rpc-json";
import { dayLabel } from "@/lib/format/time";
import { COMPETITION_STATUS_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Competition" };

export default async function CompetitionPage({ params }: PageProps<"/recruit/competitions/[id]">) {
  const { id } = await params;
  const org = await getMyOrg();
  if (org?.status !== "verified") notFound();
  const doc = await getCompetitionManage(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!doc) notFound();
  const c = doc.competition;
  const facets = await getTalentFacets();
  const scorable = c.status === "frozen";
  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <p><Link href={"/recruit/competitions" as Route} className="text-body-sm font-semibold underline underline-offset-4">All competitions</Link></p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1">{c.title}</h1>
        <Badge tone={c.status === "live" ? "success" : c.status === "rejected" ? "warning" : "neutral"} data-testid="competition-status">{COMPETITION_STATUS_LABELS[c.status]}</Badge>
      </div>
      {c.review_note ? <p className="rounded-md border border-border-default bg-bg-subtle px-3 py-2 text-body-sm">Reviewer note: {c.review_note}</p> : null}
      <p className="text-body-sm text-text-secondary">{dayLabel(c.starts_at)} to {dayLabel(c.ends_at)} · teams of up to {c.team_size} · prize: {c.prize}</p>
      {c.status === "draft" || c.status === "rejected" ? <CompetitionForm existing={c} skills={facets.skills} universities={facets.universities} /> : null}

      {doc.teams.length > 0 || scorable || c.status === "judged" ? (
        <section aria-labelledby="entries-h" className="flex flex-col gap-4">
          <h2 id="entries-h" className="text-h3">Entries</h2>
          {doc.teams.length === 0 ? <p className="text-body-sm text-text-secondary">No teams registered.</p> : null}
          <ul className="flex flex-col gap-4" data-testid="entries">
            {doc.teams.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-h4">{t.name}{t.placement === 1 ? " · Winner" : ""}</h3>
                  {t.total !== null ? <Badge tone="verified">{t.total} / 100</Badge> : null}
                </div>
                <p className="text-body-sm text-text-secondary">{t.members.join(", ")}</p>
                {t.repo_url ? (
                  <p className="text-body-sm">
                    <a href={t.repo_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{t.repo_url.replace("https://github.com/", "")}</a>{" "}
                    {t.frozen_sha ? <span className="font-mono text-code-sm">frozen at {t.frozen_sha.slice(0, 8)}</span> : c.status !== "live" && c.status !== "approved" ? <span className="text-text-muted">{t.frozen_note ? `latest commit not recorded (${t.frozen_note})` : "recording the latest commit…"}</span> : null}
                  </p>
                ) : (
                  <p className="text-body-sm text-text-muted">No repository submitted.</p>
                )}
                {scorable && t.repo_url ? <ScoreForm competitionId={c.id} teamId={t.id} rubric={c.rubric} current={t.scores} /> : null}
              </li>
            ))}
          </ul>
          {scorable ? <FinishButton id={c.id} /> : null}
        </section>
      ) : null}
    </main>
  );
}
