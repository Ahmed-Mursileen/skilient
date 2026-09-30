import { SealCheck } from "@phosphor-icons/react/dist/ssr";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/teach/action-button";
import { FacultyControls } from "@/components/teach/faculty-controls";
import { SupervisorThreadView } from "@/components/teach/thread";
import { Badge, EmptyState } from "@/components/ui";
import { closeReviewRequest, endSupervision } from "@/lib/actions/teach";
import { getVenture } from "@/lib/data/ventures";
import {
  getOwnReviewRequests,
  getSupervision,
  getSupervisorThread,
  getTeachersForVenture,
  getVentureReviews,
} from "@/lib/data/teach";
import { REVIEW_RUBRIC, REVIEW_STATUS_LABELS } from "@/lib/teach/constants";

/**
 * Reviews tab (PRD 5.21, 5.28): the venture's supervisor, the faculty reviews, and for the team the
 * supervisor thread. The owner asks a teacher to supervise or review. Scores are the team's; other
 * viewers see that faculty reviewed it.
 */
export default async function VentureReviewsPage({ params }: PageProps<"/ventures/[id]/reviews">) {
  const { id } = await params;
  const v = await getVenture(id);
  if (!v) notFound();
  const isOwner = v.viewer.isOwner;
  const isMember = v.viewer.isMember;
  const open = v.status !== "completed" && v.status !== "abandoned";
  const [supervision, reviews, requests, teachers, thread] = await Promise.all([
    getSupervision(id),
    getVentureReviews(id),
    isMember ? getOwnReviewRequests(id) : Promise.resolve([]),
    isOwner ? getTeachersForVenture(id) : Promise.resolve([]),
    isMember ? getSupervisorThread(id) : Promise.resolve(null),
  ]);
  const openRequests = requests.filter((r) => r.status === "open");
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="sup-h" className="flex flex-col gap-3">
        <h2 id="sup-h" className="text-h3">Supervisor</h2>
        {supervision ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="supervisor-card">
            <div>
              <p className="text-body font-semibold">{supervision.name}</p>
              <p className="text-body-sm text-text-secondary">
                {supervision.title}, {supervision.department}
                {supervision.status === "invited" ? " · invited, hasn't answered yet" : supervision.startedLabel ? ` · since ${supervision.startedLabel}` : ""}
              </p>
            </div>
            {isOwner ? <ActionButton action={endSupervision.bind(null, id)} variant="ghost" size="sm">{supervision.status === "invited" ? "Withdraw the invite" : "End supervision"}</ActionButton> : null}
          </div>
        ) : (
          <p className="text-body-sm text-text-secondary">
            No supervisor. One teacher can supervise a venture: they read its work, comment in a thread apart from your team chat, and confirm contributions.
          </p>
        )}
      </section>

      {isOwner && open ? (
        <section aria-labelledby="ask-h" className="flex flex-col gap-3">
          <h2 id="ask-h" className="text-h3">Ask a teacher</h2>
          <FacultyControls ventureId={id} teachers={teachers} canSupervise={!supervision} canReview={v.status === "in_progress" || v.status === "completed"} />
        </section>
      ) : null}

      {isMember && requests.length ? (
        <section aria-labelledby="req-h" className="flex flex-col gap-3">
          <h2 id="req-h" className="text-h3">Review requests</h2>
          <ul className="flex flex-col gap-2" data-testid="review-requests">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-3">
                <span className="text-body-sm">
                  {r.teacherName} · <Badge>{REVIEW_STATUS_LABELS[r.status]}</Badge>
                  {r.status === "open" ? ` · due ${r.dueLabel}` : ""}
                </span>
                {isOwner && r.status === "open" ? <ActionButton action={closeReviewRequest.bind(null, r.id, id)} variant="ghost" size="sm">Withdraw</ActionButton> : null}
              </li>
            ))}
          </ul>
          {openRequests.length === 0 ? null : <p className="text-caption text-text-secondary">Unanswered requests expire after 14 days.</p>}
        </section>
      ) : null}

      <section aria-labelledby="rev-h" className="flex flex-col gap-3">
        <h2 id="rev-h" className="text-h3">Faculty reviews</h2>
        {reviews.length === 0 ? (
          <EmptyState
            icon={<SealCheck aria-hidden className="size-8" />}
            title="Not reviewed by faculty yet"
            description="A review from a teacher adds a Reviewed by faculty badge to this project on your CV. The badge never shows a score."
          />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="venture-reviews">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
                <p className="flex flex-wrap items-center gap-2 text-body">
                  <Badge tone="verified">Reviewed by faculty</Badge>
                  <span className="font-semibold">{r.teacherName}</span>
                  <span className="text-body-sm text-text-secondary">{r.teacherLine} · {r.dateLabel}{r.formerFaculty ? " · former faculty" : ""}</span>
                </p>
                {r.rubric ? (
                  <>
                    <p className="text-body-sm text-text-secondary">Average {r.average?.toFixed(1)} of 5 (visible to your team only)</p>
                    <dl className="flex flex-col gap-2">
                      {REVIEW_RUBRIC.map((p) => (
                        <div key={p.key}>
                          <dt className="text-body-sm font-semibold">{p.label}: {r.rubric?.[p.key]?.score} of 5</dt>
                          <dd className="text-body-sm">{r.rubric?.[p.key]?.comment}</dd>
                        </div>
                      ))}
                    </dl>
                    {r.comments ? <p className="text-body whitespace-pre-line">{r.comments}</p> : null}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {thread && supervision?.status === "active" ? (
        <section aria-labelledby="thread-h" className="flex flex-col gap-3">
          <h2 id="thread-h" className="text-h3">Supervisor thread</h2>
          <SupervisorThreadView ventureId={id} thread={thread} canPost />
        </section>
      ) : null}
    </div>
  );
}
