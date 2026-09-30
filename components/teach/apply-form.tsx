"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Input } from "@/components/ui";
import { requestTeacherRole } from "@/lib/actions/teach";
import type { ActionError } from "@/lib/actions/result";

/** Faculty ask for the teacher role (PRD 5.21 "Verification"): department and title. */
export function ApplyForm({ defaultDepartment = "", defaultTitle = "", update = false }: { defaultDepartment?: string; defaultTitle?: string; update?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await requestTeacherRole({ department: String(form.get("department") ?? ""), title: String(form.get("title") ?? "") });
      if (result.ok) router.refresh();
      else setError(result);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-lg border border-border-default bg-bg-surface p-5">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="department" label="Department" error={fields.department}>
        <Input id="department" name="department" required maxLength={80} defaultValue={defaultDepartment} aria-invalid={fields.department ? true : undefined} aria-describedby={fields.department ? "department-error" : undefined} />
      </Field>
      <Field id="title" label="Title" error={fields.title} helper="For example Lecturer, Assistant Professor or Lab Engineer.">
        <Input id="title" name="title" required maxLength={80} defaultValue={defaultTitle} aria-invalid={fields.title ? true : undefined} aria-describedby={fields.title ? "title-error" : "title-helper"} />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {update ? "Update my request" : "Ask for the teacher role"}
      </Button>
    </form>
  );
}
