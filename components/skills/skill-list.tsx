"use client";

import { ArrowSquareOut, CheckCircle, Circle, LockSimple } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Badge, Button, Dialog, LoadingState, SideSheetContent, SkillChip, SkillLevelIcon } from "@/components/ui";
import { loadSkillEvidence, type SkillEvidence } from "@/lib/actions/skills";
import type { ActionError } from "@/lib/actions/result";
import { cn } from "@/lib/cn";
import type { ProfileSkill } from "@/lib/data/skills";
import {
  CATEGORY_LABELS,
  CATEGORY_NAMES,
  CATEGORY_ORDER,
  DETECTOR_LABELS,
  EXCLUSION_LABELS,
  LEVELS,
  nextStep,
  type ShownLevel,
} from "@/lib/skills/levels";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Karachi" });
const when = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : null);

/**
 * Skill chips, grouped by category or as one row, each opening the skill drawer (PRD 5.5):
 * level, what it rests on, and for the owner the evidence and how to reach the next level.
 */
export function SkillList({
  skills,
  isOwner,
  ownerName,
  grouped = true,
}: {
  skills: ProfileSkill[];
  isOwner: boolean;
  ownerName: string;
  grouped?: boolean;
}) {
  const [open, setOpen] = useState<ProfileSkill | null>(null);
  // The drawer is opened from state, not a Radix trigger, so hand focus back to the chip ourselves.
  const opener = useRef<HTMLButtonElement | null>(null);
  const groups = grouped
    ? CATEGORY_ORDER.map((c) => ({ category: c, items: skills.filter((s) => s.category === c) })).filter((g) => g.items.length)
    : [{ category: null, items: skills }];

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.category ?? "all"} aria-labelledby={g.category ? `skills-${g.category}` : undefined}>
            {g.category ? (
              <h3 id={`skills-${g.category}`} className="mb-3 text-label text-text-secondary uppercase">
                {CATEGORY_LABELS[g.category]}
              </h3>
            ) : null}
            <ul className="flex flex-wrap gap-2">
              {g.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      opener.current = e.currentTarget;
                      setOpen(s);
                    }}
                    aria-label={`${s.name}, level ${s.level}: ${isOwner ? LEVELS[s.level].own : LEVELS[s.level].other}. Details`}
                    className="rounded-sm transition-colors duration-[120ms] hover:[&>span]:border-border-strong"
                  >
                    <SkillChip name={s.name} level={s.level} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open ? (
          <SkillDrawer
            skill={open}
            isOwner={isOwner}
            ownerName={ownerName}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              opener.current?.focus();
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function SkillDrawer({
  skill,
  isOwner,
  ownerName,
  onCloseAutoFocus,
}: {
  skill: ProfileSkill;
  isOwner: boolean;
  ownerName: string;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const meta = LEVELS[skill.level];
  const category = CATEGORY_NAMES[skill.category];
  const lastUsed = when(skill.lastUsedAt);
  const step = isOwner && skill.stats ? nextStep(skill.level, skill.category, skill.stats) : null;

  return (
    <SideSheetContent
      onCloseAutoFocus={onCloseAutoFocus}
      title={skill.name}
      description={`${category} · L${skill.level} ${meta.name}${lastUsed ? ` · last used ${lastUsed}` : ""}`}
    >
      <div className="flex flex-col gap-6">
        <LevelLadder level={skill.level} isOwner={isOwner} />

        {isOwner && skill.stats ? (
          <>
            <dl className="grid grid-cols-3 gap-3">
              <Stat label="Active days" value={skill.stats.activeDays} />
              {skill.category === "language" ? (
                <Stat label="Lines of code" value={skill.stats.lines} />
              ) : (
                <Stat label={skill.category === "framework" || skill.category === "library" ? "Imports" : "Uses"} value={skill.stats.hits} />
              )}
              <Stat label="Repositories" value={skill.stats.repos} />
            </dl>
            {step ? (
              <p className="rounded-md border border-border-default bg-bg-subtle px-4 py-3 text-body-sm text-text-primary">{step}</p>
            ) : null}
            <EvidenceList skillId={skill.id} />
          </>
        ) : (
          <p className="flex items-start gap-2 text-body-sm text-text-secondary">
            <LockSimple aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0" />
            The commits behind this level are private to {ownerName}. Skilient checked that each one is their own work.
          </p>
        )}
      </div>
    </SideSheetContent>
  );
}

function LevelLadder({ level, isOwner }: { level: ShownLevel; isOwner: boolean }) {
  return (
    <ol aria-label="Evidence levels" className="flex flex-col gap-2">
      {([1, 2, 3, 4] as const).map((l) => {
        const reached = l <= level;
        const current = l === level;
        return (
          <li
            key={l}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex gap-3 rounded-md border px-3 py-2.5",
              current ? "border-border-strong bg-bg-surface" : "border-border-muted",
              // Unreached levels read as "not yet" by shape and label, never by fading the text (contrast).
              !reached && "border-dashed",
            )}
          >
            <SkillLevelIcon level={l} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-body-sm font-semibold text-text-primary">
                <span className="font-mono">L{l}</span> {LEVELS[l].name}
                <span className="font-normal text-text-secondary">· {isOwner ? LEVELS[l].own : LEVELS[l].other}</span>
                {reached ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-caption text-text-secondary">
                    <CheckCircle aria-hidden weight="bold" className="size-3.5 text-success" />
                    {current ? "Current" : "Reached"}
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-1 text-caption text-text-secondary">
                    <Circle aria-hidden weight="bold" className="size-3.5" />
                    Not yet
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-body-sm text-text-secondary">{LEVELS[l].rule}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border-muted px-3 py-2">
      <dt className="text-caption text-text-secondary">{label}</dt>
      <dd className="font-mono text-h4 text-text-primary">{value.toLocaleString("en-GB")}</dd>
    </div>
  );
}

function EvidenceList({ skillId }: { skillId: string }) {
  const [state, setState] = useState<{ data: SkillEvidence | null; error: ActionError | null }>({ data: null, error: null });
  const [pending, startTransition] = useTransition();

  const load = () =>
    startTransition(async () => {
      const result = await loadSkillEvidence(skillId);
      setState(result.ok ? { data: result.data, error: null } : { data: null, error: result });
    });
  useEffect(load, [skillId]);

  return (
    <section aria-labelledby="evidence-heading">
      <h3 id="evidence-heading" className="text-h4">
        Evidence
      </h3>
      <div className="mt-3">
        {state.error ? (
          <div className="flex flex-col items-start gap-3">
            <FormAlert requestId={state.error.requestId}>{state.error.message}</FormAlert>
            <Button variant="secondary" size="sm" onClick={load} loading={pending}>
              Try again
            </Button>
          </div>
        ) : !state.data ? (
          <LoadingState label="Loading your evidence" lines={4} />
        ) : !state.data.items.length ? (
          <p className="text-body-sm text-text-secondary">
            Found in your repositories&apos; languages; none of your own commits touch it yet.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border-muted">
              {state.data.items.map((e) => (
                <EvidenceRow key={`${e.repo}:${e.sha}`} item={e} />
              ))}
            </ul>
            {state.data.total > state.data.items.length ? (
              <p className="mt-3 text-body-sm text-text-secondary">
                Showing your latest {state.data.items.length} of {state.data.total} commits.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function EvidenceRow({ item }: { item: SkillEvidence["items"][number] }) {
  const what = item.detectors
    .map((d) => (d === "lines" ? `${item.lines} ${item.lines === 1 ? "line" : "lines"} of code` : DETECTOR_LABELS[d] ?? d))
    .join(", ");
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
        <span className="text-text-secondary">{when(item.occurredAt)}</span>
        {item.repo ? <span className="font-mono text-code-sm break-all text-text-primary">{item.repo}</span> : null}
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-mono text-code-sm text-accent underline underline-offset-4"
          >
            {item.sha.slice(0, 7)}
            <ArrowSquareOut aria-hidden className="size-3.5" />
            <span className="sr-only">{" (opens GitHub)"}</span>
          </a>
        ) : null}
        {item.signed ? <Badge tone="neutral">Signed</Badge> : null}
        {item.status === "held" ? (
          <Badge tone="warning">Being reviewed</Badge>
        ) : null}
        {item.status === "excluded" ? <Badge tone="neutral">Not counted</Badge> : null}
      </div>
      <p className="text-body-sm text-text-primary">
        {what}
        {item.paths.length ? <span className="text-text-secondary"> · {item.paths.slice(0, 3).join(", ")}</span> : null}
      </p>
      {item.status === "excluded" && item.exclusion ? (
        <p className="text-caption text-text-secondary">{EXCLUSION_LABELS[item.exclusion] ?? item.exclusion}</p>
      ) : null}
    </li>
  );
}
