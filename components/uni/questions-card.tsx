"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { answerQuestion, dismissQuestions } from "@/lib/actions/uni";

/**
 * Your university's optional questions (PRD 5.23): multiple choice, counted only in groups of 5+,
 * never shown to recruiters. Answer, change or skip; dismissing hides the card.
 */
export function QuestionsCard({ university, questions }: { university: string; questions: { id: string; prompt: string; options: string[]; answer: number | null }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message ?? "That didn't work.");
      else router.refresh();
    });
  return (
    <section aria-labelledby="uq-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="uni-questions">
      <h2 id="uq-h" className="text-h4">{university} asks (optional)</h2>
      <p className="text-body-sm text-text-secondary">Your university sees only totals of 5 or more. Recruiters never see your answers.</p>
      {questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="text-body font-semibold">{q.prompt}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o, i) => (
              <Button key={o} type="button" size="sm" variant={q.answer === i ? "primary" : "secondary"} aria-pressed={q.answer === i} disabled={pending}
                onClick={() => run(() => answerQuestion({ questionId: q.id, option: q.answer === i ? null : i }))}>
                {o}
              </Button>
            ))}
          </div>
        </fieldset>
      ))}
      {error ? <FieldError>{error}</FieldError> : null}
      <div><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(dismissQuestions)}>Hide this</Button></div>
    </section>
  );
}
