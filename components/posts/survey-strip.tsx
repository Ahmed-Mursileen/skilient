"use client";

import { Check, CheckCircle, X } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { ensureViewRecorded } from "@/components/posts/view-tracker";
import { answerSurvey } from "@/lib/actions/posts";
import type { PostSurvey } from "@/lib/data/posts";
import { cn } from "@/lib/cn";

/**
 * The micro-survey strip (PRD 5.28): one fixed question per reader per post, a tick and a
 * cross, no dismiss or skip. After answering it settles into the public line with an
 * "Answered" mark; the answer can change for 10 minutes.
 */
export function SurveyStrip({
  postId,
  survey,
  shownAt,
  qualified,
  publicLine,
}: {
  postId: string;
  survey: PostSurvey;
  shownAt: number | null;
  qualified: boolean;
  publicLine: React.ReactNode;
}) {
  const [answer, setAnswer] = useState<boolean | null>(survey.myAnswer);
  const [canChange, setCanChange] = useState(survey.canChange);
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (value: boolean) =>
    startTransition(async () => {
      setMessage(null);
      if (!qualified || shownAt === null) {
        setMessage("Take a moment to read the post first.");
        return;
      }
      await ensureViewRecorded(postId);
      const result = await answerSurvey(postId, value, performance.now() - shownAt);
      if (result.ok) {
        const first = answer === null;
        setAnswer(value);
        setChanging(false);
        if (first) setCanChange(true);
      } else {
        setMessage(result.message);
        if (result.code === "duplicate") setCanChange(false);
      }
    });

  if (answer !== null && !changing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-muted pt-2" data-testid="survey-answered">
        <div className="min-w-0 text-body-sm text-text-secondary">{publicLine}</div>
        <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
          <CheckCircle aria-hidden weight="bold" className="size-4 text-success" />
          Answered
          {canChange ? (
            <button type="button" className="min-h-6 underline underline-offset-4 hover:text-text-primary" onClick={() => setChanging(true)}>
              Change
            </button>
          ) : null}
        </span>
        {message ? (
          <p role="alert" className="w-full text-caption text-text-error">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border-default bg-bg-subtle px-3 py-1.5" data-testid="survey-strip">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm font-semibold" id={`survey-${postId}`}>
          {survey.question}
        </p>
        <div className="flex shrink-0 gap-1" role="group" aria-labelledby={`survey-${postId}`}>
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-label={v ? "Yes" : "No"}
              aria-pressed={changing ? answer === v : undefined}
              disabled={pending}
              onClick={() => send(v)}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-md border text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60",
                changing && answer === v ? "border-primary bg-primary-subtle" : "border-border-default bg-bg-surface hover:border-border-strong",
              )}
            >
              {v ? <Check aria-hidden weight="bold" className="size-5" /> : <X aria-hidden weight="bold" className="size-5" />}
            </button>
          ))}
        </div>
      </div>
      {message ? (
        <p role="alert" className="text-caption text-text-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
