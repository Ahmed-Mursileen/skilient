"use client";

import { CheckCircle, SealCheck } from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Avatar, Button, Dialog, DialogTrigger, Field, SheetContent, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { endorse } from "@/lib/actions/endorsements";
import type { ActionError } from "@/lib/actions/result";
import { cn } from "@/lib/cn";
import type { EndorseOptions, EndorseTeammate } from "@/lib/data/endorsements";

const PER_TEAMMATE = 5;
const NOTE_MAX = 280;

/**
 * "Endorse teammates" (PRD 5.16, screen spec): a stepper over the team, one teammate at a
 * time. Up to 5 skills each from the venture's tags or their own skills, each optionally tied
 * to one of their entries in this venture, and one short note. Already endorsed skills show
 * as done; the SQL function re-checks every limit.
 */
export function EndorseSheet({
  ventureId,
  options,
  defaultOpen = false,
}: {
  ventureId: string;
  options: EndorseOptions;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(defaultOpen);
  const [step, setStep] = useState(0);
  const [monthLeft, setMonthLeft] = useState(options.monthLeft);
  const [done, setDone] = useState<Record<string, string[]>>({});
  const teammates = options.teammates;
  const current = teammates[step];
  const finished = step >= teammates.length;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setStep(0);
      // Drop ?endorse=1 so a refresh doesn't reopen the sheet.
      if (defaultOpen) router.replace(pathname as never, { scroll: false });
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <SealCheck aria-hidden className="size-4" weight="bold" />
          Endorse teammates
        </Button>
      </DialogTrigger>
      <SheetContent
        title="Endorse teammates"
        description="Vouch for the skills you saw them use on this venture. Endorsements show on their profile and can't be edited."
      >
        {!teammates.length ? (
          <p className="text-body text-text-secondary">Nobody else on this team can be endorsed right now.</p>
        ) : finished ? (
          <div className="flex flex-col items-start gap-4">
            <p className="flex items-center gap-2 text-body">
              <CheckCircle aria-hidden weight="fill" className="size-5 text-verified" />
              That&apos;s everyone on the team.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(0)}>
                Start again
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <TeammateStep
            key={current.userId}
            ventureId={ventureId}
            teammate={current}
            given={[...current.given, ...(done[current.userId] ?? [])]}
            position={step + 1}
            total={teammates.length}
            monthLeft={monthLeft}
            onBack={step > 0 ? () => setStep(step - 1) : undefined}
            onNext={(endorsed) => {
              if (endorsed.length) {
                setDone((d) => ({ ...d, [current.userId]: [...(d[current.userId] ?? []), ...endorsed] }));
                setMonthLeft((m) => Math.max(0, m - endorsed.length));
              }
              setStep(step + 1);
            }}
          />
        )}
      </SheetContent>
    </Dialog>
  );
}

function TeammateStep({
  ventureId,
  teammate,
  given,
  position,
  total,
  monthLeft,
  onBack,
  onNext,
}: {
  ventureId: string;
  teammate: EndorseTeammate;
  given: string[];
  position: number;
  total: number;
  monthLeft: number;
  onBack?: () => void;
  onNext: (endorsed: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const firstName = teammate.name.split(/\s+/)[0] ?? teammate.name;
  const room = Math.min(PER_TEAMMATE - given.length, monthLeft);
  const idBase = `endorse-${teammate.userId.slice(0, 8)}`;

  function toggle(skillId: string, on: boolean) {
    setError(null);
    setPicked((p) => (on ? [...p, skillId] : p.filter((s) => s !== skillId)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked.length) {
      onNext([]);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await endorse({
        ventureId,
        endorseeId: teammate.userId,
        items: picked.map((skillId) => ({ skillId, evidenceId: evidence[skillId] || null })),
        note: note.trim() || undefined,
      });
      if (result.ok) onNext(picked);
      else setError(result);
    });
  }

  const skillName = (id: string) => teammate.skills.find((s) => s.id === id)?.name ?? id;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-labelledby={`${idBase}-name`}>
      <div className="flex items-center gap-3">
        <Avatar name={teammate.name} src={teammate.avatarUrl} size="md" />
        <div className="min-w-0">
          <p id={`${idBase}-name`} className="truncate text-body font-semibold">
            {teammate.name}
          </p>
          <p className="text-body-sm text-text-secondary">
            Teammate {position} of {total}
          </p>
        </div>
      </div>
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}

      {teammate.skills.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label text-text-secondary uppercase">Skills you saw {firstName} use</legend>
          <p className="mb-1 text-body-sm text-text-secondary">
            {room > 0
              ? `Choose up to ${room}. ${monthLeft} endorsement${monthLeft === 1 ? "" : "s"} left this month.`
              : given.length >= PER_TEAMMATE
                ? `You've endorsed ${firstName} for ${PER_TEAMMATE} skills on this venture, the most allowed.`
                : "You've used this month's 20 endorsements. More open next month."}
          </p>
          <ul className="flex flex-col gap-2">
            {teammate.skills.map((s) => {
              const already = given.includes(s.id);
              const checked = already || picked.includes(s.id);
              const disabled = already || pending || (!checked && picked.length >= room);
              return (
                <li key={s.id}>
                  <label className={cn("flex items-center gap-3 text-body", disabled && !already && "text-text-muted")}>
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => toggle(s.id, e.currentTarget.checked)}
                    />
                    <span>{s.name}</span>
                    {already ? (
                      <span className="inline-flex items-center gap-1 text-body-sm text-text-secondary">
                        <SealCheck aria-hidden weight="fill" className="size-4 text-verified" />
                        Endorsed
                      </span>
                    ) : s.fromVenture ? null : (
                      <span className="text-body-sm text-text-muted">from their work</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : (
        <p className="text-body text-text-secondary">
          This venture has no skill tags and {firstName}&apos;s skills aren&apos;t visible to you, so there&apos;s nothing to endorse.
        </p>
      )}

      {picked.length && teammate.evidence.length ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-label text-text-secondary uppercase">Which work shows it? (optional)</legend>
          <p className="text-body-sm text-text-secondary">
            Tying an endorsement to one of {firstName}&apos;s entries makes it stronger evidence.
          </p>
          {picked.map((skillId) => (
            <div key={skillId} className="flex flex-col gap-1.5">
              <label htmlFor={`${idBase}-ev-${skillId}`} className="text-body-sm font-semibold">
                {skillName(skillId)}
              </label>
              <select
                id={`${idBase}-ev-${skillId}`}
                value={evidence[skillId] ?? ""}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setEvidence((ev) => ({ ...ev, [skillId]: value }));
                }}
                className={cn(controlBase, "h-10")}
              >
                <option value="">No specific entry</option>
                {teammate.evidence.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.description.length > 70 ? `${e.description.slice(0, 69)}…` : e.description}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>
      ) : null}

      {picked.length ? (
        <Field id={`${idBase}-note`} label="Note (optional)" helper={`${note.length} of ${NOTE_MAX} characters`}>
          <Textarea
            id={`${idBase}-note`}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            aria-describedby={`${idBase}-note-helper`}
          />
        </Field>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
            Back
          </Button>
        ) : null}
        <Button type="submit" loading={pending} variant={picked.length ? "primary" : "secondary"}>
          {picked.length ? `Endorse ${firstName}` : position < total ? "Skip" : "Finish"}
        </Button>
      </div>
    </form>
  );
}
