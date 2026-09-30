"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { SkillPicker, type SkillOption } from "@/components/ventures/skill-picker";
import { Button, Field, Input } from "@/components/ui";
import { saveTeacherSettings } from "@/lib/actions/teach";
import type { TeacherSettings } from "@/lib/data/teach";

/** Code-check grading opt-in, weekly cap and skills, and the weekly digest (PRD 5.21). */
export function TeacherSettingsForm({ settings, skills }: { settings: TeacherSettings; skills: SkillOption[] }) {
  const router = useRouter();
  const [optIn, setOptIn] = useState(settings.gradingOptIn);
  const [digest, setDigest] = useState(settings.digest);
  const [picked, setPicked] = useState(settings.skills.map((s) => s.id));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cap = Number(new FormData(event.currentTarget).get("cap"));
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveTeacherSettings({ optIn, cap, skills: picked, digest });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else setError(result.message);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Saved.</FormAlert> : null}
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-4">
        <legend className="px-1 text-h4">Grade code checks</legend>
        <label className="flex items-start gap-3 text-body">
          <input type="checkbox" className="mt-1 size-4" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          <span>
            I&apos;ll grade code checks for students at my university
            <span className="block text-body-sm text-text-secondary">Checks wait for teachers for 48 hours, then move to Skilient reviewers. You never grade students in ventures you supervise.</span>
          </span>
        </label>
        <Field id="cap" label="Most I'll grade each week" helper="Counted Monday to Sunday, Pakistan time.">
          <Input id="cap" name="cap" type="number" min={1} max={50} defaultValue={settings.weeklyCap} required />
        </Field>
        <SkillPicker id="grade-skills" label="Skills I'll grade" options={skills} value={picked} onChange={setPicked} max={30} />
      </fieldset>
      <label className="flex items-start gap-3 text-body">
        <input type="checkbox" className="mt-1 size-4" checked={digest} onChange={(e) => setDigest(e.target.checked)} />
        <span>
          Send me one email a week
          <span className="block text-body-sm text-text-secondary">A Monday summary of what is waiting for you. There are no per-event emails.</span>
        </span>
      </label>
      <Button type="submit" loading={pending} className="self-start">Save settings</Button>
    </form>
  );
}
