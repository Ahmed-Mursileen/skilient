"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { BatchSelect } from "@/components/profile/batch-select";
import { DepartmentSelect } from "@/components/profile/department-select";
import { ImageUpload } from "@/components/profile/image-upload";
import { LookingForFields } from "@/components/profile/looking-for-fields";
import { UsernameField } from "@/components/profile/username-field";
import { VisibilityFields } from "@/components/profile/visibility-fields";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { updateProfile } from "@/lib/actions/profile";
import type { ActionError } from "@/lib/actions/result";
import type { LookingFor, Visibility } from "@/lib/profile/options";

interface Values {
  fullName: string;
  username: string | null;
  bio: string | null;
  department: string | null;
  programme: string | null;
  graduationYear: number | null;
  campus: string | null;
  visibility: Visibility;
  recruiterVisible: boolean;
  lookingFor: LookingFor[];
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border-default bg-bg-surface p-5 sm:p-6" aria-label={title}>
      <h2 className="text-h3">{title}</h2>
      {description ? <p className="mt-1 text-body-sm text-text-secondary">{description}</p> : null}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function ProfileSettingsForm({
  values,
  universityName,
  avatarUrl,
  coverUrl,
  departments,
}: {
  values: Values;
  universityName: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  departments?: string[];
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile(form);
      if (result.ok) {
        setDirty(false);
        setSaved(true);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Photos" description="Your photo shows next to your name everywhere. Images are re-processed and location data is removed.">
        <ImageUpload kind="avatar" name={values.fullName} currentUrl={avatarUrl} />
        <ImageUpload kind="cover" name={values.fullName} currentUrl={coverUrl} />
      </Section>

      <form
        onSubmit={onSubmit}
        onChange={() => {
          setDirty(true);
          setSaved(false);
        }}
        noValidate
        className="flex flex-col gap-6"
      >
        <Section title="Basics">
          <Field id="fullName" label="Full name" error={fields.fullName}>
            <Input
              id="fullName"
              name="fullName"
              required
              maxLength={60}
              defaultValue={values.fullName}
              aria-invalid={fields.fullName ? true : undefined}
              aria-describedby={fields.fullName ? "fullName-error" : undefined}
            />
          </Field>
          <UsernameField defaultValue={values.username} error={fields.username} />
          <Field id="bio" label="Intro" helper="Up to 280 characters." error={fields.bio}>
            <Textarea id="bio" name="bio" rows={3} maxLength={280} defaultValue={values.bio ?? ""} aria-describedby="bio-helper" />
          </Field>
        </Section>

        <Section title="Studies" description={universityName ? `At ${universityName}. Your university comes from your university email.` : undefined}>
          <DepartmentSelect defaultValue={values.department} error={fields.department} options={departments} />
          <Field id="programme" label="Programme" error={fields.programme}>
            <Input id="programme" name="programme" maxLength={80} defaultValue={values.programme ?? ""} />
          </Field>
          <BatchSelect defaultValue={values.graduationYear} error={fields.graduationYear} />
          <Field id="campus" label="Campus (optional)" error={fields.campus}>
            <Input id="campus" name="campus" maxLength={60} defaultValue={values.campus ?? ""} />
          </Field>
        </Section>

        <Section title="Privacy">
          <VisibilityFields defaultValue={values.visibility} />
        </Section>

        <Section title="Opportunities">
          <LookingForFields defaultValues={values.lookingFor} defaultRecruiterVisible={values.recruiterVisible} />
        </Section>

        <div className="sticky bottom-0 -mx-[var(--page-gutter)] flex flex-wrap items-center justify-end gap-3 border-t border-border-default bg-bg-page/95 px-[var(--page-gutter)] py-3 backdrop-blur-sm">
          <div className="mr-auto min-w-0" aria-live="polite">
            {error && !error.fields ? (
              <FormAlert requestId={error.requestId}>{error.message}</FormAlert>
            ) : error ? (
              <p className="text-body-sm text-text-error">Check the highlighted fields.</p>
            ) : saved ? (
              <p className="text-body-sm text-text-secondary">Saved.</p>
            ) : dirty ? (
              <p className="text-body-sm text-text-secondary">Unsaved changes</p>
            ) : null}
          </div>
          <Button type="submit" loading={pending} disabled={!dirty && !error}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
