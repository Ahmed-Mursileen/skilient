"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Textarea } from "@/components/ui";
import { resolveCase, type CaseAction, type Severity } from "@/lib/actions/ops/moderation";

type Target = "post" | "comment" | "message" | "profile" | "venture";

const ACTIONS: { value: CaseAction; label: string; hint: string; targets: Target[] }[] = [
  { value: "dismiss", label: "Dismiss", hint: "Nothing breaks the guidelines. A held post goes back to the feed.", targets: ["post", "comment", "message", "profile", "venture"] },
  { value: "remove", label: "Remove content", hint: "Hidden from everyone, the owner included; images are deleted. The owner is told why.", targets: ["post", "comment", "message"] },
  { value: "clear_profile", label: "Clear bio and photo", hint: "The profile stays; its bio and photo are removed. The owner is told why.", targets: ["profile"] },
  { value: "unlist", label: "Unlist the venture", hint: "It leaves browse and search; members keep access. The owner is told why.", targets: ["venture"] },
  { value: "warn", label: "Warn the owner", hint: "The content stays. The owner gets a warning with your reason.", targets: ["post", "comment", "message", "profile", "venture"] },
];

const SEVERITIES: { value: Severity; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Minus 50 ranking points for 12 months." },
  { value: "medium", label: "Medium", hint: "Minus 150 ranking points for 12 months." },
  { value: "high", label: "High", hint: "Minus 300 ranking points for 12 months." },
];

/**
 * The decisions a moderator can take on this kind of target, always with a reason
 * (PRD 5.26, decisions.md 2026-09-30). Anything but a dismissal also takes a severity, which
 * costs the owner ranking points (PRD 5.13 penalties). Suspend and ban come in phase 11.
 */
export function ResolveForm({ caseId, targetType }: { caseId: string; targetType: Target }) {
  const id = useId();
  const [action, setAction] = useState<CaseAction | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!action) {
          setError("Choose an action.");
          return;
        }
        if ((action === "remove" || action === "warn") && !severity) {
          setError("Choose a severity.");
          return;
        }
        startTransition(async () => {
          setError(null);
          const result = await resolveCase(caseId, action, reason, action === "dismiss" ? null : severity);
          if (!result.ok) setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-semibold">Action</legend>
        {ACTIONS.filter((a) => a.targets.includes(targetType)).map((a) => (
          <label key={a.value} className="flex items-start gap-2 text-body-sm">
            <input type="radio" name={`${id}-action`} value={a.value} checked={action === a.value} onChange={() => setAction(a.value)} className="mt-1 size-4" />
            <span>
              <span className="font-semibold">{a.label}</span>
              <span className="block text-caption text-text-secondary">{a.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {action && action !== "dismiss" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-semibold">
            {action === "clear_profile" || action === "unlist" ? "Also warn the owner (optional)" : "Severity"}
          </legend>
          {SEVERITIES.map((s) => (
            <label key={s.value} className="flex items-start gap-2 text-body-sm">
              <input type="radio" name={`${id}-severity`} value={s.value} checked={severity === s.value} onChange={() => setSeverity(s.value)} className="mt-1 size-4" />
              <span>
                <span className="font-semibold">{s.label}</span>
                <span className="block text-caption text-text-secondary">{s.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-reason`} className="text-body-sm font-semibold">
          Reason
        </label>
        <p id={`${id}-hint`} className="text-caption text-text-secondary">
          Recorded in the audit log. For anything but a dismissal, the owner sees it too.
        </p>
        <Textarea id={`${id}-reason`} aria-describedby={`${id}-hint`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} required minLength={3} />
      </div>
      <Button type="submit" loading={pending}>
        Confirm decision
      </Button>
    </form>
  );
}
