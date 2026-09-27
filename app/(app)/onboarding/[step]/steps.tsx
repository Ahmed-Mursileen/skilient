"use client";

import { Buildings, GithubLogo, ShieldCheck, Sparkle, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { StepForm } from "@/components/onboarding/step-form";
import { BatchSelect } from "@/components/profile/batch-select";
import { DepartmentSelect } from "@/components/profile/department-select";
import { ImageUpload } from "@/components/profile/image-upload";
import { LookingForFields } from "@/components/profile/looking-for-fields";
import { UsernameField } from "@/components/profile/username-field";
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  FieldError,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import {
  finishOnboarding,
  saveGithubStep,
  saveLookingForStep,
  saveProfileStep,
  saveSkillsStep,
  saveUniversityStep,
} from "@/lib/actions/onboarding";
import type { ActionError } from "@/lib/actions/result";
import type { UniversityRef } from "@/lib/auth/email-domain";
import type { LookingFor } from "@/lib/profile/options";

// Step 1 ------------------------------------------------------------------------------

export function UniversityStep(props: {
  university: UniversityRef | null;
  choices: UniversityRef[];
  department: string | null;
  programme: string | null;
  graduationYear: number | null;
  campus: string | null;
}) {
  return (
    <StepForm action={saveUniversityStep}>
      {(errors) => (
        <>
          {props.university && props.choices.length <= 1 ? (
            <p className="flex items-start gap-2 rounded-md border border-border-default bg-bg-subtle px-3 py-2.5 text-body">
              <Buildings aria-hidden weight="bold" className="mt-1 size-4 shrink-0 text-text-muted" />
              <span>
                <span className="block text-body-sm text-text-secondary">University</span>
                <strong className="font-semibold">{props.university.name}</strong>
              </span>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Label id="university-label">University</Label>
              <Select name="universityId" defaultValue={props.university?.id}>
                <SelectTrigger aria-labelledby="university-label" aria-invalid={errors.universityId ? true : undefined}>
                  <SelectValue placeholder="Choose your university" />
                </SelectTrigger>
                <SelectContent>
                  {props.choices.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.universityId ? <FieldError>{errors.universityId}</FieldError> : null}
            </div>
          )}
          <DepartmentSelect defaultValue={props.department} error={errors.department} />
          <Field id="programme" label="Programme" helper="For example BS Computer Science or BBA." error={errors.programme}>
            <Input id="programme" name="programme" maxLength={80} defaultValue={props.programme ?? ""} aria-describedby="programme-helper" />
          </Field>
          <BatchSelect defaultValue={props.graduationYear} error={errors.graduationYear} />
          <Field id="campus" label="Campus (optional)" helper="If your university has more than one." error={errors.campus}>
            <Input id="campus" name="campus" maxLength={60} defaultValue={props.campus ?? ""} aria-describedby="campus-helper" />
          </Field>
        </>
      )}
    </StepForm>
  );
}

// Step 2 ------------------------------------------------------------------------------

export function ProfileStep(props: { fullName: string; username: string | null; bio: string | null; avatarUrl: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-label text-text-secondary uppercase">Photo (optional)</span>
        <ImageUpload kind="avatar" name={props.fullName} currentUrl={props.avatarUrl} />
      </div>
      <StepForm action={saveProfileStep}>
        {(errors) => (
          <>
            <UsernameField defaultValue={props.username} error={errors.username} />
            <Field id="bio" label="One-line intro (optional)" helper="What you build, study or want to work on." error={errors.bio}>
              <Textarea
                id="bio"
                name="bio"
                rows={2}
                maxLength={280}
                defaultValue={props.bio ?? ""}
                placeholder="Final-year CS student building a campus ride-share app"
                aria-describedby="bio-helper"
              />
            </Field>
          </>
        )}
      </StepForm>
    </div>
  );
}

// Step 3 ------------------------------------------------------------------------------

export function GithubStep() {
  return (
    <StepForm action={saveGithubStep} submitLabel="Skip for now">
      {() => (
        <div className="flex flex-col gap-5 text-body">
          <div className="flex items-start gap-3">
            <GithubLogo aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-text-muted" />
            <p>
              Skilient reads the repositories you choose through the Skilient GitHub App: the languages, frameworks and
              tools your own commits use, and your merged pull requests. That&apos;s how your skills get verified levels.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-text-muted" />
            <p>
              We never write to your repositories, never read ones you didn&apos;t choose, and never show your code to
              anyone. You can disconnect at any time.
            </p>
          </div>
          <p className="rounded-md border border-border-default bg-bg-subtle px-3 py-2.5 text-body-sm text-text-secondary">
            Connecting takes a minute. If you skip it now, &ldquo;Connect GitHub&rdquo; stays on your getting-started
            checklist.
          </p>
        </div>
      )}
    </StepForm>
  );
}

// Step 4 ------------------------------------------------------------------------------

export function SkillsStep() {
  return (
    <StepForm action={saveSkillsStep}>
      {() => (
        <div className="flex flex-col gap-5">
          <p className="text-body text-text-secondary">
            Every skill on Skilient comes with proof. Skills found in your code get a level; teammates and teachers can
            raise it by confirming your work. Skills you add yourself show as &ldquo;claimed&rdquo; and earn no points until
            they&apos;re verified. Anything below the first level stays private to you.
          </p>
          <EmptyState
            icon={<Sparkle aria-hidden className="size-8" />}
            title="No skills detected yet"
            description="Connect GitHub and your verified skills appear here with their level and how to improve them."
          />
        </div>
      )}
    </StepForm>
  );
}

// Step 5 ------------------------------------------------------------------------------

export function LookingForStep(props: { lookingFor: LookingFor[]; recruiterVisible: boolean }) {
  return (
    <StepForm action={saveLookingForStep}>
      {() => <LookingForFields defaultValues={props.lookingFor} defaultRecruiterVisible={props.recruiterVisible} />}
    </StepForm>
  );
}

// Step 6 ------------------------------------------------------------------------------

export interface ClassmateCard {
  username: string;
  fullName: string;
  department: string | null;
  graduationYear: number | null;
  avatarUrl: string | null;
}

export function PeopleStep({ classmates, universityName }: { classmates: ClassmateCard[]; universityName: string | null }) {
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="classmates">
        <h2 id="classmates" className="text-h4">
          Classmates on Skilient
        </h2>
        {classmates.length ? (
          <ul className="mt-3 divide-y divide-border-muted rounded-lg border border-border-default">
            {classmates.map((c) => (
              <li key={c.username} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={c.fullName} src={c.avatarUrl} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-body font-semibold">{c.fullName}</span>
                  <span className="block text-body-sm text-text-secondary">
                    {[c.department, c.graduationYear ? `Class of ${c.graduationYear}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-3"
            icon={<UsersThree aria-hidden className="size-8" />}
            title="You're early"
            description="Nobody from your department and batch has joined yet. Invite them: the more of you here, the better your feed."
          />
        )}
      </section>
      <section aria-labelledby="ventures">
        <h2 id="ventures" className="text-h4">
          Open ventures{universityName ? ` at ${universityName}` : ""}
        </h2>
        <p className="mt-2 text-body-sm text-text-secondary">
          No open ventures yet. Ventures are projects you build with others, and finished ones count most toward your rank.
        </p>
      </section>
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Button
        size="lg"
        className="sm:self-end"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await finishOnboarding();
            if (result && !result.ok) setError(result);
          })
        }
      >
        Finish
      </Button>
    </div>
  );
}
