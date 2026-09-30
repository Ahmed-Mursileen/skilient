import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedbackClaimButton, FeedbackRespondForm } from "@/components/ops/feedback-forms";
import { getFeedbackCase } from "@/lib/data/feedback";
import { staffRoles } from "@/lib/data/ops-trust";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/feedback/constants";

export const metadata: Metadata = { title: "Feedback" };

/** One feedback item for staff: what was said, where and on what device, the screenshot, and the reply. */
export default async function OpsFeedbackCasePage({ params }: PageProps<"/ops/feedback/[id]">) {
  const { id } = await params;
  if ((await staffRoles()).size === 0) notFound();
  const f = await getFeedbackCase(id);
  if (!f) notFound();
  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-caption font-semibold text-text-secondary uppercase">
            {TYPE_LABELS[f.type]} · {STATUS_LABELS[f.status]} · waiting {f.age}
          </p>
          <h1 className="font-display text-h1">Feedback</h1>
        </div>
        <p className="rounded-lg border border-border-default bg-bg-surface p-4 text-body whitespace-pre-line">{f.body}</p>
        {f.screenshotUrl ? (
          // A short-lived signed link to the private bucket; a plain img, since it is not a site asset.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.screenshotUrl} alt="The student's screenshot" className="max-h-[480px] w-auto max-w-full rounded-lg border border-border-default" />
        ) : null}
        <dl className="grid gap-4 rounded-lg border border-border-default bg-bg-surface p-4 sm:grid-cols-2">
          <div>
            <dt className="text-label text-text-secondary uppercase">Student</dt>
            <dd className="mt-1 text-body">
              {f.student ?? "Deleted account"}
              {f.username ? <span className="text-text-secondary"> (@{f.username})</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-label text-text-secondary uppercase">Page</dt>
            <dd className="mt-1 text-body break-all">{f.page ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-label text-text-secondary uppercase">Device</dt>
            <dd className="mt-1 text-body-sm break-words">{f.device ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-label text-text-secondary uppercase">App version</dt>
            <dd className="mt-1 font-mono text-code-sm">{f.appVersion ?? "Unknown"}</dd>
          </div>
        </dl>
        {f.staffReply ? (
          <div className="rounded-md bg-bg-subtle p-3">
            <p className="text-caption font-semibold text-text-secondary">Current reply</p>
            <p className="mt-1 text-body-sm whitespace-pre-line">{f.staffReply}</p>
          </div>
        ) : null}
      </div>
      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-border-default bg-bg-surface p-4">
          <p className="mb-2 text-body-sm text-text-secondary">
            {f.claimedBy ? (f.claimedByMe ? "You are handling this." : `${f.claimedBy} is handling this.`) : "Nobody has claimed this."}
          </p>
          {!f.claimedBy || f.claimedByMe ? <FeedbackClaimButton id={f.id} claimed={f.claimedByMe} /> : null}
        </div>
        {f.claimedByMe ? (
          <div className="rounded-lg border border-border-default bg-bg-surface p-4">
            <FeedbackRespondForm id={f.id} status={f.status} reply={f.staffReply} />
          </div>
        ) : null}
      </aside>
    </main>
  );
}
