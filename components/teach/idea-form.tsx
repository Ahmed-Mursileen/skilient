"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { SkillPicker, type SkillOption } from "@/components/ventures/skill-picker";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { saveIdea } from "@/lib/actions/teach";
import type { ActionError } from "@/lib/actions/result";
import { cn } from "@/lib/cn";
import { AUDIENCES, AUDIENCE_LABELS, DIFFICULTIES, DIFFICULTY_LABELS, type Audience, type Difficulty } from "@/lib/teach/constants";

export interface IdeaDraft {
  id: string | null;
  title: string;
  brief: string;
  skills: string[];
  difficulty: Difficulty;
  teamSize: number;
  durationWeeks: number;
  deliverables: string;
  maxTeams: number;
  deadline: string;
  courseLabel: string;
  audience: Audience;
  /** A team has started from it: only the limits, deadline, label and audience can change. */
  locked: boolean;
}

export const EMPTY_IDEA: IdeaDraft = {
  id: null,
  title: "",
  brief: "",
  skills: [],
  difficulty: "intermediate",
  teamSize: 4,
  durationWeeks: 8,
  deliverables: "",
  maxTeams: 3,
  deadline: "",
  courseLabel: "",
  audience: "university",
  locked: false,
};

/** Post or edit a project idea (PRD 5.21 "Project ideas"). */
export function IdeaForm({ skills, draft = EMPTY_IDEA }: { skills: SkillOption[]; draft?: IdeaDraft }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(draft.skills);
  const [error, setError] = useState<ActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};
  const num = (form: FormData, k: string) => Number(form.get(k));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "");
    setError(null);
    setSaved(false);
    startTransition(async () => {
      // Disabled controls are not in the form data: a locked idea keeps its stored values.
      const locked = draft.locked;
      const result = await saveIdea(draft.id, {
        title: locked ? draft.title : text("title"),
        brief: locked ? draft.brief : text("brief"),
        skills: picked,
        difficulty: locked ? draft.difficulty : (text("difficulty") as Difficulty),
        teamSize: locked ? draft.teamSize : num(form, "teamSize"),
        durationWeeks: locked ? draft.durationWeeks : num(form, "durationWeeks"),
        deliverables: locked ? draft.deliverables : text("deliverables"),
        maxTeams: num(form, "maxTeams"),
        deadline: text("deadline"),
        courseLabel: text("courseLabel"),
        audience: text("audience") as Audience,
      });
      if (!result.ok) {
        setError(result);
        return;
      }
      if (draft.id) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/teach/ideas/${result.data.id}`);
      }
    });
  }

  const err = (k: string) => (fields[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` } : {});
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {error && Object.keys(fields).length ? <FormAlert>{error.message}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Saved.</FormAlert> : null}
      {draft.locked ? (
        <p className="rounded-md border border-border-default bg-bg-subtle px-4 py-3 text-body-sm">
          A team has started from this idea, so its title, brief, skills and size are fixed. You can still change the team limit, deadline, label and audience.
        </p>
      ) : null}
      <Field id="title" label="Title" error={fields.title}>
        <Input id="title" name="title" required maxLength={100} defaultValue={draft.title} disabled={draft.locked} {...err("title")} />
      </Field>
      <Field id="brief" label="Brief" error={fields.brief} helper="The problem, what teams should build and what good looks like. Up to 2,000 characters.">
        <Textarea id="brief" name="brief" rows={7} required maxLength={2000} defaultValue={draft.brief} disabled={draft.locked} {...err("brief")} />
      </Field>
      {draft.locked ? (
        <div className="flex flex-wrap gap-2 text-body-sm">{picked.map((s) => <span key={s} className="rounded-full border border-border-default px-2 py-0.5">{skills.find((o) => o.id === s)?.name ?? s}</span>)}</div>
      ) : (
        <div>
          <SkillPicker id="skills" label="Skills teams will use" options={skills} value={picked} onChange={setPicked} max={10} />
          {fields.skills ? <p role="alert" className="mt-1 text-body-sm text-text-error">{fields.skills}</p> : null}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="difficulty" className="text-label text-text-secondary uppercase">Difficulty</label>
          <select id="difficulty" name="difficulty" defaultValue={draft.difficulty} disabled={draft.locked} className={cn(controlBase, "h-10")}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
          </select>
        </div>
        <Field id="teamSize" label="Team size" error={fields.teamSize}>
          <Input id="teamSize" name="teamSize" type="number" min={2} max={6} required defaultValue={draft.teamSize} disabled={draft.locked} {...err("teamSize")} />
        </Field>
        <Field id="durationWeeks" label="Duration (weeks)" error={fields.durationWeeks}>
          <Input id="durationWeeks" name="durationWeeks" type="number" min={1} max={52} required defaultValue={draft.durationWeeks} disabled={draft.locked} {...err("durationWeeks")} />
        </Field>
      </div>
      <Field id="deliverables" label="Deliverables" error={fields.deliverables} helper="What each team hands in.">
        <Textarea id="deliverables" name="deliverables" rows={2} required maxLength={500} defaultValue={draft.deliverables} disabled={draft.locked} {...err("deliverables")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="maxTeams" label="Most teams" error={fields.maxTeams} helper="The idea closes when this many teams have started.">
          <Input id="maxTeams" name="maxTeams" type="number" min={1} max={50} required defaultValue={draft.maxTeams} {...err("maxTeams")} />
        </Field>
        <Field id="deadline" label="Deadline (optional)" error={fields.deadline} helper="The idea closes at the end of this day, Pakistan time.">
          <Input id="deadline" name="deadline" type="date" defaultValue={draft.deadline} {...err("deadline")} />
        </Field>
        <Field id="courseLabel" label="Course label (optional)" error={fields.courseLabel} helper="A label only, for example CS-301. Skilient does not connect to your LMS.">
          <Input id="courseLabel" name="courseLabel" maxLength={60} defaultValue={draft.courseLabel} {...err("courseLabel")} />
        </Field>
        <div className="flex flex-col gap-1">
          <label htmlFor="audience" className="text-label text-text-secondary uppercase">Who can see it</label>
          <select id="audience" name="audience" defaultValue={draft.audience} className={cn(controlBase, "h-10")}>
            {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
          </select>
        </div>
      </div>
      <Button type="submit" loading={pending} className="self-start">
        {draft.id ? "Save changes" : "Post the idea"}
      </Button>
    </form>
  );
}
