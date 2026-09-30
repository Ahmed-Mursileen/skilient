"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Input, Textarea } from "@/components/ui";
import { submitReview } from "@/lib/actions/teach";
import { REVIEW_RUBRIC, SCORE_LABELS, type ReviewKey } from "@/lib/teach/constants";

/** Rubric v1 (PRD 5.21): five parts, each scored 1 to 5 with a comment. */
export function ReviewForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [scores, setScores] = useState<Partial<Record<ReviewKey, number>>>({});
  const [comments, setComments] = useState<Record<ReviewKey, string>>({ scope: "", technical: "", collaboration: "", documentation: "", outcome: "" });
  const [overall, setOverall] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (REVIEW_RUBRIC.some((r) => !scores[r.key])) {
      setError("Score every part from 1 to 5.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const rubric = Object.fromEntries(REVIEW_RUBRIC.map((r) => [r.key, { score: scores[r.key] as number, comment: comments[r.key] }]));
      const result = await submitReview({ request: requestId, rubric, comments: overall });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  const set = (key: ReviewKey, patch: { score?: number; comment?: string }) => {
    if (patch.score !== undefined) setScores((s) => ({ ...s, [key]: patch.score }));
    if (patch.comment !== undefined) setComments((c) => ({ ...c, [key]: patch.comment as string }));
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {REVIEW_RUBRIC.map((r) => (
        <fieldset key={r.key} className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
          <legend className="px-1 text-h4">{r.label}</legend>
          <p className="text-body-sm text-text-secondary">{r.hint}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${r.label} score`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="inline-flex h-10 min-w-16 cursor-pointer items-center justify-center rounded-md border border-border-default px-3 text-body-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring"
              >
                <input type="radio" name={`score-${r.key}`} value={n} checked={scores[r.key] === n} onChange={() => set(r.key, { score: n })} className="sr-only" />
                {n} · {SCORE_LABELS[n]}
              </label>
            ))}
          </div>
          <label htmlFor={`comment-${r.key}`} className="text-body-sm font-semibold">Comment</label>
          <Input id={`comment-${r.key}`} maxLength={500} value={comments[r.key]} onChange={(e) => set(r.key, { comment: e.currentTarget.value })} required />
        </fieldset>
      ))}
      <div className="flex flex-col gap-1">
        <label htmlFor="overall" className="text-body-sm font-semibold">Overall comment (optional)</label>
        <Textarea id="overall" rows={4} maxLength={2000} value={overall} onChange={(e) => setOverall(e.currentTarget.value)} />
      </div>
      <p className="text-body-sm text-text-secondary">
        The team sees your scores and comments. Everyone else sees only that faculty reviewed the venture. The CV shows a &ldquo;Reviewed by faculty&rdquo; badge and never a score.
      </p>
      <Button type="submit" loading={pending} className="self-start">Submit the review</Button>
    </form>
  );
}
