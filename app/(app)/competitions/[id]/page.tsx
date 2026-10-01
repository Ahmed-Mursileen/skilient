import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTeamForm, InviteTeammateForm, SubmitRepoForm, TeamInviteResponse } from "@/components/recruit/student-controls";
import { Badge } from "@/components/ui";
import { getPublicCompetition } from "@/lib/data/opportunities";
import { isRefusal } from "@/lib/data/rpc-json";
import { dayLabel } from "@/lib/format/time";
import { COMPETITION_STATUS_LABELS, TIER_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Competition" };

/** /competitions/[id] (PRD 5.20): the brief, the rubric, your team and your repository. */
export default async function CompetitionPage({ params }: PageProps<"/competitions/[id]">) {
  const { id } = await params;
  const c = await getPublicCompetition(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!c) notFound();
  const open = (c.status === "approved" || c.status === "live") && new Date(c.ends_at) > new Date();
  const team = c.team;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">{c.title}</h1>
        <p className="text-body">
          By <Link href={`/companies/${c.org.slug}` as Route} className="font-semibold underline underline-offset-4">{c.org.name}</Link> · for a {c.role}
        </p>
        <p className="text-body-sm text-text-secondary">
          {dayLabel(c.starts_at)} to {dayLabel(c.ends_at)} · teams of up to {c.team_size} · prize: {c.prize}
        </p>
        <p><Badge tone={c.status === "live" ? "success" : "neutral"} data-testid="competition-status">{COMPETITION_STATUS_LABELS[c.status]}</Badge></p>
      </header>
      <section aria-labelledby="brief-h" className="flex flex-col gap-2">
        <h2 id="brief-h" className="text-h3">The brief</h2>
        <p className="text-body whitespace-pre-line">{c.brief}</p>
        <p className="text-body-sm text-text-secondary">Skills tested: {c.skills.join(", ")}.{c.min_tier ? ` ${TIER_LABELS[c.min_tier]} tier or above.` : ""}</p>
      </section>
      <section aria-labelledby="rubric-h" className="flex flex-col gap-2">
        <h2 id="rubric-h" className="text-h3">How it is judged</h2>
        <ul className="flex flex-col gap-1 text-body">
          {c.rubric.map((r) => (
            <li key={r.criterion}>{r.criterion}: {r.weight}%</li>
          ))}
        </ul>
        <p className="text-body-sm text-text-secondary">Submitting earns L3 evidence in these skills. The winning team gets a badge that counts toward L4.</p>
      </section>
      <section aria-labelledby="team-h" className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-5">
        <h2 id="team-h" className="text-h3">Your team</h2>
        {team ? (
          <>
            <p className="text-body"><strong className="font-semibold" data-testid="team-name">{team.name}</strong>: {team.members.map((m) => `${m.name}${m.status === "invited" ? " (invited)" : ""}`).join(", ")}</p>
            {team.my_status === "invited" ? <TeamInviteResponse competitionId={c.id} teamId={team.id} /> : null}
            {team.is_lead && open ? <InviteTeammateForm competitionId={c.id} teamId={team.id} /> : null}
            {team.my_status === "joined" && team.is_lead && open ? <SubmitRepoForm competitionId={c.id} teamId={team.id} current={team.repo_url ?? ""} /> : null}
            {team.repo_url ? (
              <p className="text-body-sm" data-testid="team-repo">
                Repository: <a href={team.repo_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{team.repo_url.replace("https://github.com/", "")}</a>
                {team.frozen_sha ? <span className="ml-2 font-mono text-code-sm">frozen at {team.frozen_sha.slice(0, 8)}</span> : null}
              </p>
            ) : null}
            {c.status === "judged" && team.total !== null ? (
              <p className="text-body" data-testid="team-result">Result: {team.total} / 100{team.placement ? `, place ${team.placement}` : ""}.{team.feedback ? ` ${team.feedback}` : ""}</p>
            ) : null}
          </>
        ) : open && c.eligible ? (
          <CreateTeamForm competitionId={c.id} />
        ) : open ? (
          <p className="text-body-sm text-text-secondary">You need {c.unmet.join(", ")} to enter.</p>
        ) : (
          <p className="text-body-sm text-text-secondary">Registration is closed.</p>
        )}
      </section>
    </main>
  );
}
