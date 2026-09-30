"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Textarea } from "@/components/ui";
import { teacherEndorse } from "@/lib/actions/teach";
import type { TeacherEndorseOptions } from "@/lib/data/teach";

/** A teacher endorses members of a venture they reviewed or supervised, for skills tagged in it (PRD 5.21). */
export function TeacherEndorseForm({ ventureId, options }: { ventureId: string; options: TeacherEndorseOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = options.teammates.find((x) => x.userId === open);

  if (!options.allowed) {
    return <p className="text-body-sm text-text-secondary">You can endorse members once you have reviewed or supervised this venture, while it is in progress or complete.</p>;
  }

  function submit() {
    if (!t) return;
    const items = Object.entries(picked).map(([skillId, evidenceId]) => ({ skillId, evidenceId }));
    if (!items.length) {
      setError("Choose at least one skill.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await teacherEndorse({ ventureId, endorseeId: t.userId, items, note });
      if (result.ok) {
        setDone(`Endorsed ${t.name} for ${result.data.count} skill${result.data.count === 1 ? "" : "s"}.`);
        setOpen(null);
        setPicked({});
        setNote("");
        router.refresh();
      } else setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-text-secondary" data-testid="endorse-left">
        Teacher endorsements count for more than a teammate&apos;s. You have {options.monthLeft} left this month.
      </p>
      {done ? <FormAlert tone="success">{done}</FormAlert> : null}
      <ul className="flex flex-col gap-2">
        {options.teammates.map((m) => (
          <li key={m.userId} className="rounded-lg border border-border-default bg-bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body font-semibold">{m.name}</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setOpen(open === m.userId ? null : m.userId); setPicked({}); setError(null); setDone(null); }} aria-expanded={open === m.userId}>
                {open === m.userId ? "Close" : "Endorse"}
              </Button>
            </div>
            {open === m.userId ? (
              <div className="mt-3 flex flex-col gap-3">
                {error ? <FormAlert>{error}</FormAlert> : null}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-body-sm font-semibold">Skills tagged in this venture</legend>
                  {m.skills.length === 0 ? <p className="text-body-sm text-text-secondary">This venture has no skill tags.</p> : null}
                  {m.skills.map((s) => {
                    const already = m.given.includes(s.id);
                    const checked = s.id in picked;
                    const evidence = m.evidence.filter((e) => e.skills.includes(s.id));
                    return (
                      <div key={s.id} className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-body-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            disabled={already}
                            checked={checked}
                            onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[s.id] = null; else delete n[s.id]; return n; })}
                          />
                          {s.name}
                          {already ? <span className="text-text-muted">(already endorsed)</span> : null}
                        </label>
                        {checked && evidence.length ? (
                          <label className="ml-6 flex flex-col gap-1 text-caption text-text-secondary">
                            Tie it to one of their entries (this is what makes it count toward L4)
                            <select
                              className="h-9 rounded-md border border-border-default bg-bg-subtle px-2 text-body-sm"
                              value={picked[s.id] ?? ""}
                              onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.value || null }))}
                            >
                              <option value="">No evidence</option>
                              {evidence.map((e) => <option key={e.id} value={e.id}>{e.description.slice(0, 70)}</option>)}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                </fieldset>
                <label htmlFor={`note-${m.userId}`} className="text-body-sm font-semibold">Note (optional)</label>
                <Textarea id={`note-${m.userId}`} rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
                <Button type="button" loading={pending} onClick={submit} className="self-start">Give the endorsement</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
