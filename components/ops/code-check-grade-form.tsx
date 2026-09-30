"use client";

import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Input, Textarea } from "@/components/ui";
import { gradeCodeCheck } from "@/lib/actions/ops/trust";
import type { ActionResult } from "@/lib/actions/result";
import { RUBRIC, type RubricKey } from "@/lib/code-checks/constants";

type Part = { pass: boolean | null; comment: string };
type Rubric = Record<RubricKey, { pass: boolean; comment: string }>;

/** The 4-part rubric (PRD 5.21), each met or not with an optional comment; 3 of 4 passes. */
export function CodeCheckGradeForm({
  id,
  grade = gradeCodeCheck,
}: {
  id: string;
  /** Who grades: Skilient reviewers by default, a teacher through their own action. */
  grade?: (id: string, rubric: Rubric, feedback: string) => Promise<ActionResult<unknown>>;
}) {
  const [parts, setParts] = useState<Record<RubricKey, Part>>({
    behaviour: { pass: null, comment: "" },
    design: { pass: null, comment: "" },
    change: { pass: null, comment: "" },
    accuracy: { pass: null, comment: "" },
  });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const met = RUBRIC.filter((r) => parts[r.key].pass).length;
  const set = (key: RubricKey, patch: Partial<Part>) => setParts((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (RUBRIC.some((r) => parts[r.key].pass === null)) {
          setError("Mark each part met or not met.");
          return;
        }
        startTransition(async () => {
          setError(null);
          const rubric = Object.fromEntries(RUBRIC.map((r) => [r.key, { pass: parts[r.key].pass === true, comment: parts[r.key].comment }])) as Rubric;
          const result = await grade(id, rubric, feedback);
          if (!result.ok) setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {RUBRIC.map((r) => (
        <fieldset key={r.key} className="flex flex-col gap-2">
          <legend className="text-body-sm font-semibold">{r.label}</legend>
          <p className="text-caption text-text-secondary">{r.hint}</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-body-sm">
              <input type="radio" name={`part-${r.key}`} checked={parts[r.key].pass === true} onChange={() => set(r.key, { pass: true })} className="size-4" />
              Met
            </label>
            <label className="flex items-center gap-2 text-body-sm">
              <input type="radio" name={`part-${r.key}`} checked={parts[r.key].pass === false} onChange={() => set(r.key, { pass: false })} className="size-4" />
              Not met
            </label>
          </div>
          <Input aria-label={`${r.label}: comment (optional)`} maxLength={500} value={parts[r.key].comment} onChange={(e) => set(r.key, { comment: e.currentTarget.value })} />
        </fieldset>
      ))}
      <p className="text-body-sm" aria-live="polite">
        {met} of 4 met: {met >= 3 ? "passes" : "doesn't pass"}.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={`feedback-${id}`} className="text-body-sm font-semibold">
          Feedback to the student
        </label>
        <Textarea id={`feedback-${id}`} rows={4} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.currentTarget.value)} required />
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Save grade
      </Button>
    </form>
  );
}
