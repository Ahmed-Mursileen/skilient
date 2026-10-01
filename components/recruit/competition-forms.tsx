"use client";

import { showUpgrade } from "@/components/billing/upgrade-sheet";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/teach/action-button";
import { Button, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { finishCompetition, saveCompetition, scoreTeam, submitCompetition, type CompetitionInput } from "@/lib/actions/recruit";
import type { ActionError } from "@/lib/actions/result";
import type { CompetitionManage } from "@/lib/data/recruit";
import { COMPETITION_TEMPLATES, TIER_LABELS, TIERS } from "@/lib/recruit/constants";

type SkillOption = { id: string; name: string };
type Existing = CompetitionManage["competition"];

const dateOf = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }) : "");

/** A skill competition brief (PRD 5.20): 7 to 21 days, teams of 1 to 3, a required prize and a rubric. */
export function CompetitionForm({ existing, skills, universities }: { existing: Existing | null; skills: SkillOption[]; universities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [reqs, setReqs] = useState(existing?.skills ?? []);
  const [pick, setPick] = useState("");
  const [rubric, setRubric] = useState(existing?.rubric ?? [{ criterion: "Correctness", weight: 60 }, { criterion: "Design and code quality", weight: 40 }]);
  const [tier, setTier] = useState<string>(existing?.min_tier ?? "none");
  const [uni, setUni] = useState<string>(existing?.eligible_universities?.[0] ?? "all");
  const [brief, setBrief] = useState(existing?.brief ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};
  const names = new Map(skills.map((s) => [s.id, s.name]));
  const editable = !existing || existing.status === "draft" || existing.status === "rejected";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setError(null);
    startTransition(async () => {
      const input: CompetitionInput = {
        title: get("title"),
        role: get("role"),
        skills: reqs,
        brief,
        briefTemplate: "",
        startsOn: get("startsOn"),
        endsOn: get("endsOn"),
        teamSize: Number(get("teamSize")) || 1,
        universities: uni === "all" ? [] : [uni],
        minTier: tier === "none" ? "" : (tier as (typeof TIERS)[number]),
        prize: get("prize"),
        rubric,
      };
      const r = await saveCompetition(existing?.id ?? null, input);
      if (!r.ok) return showUpgrade(r) ? undefined : setError(r);
      if (existing) router.refresh();
      else router.push(`/recruit/competitions/${r.data}` as Route);
    });
  }
  const bind = (id: string) => ({ "aria-invalid": fields[id] ? (true as const) : undefined, "aria-describedby": fields[id] ? `${id}-error` : undefined });
  const total = rubric.reduce((n, r) => n + (Number.isFinite(r.weight) ? r.weight : 0), 0);
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="competition-form">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="title" label="Title" error={fields.title}>
          <Input id="title" name="title" maxLength={100} defaultValue={existing?.title} disabled={!editable} {...bind("title")} />
        </Field>
        <Field id="role" label="Role this hires for" error={fields.role}>
          <Input id="role" name="role" maxLength={80} defaultValue={existing?.role} disabled={!editable} {...bind("role")} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-text-secondary uppercase">Skills tested</legend>
        <ul className="flex flex-wrap gap-2">
          {reqs.map((r) => (
            <li key={r.skill}>
              <button type="button" disabled={!editable} onClick={() => setReqs(reqs.filter((x) => x.skill !== r.skill))} className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-default bg-bg-surface px-2 text-body-sm" aria-label={`Remove ${names.get(r.skill) ?? r.skill}`}>
                {names.get(r.skill) ?? r.skill} ×
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select value={pick} onValueChange={setPick} disabled={!editable}>
            <SelectTrigger aria-label="Skill"><SelectValue placeholder="Add a skill" /></SelectTrigger>
            <SelectContent>
              {skills.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="secondary" disabled={!editable || !pick} onClick={() => { if (pick && !reqs.some((r) => r.skill === pick)) setReqs([...reqs, { skill: pick, min_level: 1 }]); setPick(""); }}>Add</Button>
        </div>
        {fields.skills ? <p role="alert" className="text-body-sm text-text-error">{fields.skills}</p> : null}
      </fieldset>
      <Field id="brief" label="Brief" error={fields.brief} helper={`${brief.trim().length} of 100 to 6,000 characters. An admin reviews every brief; briefs that ask teams to build your product for free are rejected.`}>
        <Textarea id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={8} maxLength={6000} disabled={!editable} {...bind("brief")} />
      </Field>
      {editable ? (
        <div className="flex flex-wrap gap-2" aria-label="Brief templates">
          {COMPETITION_TEMPLATES.map((t) => (
            <Button key={t.key} type="button" variant="ghost" size="sm" onClick={() => setBrief(t.brief)}>Use the “{t.label}” template</Button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="startsOn" label="Starts" error={fields.startsOn}>
          <Input id="startsOn" name="startsOn" type="date" defaultValue={dateOf(existing?.starts_at)} disabled={!editable} {...bind("startsOn")} />
        </Field>
        <Field id="endsOn" label="Deadline" error={fields.endsOn} helper="7 to 21 days after the start.">
          <Input id="endsOn" name="endsOn" type="date" defaultValue={dateOf(existing?.ends_at)} disabled={!editable} {...bind("endsOn")} />
        </Field>
        <Field id="teamSize" label="Team size (1 to 3)" error={fields.teamSize}>
          <Input id="teamSize" name="teamSize" type="number" min={1} max={3} defaultValue={existing?.team_size ?? 2} disabled={!editable} {...bind("teamSize")} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label id="cu-label" className="block text-label text-text-secondary uppercase">Open to</label>
          <Select value={uni} onValueChange={setUni} disabled={!editable}>
            <SelectTrigger aria-labelledby="cu-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every university</SelectItem>
              {universities.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <label id="ct-label" className="block text-label text-text-secondary uppercase">Minimum tier</label>
          <Select value={tier} onValueChange={setTier} disabled={!editable}>
            <SelectTrigger aria-labelledby="ct-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No minimum</SelectItem>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Field id="prize" label="Prize (required)" error={fields.prize}>
        <Input id="prize" name="prize" maxLength={300} defaultValue={existing?.prize} disabled={!editable} {...bind("prize")} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-text-secondary uppercase">Rubric (weights add up to 100; now {total})</legend>
        {rubric.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
            <Input aria-label={`Criterion ${i + 1}`} value={r.criterion} disabled={!editable} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))} maxLength={80} />
            <Input aria-label={`Weight ${i + 1}`} type="number" min={1} max={100} value={r.weight} disabled={!editable} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} />
            <Button type="button" variant="ghost" size="sm" disabled={!editable || rubric.length <= 2} onClick={() => setRubric(rubric.filter((_, j) => j !== i))} aria-label={`Remove criterion ${i + 1}`}>×</Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" disabled={!editable || rubric.length >= 6} onClick={() => setRubric([...rubric, { criterion: "", weight: 10 }])} className="self-start">Add criterion</Button>
        {fields.rubric ? <p role="alert" className="text-body-sm text-text-error">{fields.rubric}</p> : null}
      </fieldset>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending} data-testid="competition-save">Save draft</Button>
          {existing ? <ActionButton action={() => submitCompetition(existing.id)} variant="accent" testId="competition-submit">Send for review</ActionButton> : null}
        </div>
      ) : null}
    </form>
  );
}

export function ScoreForm({ competitionId, teamId, rubric, current }: { competitionId: string; teamId: string; rubric: { criterion: string; weight: number }[]; current: Record<string, number> | null }) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, string>>(Object.fromEntries(rubric.map((r) => [r.criterion, current ? String(current[r.criterion] ?? "") : ""])));
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await scoreTeam(competitionId, teamId, Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Number(v)])), feedback);
          if (r.ok) router.refresh();
          else setError(r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {rubric.map((r) => (
          <Field key={r.criterion} id={`s-${teamId}-${r.criterion}`} label={`${r.criterion} (${r.weight}%), 0 to 10`}>
            <Input id={`s-${teamId}-${r.criterion}`} type="number" min={0} max={10} step="0.5" value={scores[r.criterion] ?? ""} onChange={(e) => setScores({ ...scores, [r.criterion]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Field id={`fb-${teamId}`} label="Feedback for the team (optional)">
        <Textarea id={`fb-${teamId}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} maxLength={2000} />
      </Field>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">Save scores</Button>
    </form>
  );
}

export function FinishButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => finishCompetition(id)} variant="accent" testId="competition-finish">
      Finish and award results
    </ActionButton>
  );
}
