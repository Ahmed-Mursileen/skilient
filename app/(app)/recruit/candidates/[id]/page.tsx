import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactDialog, InviteToApplyControl, NotesPanel, ShortlistControl } from "@/components/recruit/candidate-actions";
import { Avatar, Badge, SkillChip, TierBadge } from "@/components/ui";
import type { SkillLevel } from "@/components/ui";
import { getCandidate, getMyOrg, getNotes, getOrgJobs, getOrgPlan, getShortlists } from "@/lib/data/recruit";
import { isRefusal } from "@/lib/data/rpc-json";
import { ageLabel, dayLabel } from "@/lib/format/time";
import { AVAILABILITY_LABELS, CONTACT_STATUS_LABELS, type Availability } from "@/lib/recruit/constants";
import { publicImageUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Candidate" };

const LOOKING: Record<string, string> = { internship: "an internship", job: "a job", teammates: "teammates", project: "a project", mentorship: "mentorship" };

/**
 * /recruit/candidates/[id] (PRD 5.20): the live CV's content with the verified badge, skills with
 * evidence, ventures with team role and faculty-review badges, tier and percentile, the "looking for"
 * line and availability. Opening one is logged (the student sees how many companies looked, and
 * names with Pro). Students who turned recruiter visibility off can't be opened.
 */
export default async function CandidatePage({ params }: PageProps<"/recruit/candidates/[id]">) {
  const { id } = await params;
  const org = await getMyOrg();
  if (org?.status !== "verified") notFound();
  const candidate = await getCandidate(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!candidate) notFound();
  const [notes, lists, jobs, plan] = await Promise.all([getNotes(id), getShortlists(), getOrgJobs(), getOrgPlan()]);
  const p = candidate.person;
  const cv = candidate.cv;
  const left = plan.contact_credits_limit === null ? null : Math.max(plan.contact_credits_limit - plan.contact_credits_used, 0);
  const last = candidate.last_contact;
  const canContact = !last || last.status === "expired" || (last.status === "declined" && (!last.retry_after || new Date(last.retry_after) <= new Date()));
  const liveJobs = jobs.jobs.filter((j) => j.status === "live");
  return (
    <main className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <article className="flex min-w-0 flex-col gap-6" aria-labelledby="cand-h">
        <header className="flex flex-wrap items-center gap-3">
          <Avatar name={p.name} src={publicImageUrl("avatars", p.avatar_path)} size="lg" />
          <div className="min-w-0">
            <h1 id="cand-h" className="font-display text-h1" data-testid="candidate-name">{p.name}</h1>
            <p className="text-body text-text-secondary">
              {[p.department, p.university, p.batch ? `Class of ${p.batch}` : null].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {candidate.tier ? <TierBadge tier={candidate.tier} /> : null}
              {cv?.standing.top_percent ? <Badge>Top {cv.standing.top_percent}%</Badge> : null}
              {candidate.verify_code ? (
                <Link href={`/verify/${candidate.verify_code}` as Route} className="inline-flex items-center gap-2 text-body-sm font-semibold underline underline-offset-4">
                  <Badge tone="verified">Verified CV</Badge> Open the signed CV
                </Link>
              ) : (
                <span className="text-body-sm text-text-muted">CV shared by the student&apos;s own link only</span>
              )}
            </div>
          </div>
        </header>

        <section aria-labelledby="looking-h" className="flex flex-col gap-1">
          <h2 id="looking-h" className="text-h3">Looking for</h2>
          <p className="text-body">
            {p.looking_for.length ? `Open to ${p.looking_for.map((l) => LOOKING[l] ?? l).join(", ")}.` : "They haven't said what they're looking for."}{" "}
            {p.availability.length ? `Available for ${p.availability.map((a) => AVAILABILITY_LABELS[a as Availability] ?? a).join(", ").toLowerCase()}.` : ""}{" "}
            {[p.city, p.remote_ok ? "open to remote" : null].filter(Boolean).join(", ")}
          </p>
        </section>

        {cv ? (
          <>
            <section aria-labelledby="skills-h" className="flex flex-col gap-3">
              <h2 id="skills-h" className="text-h3">Skills with evidence</h2>
              <ul className="flex flex-col gap-2" data-testid="candidate-skills">
                {cv.skills.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    <SkillChip name={s.name} level={s.level as SkillLevel} aiAssisted={s.ai_assisted === true} />
                    <span className="text-body-sm text-text-secondary">
                      {[
                        s.evidence.repos ? `${s.evidence.repos} repos` : null,
                        s.evidence.active_days ? `${s.evidence.active_days} active days` : null,
                        s.evidence.pull_requests ? `${s.evidence.pull_requests} merged PRs` : null,
                        s.evidence.entries ? `${s.evidence.entries} confirmed entries` : null,
                        s.evidence.endorsements ? `${s.evidence.endorsements} endorsements` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {cv.projects.length ? (
              <section aria-labelledby="proj-h" className="flex flex-col gap-3">
                <h2 id="proj-h" className="text-h3">Ventures</h2>
                <ul className="flex flex-col gap-3">
                  {cv.projects.map((pr) => (
                    <li key={pr.id} className="rounded-lg border border-border-default bg-bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-h4">{pr.title}</h3>
                        <Badge>{pr.status === "completed" ? "Completed" : "In progress"}</Badge>
                        {pr.faculty_reviewed ? <Badge tone="verified">Faculty reviewed</Badge> : null}
                      </div>
                      <p className="text-body-sm text-text-secondary">
                        {pr.role.replace(/_/g, " ")} · team of {pr.team_size} · {pr.verified_entries} verified entries
                        {pr.faculty_confirmed ? ` · ${pr.faculty_confirmed} confirmed by faculty` : ""}
                        {pr.repository ? ` · ${pr.repository}` : ""}
                      </p>
                      {pr.description ? <p className="mt-1 text-body-sm">{pr.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {cv.endorsements.length ? (
              <section aria-labelledby="end-h" className="flex flex-col gap-2">
                <h2 id="end-h" className="text-h3">Endorsements</h2>
                <ul className="flex flex-col gap-1 text-body-sm">
                  {cv.endorsements.map((e, i) => (
                    <li key={i}>{e.endorser} endorsed {e.skill} on {e.venture}{e.note ? `: “${e.note}”` : ""}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {cv.credentials.length ? (
              <section aria-labelledby="cred-h" className="flex flex-col gap-2">
                <h2 id="cred-h" className="text-h3">Verified credentials</h2>
                <ul className="flex flex-col gap-1 text-body-sm">
                  {cv.credentials.map((c, i) => (
                    <li key={i}>{c.title}, {c.issuer} ({c.issued})</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <p className="text-body-sm text-text-muted">This student has no signed CV yet.</p>
        )}
      </article>

      <aside className="flex flex-col gap-6" aria-label="Actions">
        <section aria-labelledby="act-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="act-h" className="text-h4">Contact</h2>
          {last ? (
            <p className="text-body-sm text-text-secondary" data-testid="last-contact">
              {CONTACT_STATUS_LABELS[last.status]}: {last.role_title}, {ageLabel(last.at)}{last.by_name ? ` by ${last.by_name}` : ""}.
              {last.status === "declined" && last.retry_after ? ` They declined; you can ask again after ${dayLabel(last.retry_after)}.` : ""}
            </p>
          ) : null}
          {last?.thread_id ? (
            <Link href={`/chat/${last.thread_id}` as Route} className="font-semibold underline underline-offset-4">Open the conversation</Link>
          ) : canContact ? (
            <ContactDialog studentId={id} creditsLeft={left} />
          ) : (
            <p className="text-body-sm text-text-muted">{last?.status === "pending" ? "Waiting for their answer. Requests expire after 14 days." : "You can't contact this student right now."}</p>
          )}
        </section>
        <section className="rounded-lg border border-border-default bg-bg-surface p-4">
          <ShortlistControl studentId={id} lists={lists.map((l) => ({ id: l.id, name: l.name }))} inLists={candidate.shortlists} />
        </section>
        <section className="rounded-lg border border-border-default bg-bg-surface p-4">
          <InviteToApplyControl studentId={id} jobs={liveJobs.map((j) => ({ id: j.id, title: j.title }))} />
        </section>
        <section className="rounded-lg border border-border-default bg-bg-surface p-4">
          <NotesPanel studentId={id} notes={notes.map((n) => ({ ...n, created_label: ageLabel(n.created_at) }))} />
        </section>
      </aside>
    </main>
  );
}
