"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/teach/action-button";
import { Button, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { answerHireOutcome, closeJob, publishJob, saveJob, type JobInput } from "@/lib/actions/recruit";
import type { ActionError } from "@/lib/actions/result";
import type { JobDoc } from "@/lib/data/recruit";
import { DESCRIPTION_LIMITS, JOB_TYPE_LABELS, JOB_TYPES, OUTCOME_ANSWERS, TIER_LABELS, TIERS, type JobType } from "@/lib/recruit/constants";

type SkillOption = { id: string; name: string };

/** The job editor (PRD 5.20): the pay range is required, and a post needs a free job slot to go live. */
export function JobForm({ job, skills }: { job: JobDoc | null; skills: SkillOption[] }) {
  const router = useRouter();
  const [type, setType] = useState<string>(job?.type ?? "");
  const [currency, setCurrency] = useState<string>(job?.currency ?? "PKR");
  const [period, setPeriod] = useState<string>(job?.pay_period ?? "month");
  const [tier, setTier] = useState<string>(job?.min_tier ?? "none");
  const [remote, setRemote] = useState(job?.remote ?? false);
  const [reqs, setReqs] = useState(job?.min_skill_levels ?? []);
  const [pick, setPick] = useState("");
  const [pickLevel, setPickLevel] = useState("2");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};
  const names = new Map(skills.map((s) => [s.id, s.name]));
  const locked = job?.status === "closed";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const num = (k: string) => (get(k) === "" ? (undefined as unknown as number) : Number(get(k)));
    setError(null);
    startTransition(async () => {
      const input: JobInput = {
        title: get("title"),
        type: type as JobType,
        location: get("location"),
        remote,
        salaryMin: num("salaryMin"),
        salaryMax: num("salaryMax"),
        currency: currency as "PKR" | "USD",
        payPeriod: period as "month" | "year",
        minTier: tier === "none" ? "" : (tier as (typeof TIERS)[number]),
        skills: reqs,
        openings: num("openings") || 1,
        deadline: get("deadline"),
        description: get("description"),
      };
      const r = await saveJob(job?.id ?? null, input);
      if (!r.ok) return setError(r);
      if (job) router.refresh();
      else router.push(`/recruit/jobs/${r.data}` as Route);
    });
  }

  const bind = (id: string) => ({ "aria-invalid": fields[id] ? (true as const) : undefined, "aria-describedby": fields[id] ? `${id}-error` : undefined });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="job-form">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="title" label="Title" error={fields.title}>
        <Input id="title" name="title" required maxLength={100} defaultValue={job?.title} disabled={locked} {...bind("title")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label id="type-label" className="block text-label text-text-secondary uppercase">Type</label>
          <Select value={type} onValueChange={setType} disabled={locked}>
            <SelectTrigger aria-labelledby="type-label" data-testid="job-type" aria-invalid={fields.type ? true : undefined}>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {JOB_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {JOB_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fields.type ? <p role="alert" className="text-body-sm text-text-error">{fields.type}</p> : null}
        </div>
        <Field id="openings" label="Openings" error={fields.openings}>
          <Input id="openings" name="openings" type="number" min={1} max={100} defaultValue={job?.openings ?? 1} disabled={locked} {...bind("openings")} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="location" label="Location" error={fields.location}>
          <Input id="location" name="location" maxLength={80} defaultValue={job?.location ?? ""} disabled={locked} {...bind("location")} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-body">
          <input type="checkbox" className="size-4" checked={remote} onChange={(e) => setRemote(e.target.checked)} disabled={locked} />
          Remote role
        </label>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-border-default p-4">
        <legend className="px-1 text-label text-text-secondary uppercase">Pay (required)</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="salaryMin" label="From" error={fields.salaryMin}>
            <Input id="salaryMin" name="salaryMin" type="number" min={1} defaultValue={job?.salary_min} disabled={locked} {...bind("salaryMin")} />
          </Field>
          <Field id="salaryMax" label="To" error={fields.salaryMax}>
            <Input id="salaryMax" name="salaryMax" type="number" min={1} defaultValue={job?.salary_max} disabled={locked} {...bind("salaryMax")} />
          </Field>
          <div className="flex flex-col gap-2">
            <label id="cur-label" className="block text-label text-text-secondary uppercase">Currency</label>
            <Select value={currency} onValueChange={setCurrency} disabled={locked}>
              <SelectTrigger aria-labelledby="cur-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PKR">PKR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label id="per-label" className="block text-label text-text-secondary uppercase">Per</label>
            <Select value={period} onValueChange={setPeriod} disabled={locked}>
              <SelectTrigger aria-labelledby="per-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-body-sm text-text-muted">Internships need a stipend. Students see this range on the job.</p>
      </fieldset>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-border-default p-4">
        <legend className="px-1 text-label text-text-secondary uppercase">Requirements (optional)</legend>
        <div className="flex flex-col gap-2">
          <label id="tier-label" className="block text-label text-text-secondary uppercase">Minimum tier</label>
          <Select value={tier} onValueChange={setTier} disabled={locked}>
            <SelectTrigger aria-labelledby="tier-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No minimum</SelectItem>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul className="flex flex-wrap gap-2">
          {reqs.map((r) => (
            <li key={r.skill}>
              <button type="button" disabled={locked} onClick={() => setReqs(reqs.filter((x) => x.skill !== r.skill))} className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-default bg-bg-surface px-2 text-body-sm" aria-label={`Remove ${names.get(r.skill) ?? r.skill}`}>
                {names.get(r.skill) ?? r.skill} <span className="font-mono text-code-sm">L{r.min_level}+</span> ×
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
          <Select value={pick} onValueChange={setPick} disabled={locked}>
            <SelectTrigger aria-label="Required skill"><SelectValue placeholder="Add a required skill" /></SelectTrigger>
            <SelectContent>
              {skills.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pickLevel} onValueChange={setPickLevel} disabled={locked}>
            <SelectTrigger aria-label="Minimum level"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((l) => (
                <SelectItem key={l} value={String(l)}>L{l}+</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="secondary" disabled={locked || !pick} onClick={() => { if (pick && !reqs.some((r) => r.skill === pick)) setReqs([...reqs, { skill: pick, min_level: Number(pickLevel) }]); setPick(""); }}>Add</Button>
        </div>
      </fieldset>
      <Field id="deadline" label="Apply by" error={fields.deadline}>
        <Input id="deadline" name="deadline" type="date" defaultValue={job?.deadline} disabled={locked} {...bind("deadline")} />
      </Field>
      <Field id="description" label="Description" error={fields.description} helper={`${DESCRIPTION_LIMITS.min} to ${DESCRIPTION_LIMITS.max} characters.`}>
        <Textarea id="description" name="description" rows={8} maxLength={DESCRIPTION_LIMITS.max} defaultValue={job?.description} disabled={locked} {...bind("description")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {!locked ? <Button type="submit" loading={pending} data-testid="job-save">{job ? "Save changes" : "Save draft"}</Button> : null}
        {job?.status === "draft" ? <ActionButton action={() => publishJob(job.id)} variant="accent" testId="job-publish">Publish</ActionButton> : null}
        {job && job.status !== "closed" ? <ActionButton action={() => closeJob(job.id)} variant="danger">Close job</ActionButton> : null}
      </div>
    </form>
  );
}

export function OutcomeButtons({ hireId }: { hireId: string }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="outcome-buttons">
      {OUTCOME_ANSWERS.map((a) => (
        <ActionButton key={a.value} action={() => answerHireOutcome(hireId, a.value)} size="sm">
          {a.label}
        </ActionButton>
      ))}
    </div>
  );
}
