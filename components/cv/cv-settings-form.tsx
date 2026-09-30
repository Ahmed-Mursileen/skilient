"use client";

import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useId, useState, useTransition } from "react";
import { Button, Checkbox, FieldError, Switch } from "@/components/ui";
import { saveCvSettings } from "@/lib/actions/cv";
import { SECTION_HEADINGS } from "@/lib/cv/document";
import { CV_SECTIONS, type CvSection } from "@/lib/cv/types";

type Visibility = "private" | "link" | "recruiters";

const VISIBILITY: { value: Visibility; label: string; hint: string }[] = [
  { value: "private", label: "Only me", hint: "Share links are paused." },
  { value: "link", label: "Anyone with a share link", hint: "Links you make open your newest version." },
  { value: "recruiters", label: "Share links and recruiters on Skilient", hint: "Recruiters come to Skilient later this year." },
];

/**
 * Sections on or off and in order, the header lines, and who can open the web CV (PRD 5.18).
 * Changes apply to the next version: the 1st of next month on Free (decisions.md 2026-10-01).
 */
export function CvSettingsForm({
  initial,
  applyLabel,
}: {
  initial: { sections: CvSection[]; showPercentile: boolean; showEmail: boolean; visibility: Visibility };
  applyLabel: string;
}) {
  const id = useId();
  const [order, setOrder] = useState<CvSection[]>([...initial.sections, ...CV_SECTIONS.filter((s) => !initial.sections.includes(s))]);
  const [on, setOn] = useState<Set<CvSection>>(new Set(initial.sections));
  const [showPercentile, setShowPercentile] = useState(initial.showPercentile);
  const [showEmail, setShowEmail] = useState(initial.showEmail);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function move(i: number, by: -1 | 1) {
    setOrder((o) => {
      const next = [...o];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await saveCvSettings({ sections: order.filter((s) => on.has(s)), showPercentile, showEmail, visibility });
          if (result.ok) setMessage(`Saved. Your CV changes on ${applyLabel}.`);
          else setError(result.message);
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-h4">Sections and order</legend>
        <ol className="flex flex-col gap-1">
          {order.map((s, i) => (
            <li key={s} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-bg-subtle">
              <Checkbox
                id={`${id}-${s}`}
                checked={on.has(s)}
                onCheckedChange={(v) =>
                  setOn((prev) => {
                    const next = new Set(prev);
                    if (v === true) next.add(s);
                    else next.delete(s);
                    return next;
                  })
                }
              />
              <label htmlFor={`${id}-${s}`} className="flex-1 text-body">
                {SECTION_HEADINGS[s]}
              </label>
              <button
                type="button"
                className="rounded-sm p-1 text-text-secondary hover:bg-bg-muted disabled:opacity-40"
                aria-label={`Move ${SECTION_HEADINGS[s]} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp aria-hidden size={16} />
              </button>
              <button
                type="button"
                className="rounded-sm p-1 text-text-secondary hover:bg-bg-muted disabled:opacity-40"
                aria-label={`Move ${SECTION_HEADINGS[s]} down`}
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown aria-hidden size={16} />
              </button>
            </li>
          ))}
        </ol>
      </fieldset>

      <div className="flex items-start justify-between gap-4">
        <label htmlFor={`${id}-pct`} className="text-body">
          Show my percentile (top N%)
          <span className="block text-body-sm text-text-secondary">Your tier always shows. The percentile shows only within the top half.</span>
        </label>
        <Switch id={`${id}-pct`} checked={showPercentile} onCheckedChange={setShowPercentile} />
      </div>
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={`${id}-email`} className="text-body">
          Show my university email
          <span className="block text-body-sm text-text-secondary">Otherwise the CV says to contact you through Skilient.</span>
        </label>
        <Switch id={`${id}-email`} checked={showEmail} onCheckedChange={setShowEmail} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-h4">Who can open your web CV</legend>
        {VISIBILITY.map((v) => (
          <label key={v.value} className="flex items-start gap-3 text-body">
            <input
              type="radio"
              name={`${id}-visibility`}
              value={v.value}
              checked={visibility === v.value}
              onChange={() => setVisibility(v.value)}
              className="mt-1 size-4"
            />
            <span>
              {v.label}
              <span className="block text-body-sm text-text-secondary">{v.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button type="submit" loading={pending} disabled={on.size === 0}>
          Save CV settings
        </Button>
        <p role="status" className="text-body-sm text-text-secondary">
          {message ?? ""}
        </p>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </form>
  );
}
