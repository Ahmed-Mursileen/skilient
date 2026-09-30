import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Badge, EmptyState, type BadgeTone } from "@/components/ui";
import { getMyFeedback } from "@/lib/data/feedback";
import { STATUS_LABELS, STATUS_STEPS, TYPE_LABELS, type FeedbackStatus } from "@/lib/feedback/constants";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Feedback" };

const TONE: Record<FeedbackStatus, BadgeTone> = { received: "neutral", reviewing: "info", planned: "accent", shipped: "success", wont_do: "neutral" };

/** The steps a submission has been through, as text as well as marks. */
function Timeline({ status }: { status: FeedbackStatus }) {
  if (status === "wont_do") return <p className="text-caption text-text-secondary">Closed without a change.</p>;
  const at = STATUS_STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-caption" aria-label="Progress">
      {STATUS_STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? "step" : undefined} className={cn(i <= at ? "font-semibold text-text-primary" : "text-text-muted")}>
          {i <= at ? "✓ " : ""}
          {STATUS_LABELS[s]}
        </li>
      ))}
    </ol>
  );
}

/** /feedback (PRD 5.27, screen spec 3.12): send feedback, then follow each submission from received to shipped. */
export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const mine = await getMyFeedback();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Feedback</h1>
        <p className="mt-1 text-body text-text-secondary">Something confusing or broken? Tell us. Every message is read by a person.</p>
      </div>
      <FeedbackForm from={from} />
      <section aria-labelledby="mine-h" className="flex flex-col gap-3">
        <h2 id="mine-h" className="text-h3">
          My feedback
        </h2>
        {mine.length === 0 ? (
          <EmptyState
            icon={<ChatCircleDots aria-hidden className="size-8" />}
            title="You haven't sent any feedback yet"
            description="When you do, it appears here with its status and any reply from us."
          />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="my-feedback">
            {mine.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[f.status]}>{STATUS_LABELS[f.status]}</Badge>
                  <span className="text-caption text-text-secondary">
                    {TYPE_LABELS[f.type]} · sent {f.sentLabel}
                    {f.hasScreenshot ? " · with a screenshot" : ""}
                  </span>
                </div>
                <p className="text-body whitespace-pre-line">{f.body}</p>
                <Timeline status={f.status} />
                {f.staffReply ? (
                  <div className="rounded-md bg-bg-subtle p-3">
                    <p className="text-caption font-semibold text-text-secondary">Reply from Skilient{f.repliedLabel ? `, ${f.repliedLabel}` : ""}</p>
                    <p className="mt-1 text-body-sm whitespace-pre-line">{f.staffReply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
