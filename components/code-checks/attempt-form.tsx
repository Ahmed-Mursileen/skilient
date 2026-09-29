"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Textarea } from "@/components/ui";
import { saveCodeCheck } from "@/lib/actions/code-checks";
import { ANSWER_MAX, QUESTIONS, type AnswerKey } from "@/lib/code-checks/constants";

type Answers = Partial<Record<AnswerKey, string>>;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The three answers, saved as the student types and handed in with Submit. At zero the
 * answers are saved and submitted; the server allows 30 seconds of grace and refuses anything
 * later (PRD 5.5: 10 minutes, code visible).
 */
export function AttemptForm({ checkId, secondsLeft, initial }: { checkId: string; secondsLeft: number; initial: Answers }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [left, setLeft] = useState(secondsLeft);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The answers as last typed, for the debounced save and the time-up submit.
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function submit() {
    startTransition(async () => {
      setError(null);
      const result = await saveCodeCheck(checkId, latest.current, true);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  // Time's up: hand in what's there.
  const handedIn = useRef(false);
  useEffect(() => {
    if (left === 0 && !handedIn.current) {
      handedIn.current = true;
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit reads the latest answers from a ref
  }, [left]);

  function change(key: AnswerKey, value: string) {
    latest.current = { ...latest.current, [key]: value };
    setAnswers(latest.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaved("saving");
      const result = await saveCodeCheck(checkId, latest.current, false);
      setSaved(result.ok ? "saved" : "error");
    }, 1500);
  }

  const warn = left <= 60;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p role="timer" aria-live={warn ? "assertive" : "off"} className={warn ? "text-h4 text-text-error" : "text-h4"}>
        {left > 0 ? `${clock(left)} left` : "Time is up"}
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {QUESTIONS.map((q, i) => (
        <Field key={q.key} id={`answer-${q.key}`} label={`${i + 1}. ${q.label}`} helper={`${(answers[q.key] ?? "").length} of ${ANSWER_MAX.toLocaleString("en")} characters`}>
          <Textarea
            id={`answer-${q.key}`}
            rows={5}
            maxLength={ANSWER_MAX}
            value={answers[q.key] ?? ""}
            disabled={left <= 0 || pending}
            onChange={(e) => change(q.key, e.currentTarget.value)}
            aria-describedby={`answer-${q.key}-helper`}
          />
        </Field>
      ))}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={pending}>
          Submit answers
        </Button>
        <span className="text-body-sm text-text-secondary" aria-live="polite">
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : saved === "error" ? "Couldn't save; keep going, we'll try again" : ""}
        </span>
      </div>
    </form>
  );
}
