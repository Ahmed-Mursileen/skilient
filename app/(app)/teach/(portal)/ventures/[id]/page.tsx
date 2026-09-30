import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/teach/action-button";
import { TeacherEndorseForm } from "@/components/teach/endorse-form";
import { SupervisorThreadView } from "@/components/teach/thread";
import { Badge } from "@/components/ui";
import { confirmAsSupervisor, endSupervision, respondSupervision, startReview } from "@/lib/actions/teach";
import {
  getSupervisorThread,
  getTeacherContributions,
  getTeacherDeliverables,
  getTeacherEndorseOptions,
  getTeacherVenture,
} from "@/lib/data/teach";

export const metadata: Metadata = { title: "Venture" };

/**
 * /teach/ventures/[id] (PRD 5.21): a venture the teacher supervises or reviews. Contributions and
 * deliverables, the supervisor thread, confirmations (faculty-confirmed), a review, and endorsements.
 */
export default async function TeacherVenturePage({ params }: PageProps<"/teach/ventures/[id]">) {
  const { id } = await params;
  const v = await getTeacherVenture(id);
  if (!v) notFound();
  const [contributions, deliverables, thread, endorse] = await Promise.all([
    v.canRead ? getTeacherContributions(id) : Promise.resolve([]),
    v.canRead ? getTeacherDeliverables(id) : Promise.resolve([]),
    v.iSupervise ? getSupervisorThread(id) : Promise.resolve(null),
    v.canEndorse ? getTeacherEndorseOptions(id) : Promise.resolve(null),
  ]);
  return (
    <main className="flex flex-col gap-8">
      <div>
        <Link href="/teach" className="text-body-sm text-text-secondary underline underline-offset-4">Home</Link>
        <h1 className="mt-1 font-display text-h1">{v.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          <Badge>{v.status.replace("_", " ")}</Badge>
          {v.supervision === "active" ? "You supervise this venture" : v.supervision === "invited" ? "Asked you to supervise" : v.supervision === "ended" ? "Your supervision ended" : null}
          {v.idea ? <span>· from your idea <Link href={`/teach/ideas/${v.idea.id}` as Route} className="underline underline-offset-4">{v.idea.title}</Link></span> : null}
        </p>
      </div>

      {v.supervision === "invited" ? (
        <div className="flex gap-2">
          <ActionButton action={respondSupervision.bind(null, v.id, true)} variant="primary">Accept supervision</ActionButton>
          <ActionButton action={respondSupervision.bind(null, v.id, false)}>Decline</ActionButton>
        </div>
      ) : null}

      <section aria-labelledby="about-h" className="flex flex-col gap-2">
        <h2 id="about-h" className="text-h3">About</h2>
        <p className="text-body whitespace-pre-line">{v.description}</p>
        <p className="text-body-sm text-text-secondary">
          Team: {v.members.map((m) => m.name).join(", ")}. Skills: {v.skills.map((s) => s.name).join(", ") || "none tagged"}.
        </p>
      </section>

      {v.canRead ? (
        <>
          <section aria-labelledby="work-h" className="flex flex-col gap-3">
            <h2 id="work-h" className="text-h3">Contributions</h2>
            {contributions.length === 0 ? (
              <p className="text-body-sm text-text-secondary">No entries yet.</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="teacher-contributions">
                {contributions.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-3">
                    <div className="min-w-0">
                      <p className="text-body-sm text-text-secondary">{c.author} · {c.kind} · {c.dateLabel}{c.hours ? ` · ${c.hours} h` : ""}</p>
                      <p className="text-body">{c.description}</p>
                      {c.evidenceUrl ? <a href={c.evidenceUrl} target="_blank" rel="noreferrer noopener" className="text-body-sm underline underline-offset-4">Evidence<span className="sr-only"> (opens in a new tab)</span></a> : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {c.facultyConfirmed ? (
                        <Badge tone="verified">Faculty-confirmed</Badge>
                      ) : c.peerVerified ? (
                        <Badge tone="success">Peer-verified</Badge>
                      ) : null}
                      {v.iSupervise && !c.github && !c.facultyConfirmed ? (
                        <ActionButton action={confirmAsSupervisor.bind(null, c.id, v.id)} size="sm" testId="confirm-entry">Confirm</ActionButton>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="deliv-h" className="flex flex-col gap-2">
            <h2 id="deliv-h" className="text-h3">Deliverables</h2>
            {deliverables.length === 0 ? (
              <p className="text-body-sm text-text-secondary">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {deliverables.map((d) => (
                  <li key={d.id}><a href={d.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">{d.label}<span className="sr-only"> (opens in a new tab)</span></a></li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="rounded-md border border-border-default bg-bg-subtle px-4 py-3 text-body-sm text-text-secondary">
          You can read this venture&apos;s contributions and deliverables while you supervise it or hold an open review request for it.
        </p>
      )}

      {thread ? (
        <section aria-labelledby="thread-h" className="flex flex-col gap-3">
          <h2 id="thread-h" className="text-h3">Supervisor thread</h2>
          <SupervisorThreadView ventureId={v.id} thread={thread} canPost />
        </section>
      ) : null}

      <section aria-labelledby="review-h" className="flex flex-col gap-3">
        <h2 id="review-h" className="flex items-center gap-2 text-h3"><ShieldCheck aria-hidden className="size-5" /> Review</h2>
        {v.openRequest ? (
          <Link href={`/teach/reviews/${v.openRequest}` as Route} className="font-semibold underline underline-offset-4">Open the review request</Link>
        ) : v.iSupervise ? (
          <ActionButton action={startReview.bind(null, v.id)}>Start a review</ActionButton>
        ) : v.reviewed ? (
          <p className="text-body-sm text-text-secondary">You reviewed this venture. The CV shows a &ldquo;Reviewed by faculty&rdquo; badge, never a score.</p>
        ) : (
          <p className="text-body-sm text-text-secondary">No review request is open.</p>
        )}
      </section>

      {endorse ? (
        <section aria-labelledby="endorse-h" className="flex flex-col gap-3">
          <h2 id="endorse-h" className="text-h3">Endorse members</h2>
          <TeacherEndorseForm ventureId={v.id} options={endorse} />
        </section>
      ) : null}

      {v.iSupervise ? (
        <div>
          <ActionButton action={endSupervision.bind(null, v.id)} variant="danger">End my supervision</ActionButton>
        </div>
      ) : null}
    </main>
  );
}
