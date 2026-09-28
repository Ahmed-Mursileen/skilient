"use client";

import { Check, SealCheck } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, Field, SheetContent, Textarea } from "@/components/ui";
import { applyToVenture, followVenture, leaveVenture, respondInvite, withdrawApplication } from "@/lib/actions/ventures";
import type { ActionError, ActionResult } from "@/lib/actions/result";
import type { VentureDetail, VentureStatus, VentureVisibility } from "@/lib/data/ventures";

/**
 * What the viewer can do on a venture page (screen spec: visitor, applied, member, owner,
 * completed). Every action is re-checked in SQL; this only shows the right buttons.
 */
export function VentureActions({
  ventureId,
  title,
  status,
  visibility,
  viewer,
  roles,
  questions,
  teamFull,
  openSlots,
}: {
  ventureId: string;
  title: string;
  status: VentureStatus;
  visibility: VentureVisibility;
  viewer: VentureDetail["viewer"];
  roles: { id: string; title: string }[];
  questions: { position: number; body: string }[];
  teamFull: boolean;
  openSlots: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const open = status === "recruiting" || status === "in_progress";

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result);
    });

  const follow =
    visibility === "public" && !viewer.isMember ? (
      <Button variant="secondary" loading={pending} onClick={() => run(() => followVenture(ventureId, !viewer.following))} aria-pressed={viewer.following}>
        {viewer.following ? (
          <>
            <Check aria-hidden weight="bold" className="size-4" />
            Following
          </>
        ) : (
          "Follow"
        )}
      </Button>
    ) : null;

  let primary: React.ReactNode = null;
  if (viewer.isOwner) {
    primary = (
      <p className="inline-flex items-center gap-2 text-body font-semibold">
        <SealCheck aria-hidden weight="fill" className="size-5 text-verified" />
        You started this venture
      </p>
    );
  } else if (viewer.isMember) {
    primary = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="inline-flex items-center gap-2 text-body font-semibold">
          <Check aria-hidden weight="bold" className="size-5 text-success" />
          You&apos;re on the team
        </p>
        {status !== "completed" ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                Leave venture
              </Button>
            </DialogTrigger>
            <DialogContent title={`Leave ${title}?`} description="You'll need to apply or be invited again to rejoin.">
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Stay</Button>
                </DialogClose>
                <Button variant="danger" loading={pending} onClick={() => run(() => leaveVenture(ventureId))}>
                  Leave
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    );
  } else if (viewer.inviteId) {
    primary = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body font-semibold">You&apos;re invited to join.</p>
        <Button loading={pending} onClick={() => run(() => respondInvite(viewer.inviteId!, true))}>
          Accept invite
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => run(() => respondInvite(viewer.inviteId!, false))}>
          Decline
        </Button>
      </div>
    );
  } else if (viewer.pendingApplicationId) {
    primary = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="inline-flex items-center gap-2 text-body font-semibold">
          <Check aria-hidden weight="bold" className="size-5 text-success" />
          Application sent
        </p>
        <Button variant="ghost" size="sm" loading={pending} onClick={() => run(() => withdrawApplication(viewer.pendingApplicationId!))}>
          Withdraw
        </Button>
      </div>
    );
  } else if (!open) {
    primary = <p className="text-body text-text-secondary">This venture isn&apos;t taking new members.</p>;
  } else if (visibility === "unlisted") {
    primary = null;
  } else if (visibility === "university" && !viewer.sameUniversity) {
    primary = <p className="text-body text-text-secondary">Only students at its university can join.</p>;
  } else if (teamFull) {
    primary = <p className="text-body text-text-secondary">The team is full (6 of 6).</p>;
  } else {
    primary = <ApplySheet ventureId={ventureId} title={title} roles={roles} questions={questions} openSlots={openSlots} onDone={() => router.refresh()} />;
  }

  if (!primary && !follow) return null;
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <div className="flex flex-wrap items-center gap-3">
        {primary}
        {follow}
      </div>
    </div>
  );
}

function ApplySheet({
  ventureId,
  title,
  roles,
  questions,
  openSlots,
  onDone,
}: {
  ventureId: string;
  title: string;
  roles: { id: string; title: string }[];
  questions: { position: number; body: string }[];
  openSlots: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await applyToVenture({
        ventureId,
        roleId: roleId || null,
        message: String(form.get("message") ?? ""),
        answers: questions.map((q) => String(form.get(`answer-${q.position}`) ?? "")),
      });
      if (result.ok) {
        setOpen(false);
        onDone();
      } else {
        setError(result);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{openSlots ? "Apply to a role" : "Apply to join"}</Button>
      </DialogTrigger>
      <SheetContent title={`Apply to ${title}`} description="The owner sees your message, your answers and your profile card.">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
          {roles.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-label text-text-secondary uppercase">Role</legend>
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-3 text-body">
                  <input type="radio" name="role" value={r.id} checked={roleId === r.id} onChange={() => setRoleId(r.id)} className="size-4" />
                  {r.title}
                </label>
              ))}
              <label className="flex items-center gap-3 text-body">
                <input type="radio" name="role" value="" checked={roleId === ""} onChange={() => setRoleId("")} className="size-4" />
                Any role
              </label>
            </fieldset>
          ) : null}
          {questions.map((q) => (
            <Field key={q.position} id={`answer-${q.position}`} label={q.body} error={fields.answers}>
              <Textarea id={`answer-${q.position}`} name={`answer-${q.position}`} rows={3} maxLength={500} required />
            </Field>
          ))}
          <Field id="message" label="Why you'd like to join" error={fields.message}>
            <Textarea
              id="message"
              name="message"
              rows={4}
              maxLength={1000}
              required
              aria-invalid={fields.message ? true : undefined}
              aria-describedby={fields.message ? "message-error" : undefined}
            />
          </Field>
          <Button type="submit" loading={pending} className="self-start">
            Send application
          </Button>
        </form>
      </SheetContent>
    </Dialog>
  );
}
