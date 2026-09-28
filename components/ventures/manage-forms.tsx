"use client";

import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Choice } from "@/components/ventures/venture-form";
import { SkillPicker, type SkillOption } from "@/components/ventures/skill-picker";
import { Button, Field, Input, Textarea } from "@/components/ui";
import {
  deleteVentureRole,
  inviteToVenture,
  linkVentureRepo,
  saveVentureRole,
  setVentureQuestions,
  updateVenture,
} from "@/lib/actions/ventures";
import type { ActionError, ActionResult } from "@/lib/actions/result";
import type { VentureDetail, VentureRole, VentureStage, VentureVisibility } from "@/lib/data/ventures";
import { MAX_MEMBERS, STAGE_OPTIONS, VISIBILITY_OPTIONS } from "@/lib/ventures/labels";

/** Runs an action, refreshes on success, keeps the error for the form to show. */
function useAction() {
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const result = await action();
      if (result.ok) {
        setSaved(true);
        onOk?.();
        router.refresh();
      } else {
        setError(result);
      }
    });
  return { error, saved, pending, run };
}

function Saved({ show, children = "Saved." }: { show: boolean; children?: React.ReactNode }) {
  return (
    <p role="status" className="text-body-sm text-text-secondary">
      {show ? children : null}
    </p>
  );
}

const selectClass = "h-10 w-full rounded-md border border-border-default bg-bg-subtle px-3 text-body";

/** Edit title, description, visibility, skills and team size (the type can't change). */
export function DetailsForm({ venture, skills }: { venture: VentureDetail; skills: SkillOption[] }) {
  const [visibility, setVisibility] = useState<VentureVisibility>(venture.visibility);
  const [stage, setStage] = useState<VentureStage>(venture.stage ?? "idea");
  const [skillIds, setSkillIds] = useState(venture.skills.map((s) => s.id));
  const [teamSize, setTeamSize] = useState(venture.teamSize);
  const { error, saved, pending, run } = useAction();
  const fields = error?.fields ?? {};
  const startup = venture.type === "startup";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "");
    run(() =>
      updateVenture(venture.id, {
        title: text("title"),
        description: text("description"),
        visibility,
        stage: startup ? stage : null,
        pitchUrl: startup ? text("pitchUrl") : "",
        affiliation: startup ? text("affiliation") : "",
        skillIds,
        teamSize,
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {error ? <FormAlert requestId={Object.keys(fields).length ? undefined : error.requestId}>{error.message}</FormAlert> : null}
      <Field id="title" label="Title" error={fields.title}>
        <Input id="title" name="title" defaultValue={venture.title} required maxLength={80} aria-invalid={fields.title ? true : undefined} aria-describedby={fields.title ? "title-error" : undefined} />
      </Field>
      <Field id="description" label="What are you building?" error={fields.description}>
        <Textarea
          id="description"
          name="description"
          defaultValue={venture.description}
          rows={6}
          required
          maxLength={4000}
          aria-invalid={fields.description ? true : undefined}
          aria-describedby={fields.description ? "description-error" : undefined}
        />
      </Field>
      {startup ? (
        <div className="flex flex-col gap-5 rounded-lg border border-border-default p-5">
          <Choice legend="Stage" name="stage" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
          <Field id="pitchUrl" label="Pitch deck link (optional)" error={fields.pitchUrl}>
            <Input id="pitchUrl" name="pitchUrl" type="url" inputMode="url" defaultValue={venture.pitchUrl ?? ""} placeholder="https://" aria-invalid={fields.pitchUrl ? true : undefined} />
          </Field>
          <Field id="affiliation" label="Incubator or university programme (optional)">
            <Input id="affiliation" name="affiliation" defaultValue={venture.affiliation ?? ""} maxLength={120} />
          </Field>
        </div>
      ) : null}
      <SkillPicker id="skills" label="Skills it needs" options={skills} value={skillIds} onChange={setSkillIds} max={10} />
      <Field id="teamSize" label="Team size you're aiming for" helper={`Including you. At most ${MAX_MEMBERS}, and not fewer than the team you have.`}>
        <select id="teamSize" value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className={selectClass} aria-describedby="teamSize-helper">
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n} disabled={n < venture.counts.members}>
              {n} people
            </option>
          ))}
        </select>
      </Field>
      <Choice legend="Who can see it" name="visibility" value={visibility} onChange={setVisibility} options={VISIBILITY_OPTIONS} />
      <div className="flex items-center gap-4">
        <Button type="submit" loading={pending}>
          Save details
        </Button>
        <Saved show={saved && !pending} />
      </div>
    </form>
  );
}

function RoleRow({ ventureId, role, skills, index }: { ventureId: string; role: VentureRole | null; skills: SkillOption[]; index: number }) {
  const [title, setTitle] = useState(role?.title ?? "");
  const [slots, setSlots] = useState(role?.slots ?? 1);
  const [skillIds, setSkillIds] = useState(role?.skills.map((s) => s.id) ?? []);
  const { error, saved, pending, run } = useAction();
  const key = role?.id ?? "new";
  const label = role ? `Role ${index + 1}` : "New role";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-default p-4">
      {error ? <FormAlert requestId={error.fields ? undefined : error.requestId}>{error.fields?.title ?? error.message}</FormAlert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field id={`role-${key}`} label={label}>
            <Input id={`role-${key}`} value={title} maxLength={60} placeholder="e.g. Backend developer" onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <div className="w-28">
          <Field id={`slots-${key}`} label="Places">
            <select id={`slots-${key}`} value={slots} onChange={(e) => setSlots(Number(e.target.value))} className={selectClass}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} disabled={role ? n < role.filled : false}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <SkillPicker id={`role-skills-${key}`} label="Skills for this role" options={skills} value={skillIds} onChange={setSkillIds} max={5} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            run(() => saveVentureRole({ ventureId, roleId: role?.id ?? null, title, skillIds, slots }), () => {
              if (!role) {
                setTitle("");
                setSlots(1);
                setSkillIds([]);
              }
            })
          }
        >
          {role ? "Save role" : (
            <>
              <Plus aria-hidden weight="bold" className="size-4" />
              Add role
            </>
          )}
        </Button>
        {role ? (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => deleteVentureRole(ventureId, role.id))} aria-label={`Delete role ${role.title}`}>
            <Trash aria-hidden weight="bold" className="size-4" />
            Delete
          </Button>
        ) : null}
        <Saved show={saved && !pending && Boolean(role)} />
      </div>
      {role?.filled ? <p className="text-body-sm text-text-secondary">{role.filled} filled. Filled places stay with their members.</p> : null}
    </div>
  );
}

/** Open roles: edit each, delete one, add one. */
export function RolesEditor({ ventureId, roles, skills }: { ventureId: string; roles: VentureRole[]; skills: SkillOption[] }) {
  return (
    <div className="flex flex-col gap-4">
      {roles.map((r, i) => (
        <RoleRow key={r.id} ventureId={ventureId} role={r} skills={skills} index={i} />
      ))}
      {roles.length < 6 ? <RoleRow key={`new-${roles.length}`} ventureId={ventureId} role={null} skills={skills} index={roles.length} /> : null}
    </div>
  );
}

/** Up to three questions every applicant answers. */
export function QuestionsEditor({ ventureId, questions: initial }: { ventureId: string; questions: string[] }) {
  const [questions, setQuestions] = useState(initial);
  const { error, saved, pending, run } = useAction();
  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert requestId={error.fields ? undefined : error.requestId}>{error.message}</FormAlert> : null}
      {questions.map((q, i) => (
        <div key={i} className="flex items-end gap-3">
          <div className="flex-1">
            <Field id={`question-${i}`} label={`Question ${i + 1}`}>
              <Input id={`question-${i}`} value={q} maxLength={200} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? e.target.value : x)))} />
            </Field>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuestions(questions.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
            <Trash aria-hidden weight="bold" className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {questions.length < 3 ? (
          <Button type="button" variant="secondary" onClick={() => setQuestions([...questions, ""])}>
            <Plus aria-hidden weight="bold" className="size-4" />
            Add a question
          </Button>
        ) : null}
        <Button loading={pending} onClick={() => run(() => setVentureQuestions(ventureId, questions.filter((q) => q.trim())))}>
          Save questions
        </Button>
        <Saved show={saved && !pending} />
      </div>
    </div>
  );
}

/** Invite a student by username; they accept on the venture page or in Requests. */
export function InviteForm({ ventureId }: { ventureId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const { error, saved, pending, run } = useAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = String(new FormData(event.currentTarget).get("username") ?? "");
    run(() => inviteToVenture(ventureId, username), () => form.current?.reset());
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field id="invite-username" label="Username" error={error?.fields?.username}>
            <Input
              id="invite-username"
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="@username"
              maxLength={31}
              aria-invalid={error?.fields?.username ? true : undefined}
              aria-describedby={error?.fields?.username ? "invite-username-error" : undefined}
            />
          </Field>
        </div>
        <Button type="submit" loading={pending}>
          Send invite
        </Button>
      </div>
      <Saved show={saved && !pending}>Invite sent.</Saved>
    </form>
  );
}

/** Link one of the owner's shared repositories (or unlink). */
export function RepoForm({ ventureId, repos, current }: { ventureId: string; repos: { id: number; fullName: string }[]; current: string | null }) {
  const currentId = repos.find((r) => r.fullName === current)?.id ?? 0;
  const [repoId, setRepoId] = useState(currentId);
  const { error, saved, pending, run } = useAction();
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field id="repo" label="Repository">
            <select id="repo" value={repoId} onChange={(e) => setRepoId(Number(e.target.value))} className={selectClass}>
              <option value={0}>No repository</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button variant="secondary" loading={pending} disabled={repoId === currentId} onClick={() => run(() => linkVentureRepo(ventureId, repoId || null))}>
          Save
        </Button>
      </div>
      <Saved show={saved && !pending} />
    </div>
  );
}
