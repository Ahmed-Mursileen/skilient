"use client";

import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { SkillPicker, type SkillOption } from "@/components/ventures/skill-picker";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { createVenture } from "@/lib/actions/ventures";
import type { ActionError } from "@/lib/actions/result";
import { cn } from "@/lib/cn";
import { MAX_MEMBERS, STAGE_OPTIONS, TYPE_LABELS, VISIBILITY_OPTIONS } from "@/lib/ventures/labels";
import type { VentureStage, VentureType, VentureVisibility } from "@/lib/data/ventures";

interface RoleDraft {
  key: number;
  title: string;
  skillIds: string[];
  slots: number;
}

export function Choice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string; description?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-label text-text-secondary uppercase">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors duration-[120ms]",
            value === o.value ? "border-primary bg-primary-subtle" : "border-border-default hover:bg-bg-subtle",
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 size-4" />
          <span>
            <span className="block text-body font-semibold">{o.label}</span>
            {o.description ? <span className="block text-body-sm text-text-secondary">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** /ventures/new (screen spec 3.4): type, title, description, visibility, skills, team, roles, questions. */
export function VentureForm({ skills, defaultType }: { skills: SkillOption[]; defaultType: VentureType }) {
  const [type, setType] = useState<VentureType>(defaultType);
  const [visibility, setVisibility] = useState<VentureVisibility>("public");
  const [stage, setStage] = useState<VentureStage>("idea");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState(4);
  const [roles, setRoles] = useState<RoleDraft[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "");
    setError(null);
    startTransition(async () => {
      const result = await createVenture({
        type,
        title: text("title"),
        description: text("description"),
        visibility,
        stage: type === "startup" ? stage : null,
        pitchUrl: type === "startup" ? text("pitchUrl") : "",
        affiliation: type === "startup" ? text("affiliation") : "",
        skillIds,
        teamSize,
        roles: roles.map(({ title, skillIds: s, slots }) => ({ title, skillIds: s, slots })),
        questions: questions.filter((q) => q.trim()),
      });
      if (result && !result.ok) setError(result);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {error && Object.keys(fields).length ? <FormAlert>{error.message}</FormAlert> : null}

      <Choice
        legend="What are you starting?"
        name="type"
        value={type}
        onChange={setType}
        options={[
          { value: "project", label: TYPE_LABELS.project.one, description: "Build something with classmates: an app, a tool, research." },
          { value: "startup", label: TYPE_LABELS.startup.one, description: "A company in the making, from idea to revenue." },
        ]}
      />

      <Field id="title" label="Title" error={fields.title}>
        <Input id="title" name="title" required maxLength={80} aria-invalid={fields.title ? true : undefined} aria-describedby={fields.title ? "title-error" : undefined} />
      </Field>
      <Field id="description" label="What are you building?" error={fields.description} helper="The problem, what you'll make, and who it's for.">
        <Textarea
          id="description"
          name="description"
          rows={6}
          required
          maxLength={4000}
          aria-invalid={fields.description ? true : undefined}
          aria-describedby={fields.description ? "description-error" : "description-helper"}
        />
      </Field>

      {type === "startup" ? (
        <div className="flex flex-col gap-5 rounded-lg border border-border-default p-5">
          <Choice legend="Stage" name="stage" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
          <Field id="pitchUrl" label="Pitch deck link (optional)" error={fields.pitchUrl}>
            <Input id="pitchUrl" name="pitchUrl" type="url" inputMode="url" placeholder="https://" aria-invalid={fields.pitchUrl ? true : undefined} />
          </Field>
          <Field id="affiliation" label="Incubator or university programme (optional)">
            <Input id="affiliation" name="affiliation" maxLength={120} />
          </Field>
        </div>
      ) : null}

      <SkillPicker id="skills" label="Skills it needs" options={skills} value={skillIds} onChange={setSkillIds} max={10} />

      <Field id="teamSize" label="Team size you're aiming for" helper={`Including you. At most ${MAX_MEMBERS}.`}>
        <select
          id="teamSize"
          value={teamSize}
          onChange={(e) => setTeamSize(Number(e.target.value))}
          className="h-10 w-full rounded-md border border-border-default bg-bg-subtle px-3 text-body"
          aria-describedby="teamSize-helper"
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} people
            </option>
          ))}
        </select>
      </Field>

      <section aria-labelledby="roles-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="roles-heading" className="text-h4">
            Open roles
          </h2>
          <p className="text-body-sm text-text-secondary">Students apply to a role. A role closes when its places are filled.</p>
        </div>
        {roles.map((r, i) => (
          <div key={r.key} className="flex flex-col gap-4 rounded-lg border border-border-default p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field id={`role-${r.key}`} label={`Role ${i + 1}`}>
                  <Input
                    id={`role-${r.key}`}
                    value={r.title}
                    maxLength={60}
                    placeholder="e.g. Backend developer"
                    onChange={(e) => setRoles(roles.map((x) => (x.key === r.key ? { ...x, title: e.target.value } : x)))}
                  />
                </Field>
              </div>
              <div className="w-28">
                <Field id={`slots-${r.key}`} label="Places">
                  <select
                    id={`slots-${r.key}`}
                    value={r.slots}
                    onChange={(e) => setRoles(roles.map((x) => (x.key === r.key ? { ...x, slots: Number(e.target.value) } : x)))}
                    className="h-10 w-full rounded-md border border-border-default bg-bg-subtle px-3 text-body"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRoles(roles.filter((x) => x.key !== r.key))} aria-label={`Remove role ${i + 1}`}>
                <Trash aria-hidden weight="bold" className="size-4" />
              </Button>
            </div>
            <SkillPicker
              id={`role-skills-${r.key}`}
              label="Skills for this role"
              options={skills}
              value={r.skillIds}
              onChange={(ids) => setRoles(roles.map((x) => (x.key === r.key ? { ...x, skillIds: ids } : x)))}
              max={5}
            />
          </div>
        ))}
        {roles.length < 6 ? (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => setRoles([...roles, { key: Date.now(), title: "", skillIds: [], slots: 1 }])}
          >
            <Plus aria-hidden weight="bold" className="size-4" />
            Add a role
          </Button>
        ) : null}
      </section>

      <section aria-labelledby="questions-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="questions-heading" className="text-h4">
            Questions for applicants
          </h2>
          <p className="text-body-sm text-text-secondary">Up to 3. Everyone who applies answers them.</p>
        </div>
        {questions.map((q, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex-1">
              <Field id={`question-${i}`} label={`Question ${i + 1}`}>
                <Input
                  id={`question-${i}`}
                  value={q}
                  maxLength={200}
                  onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </Field>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setQuestions(questions.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
              <Trash aria-hidden weight="bold" className="size-4" />
            </Button>
          </div>
        ))}
        {questions.length < 3 ? (
          <Button type="button" variant="secondary" className="self-start" onClick={() => setQuestions([...questions, ""])}>
            <Plus aria-hidden weight="bold" className="size-4" />
            Add a question
          </Button>
        ) : null}
      </section>

      <Choice legend="Who can see it" name="visibility" value={visibility} onChange={setVisibility} options={VISIBILITY_OPTIONS} />

      <Button type="submit" size="lg" loading={pending} className="self-start">
        Create {TYPE_LABELS[type].one.toLowerCase()}
      </Button>
    </form>
  );
}
