"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { removeContentImages, storeContentImages } from "@/lib/images/content-images";

/**
 * Ventures (PRD 5.7, 5.15, 5.28). Each action validates its input, checks the session,
 * and calls one SQL function that re-checks ownership, membership and the lifecycle
 * itself (supabase/migrations/*_ventures.sql). The user id never comes from the browser.
 */

const uuid = z.uuid();
const skillIds = z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)).max(10);
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use a full https:// link.");

// ---------------------------------------------------------------------------
// Create and edit
// ---------------------------------------------------------------------------

const ventureFields = z.object({
  title: z.string().trim().min(3, "Give it a title of at least 3 characters.").max(80, "Keep the title under 80 characters."),
  description: z.string().trim().min(1, "Describe what you're building.").max(4000, "Keep it under 4,000 characters."),
  visibility: z.enum(["public", "university", "unlisted"]),
  stage: z.enum(["idea", "prototype", "launched", "revenue"]).nullable().optional(),
  pitchUrl: httpsUrl.optional(),
  affiliation: z.string().trim().max(120).optional(),
  skillIds,
  teamSize: z.number().int().min(2).max(6),
});

const createInput = ventureFields.extend({
  type: z.enum(["project", "startup"]),
  roles: z
    .array(z.object({ title: z.string().trim().min(2).max(60), skillIds: skillIds.max(5), slots: z.number().int().min(1).max(5) }))
    .max(6),
  questions: z.array(z.string().trim().min(3, "Each question needs at least 3 characters.").max(200)).max(3),
});
export type CreateVentureInput = z.input<typeof createInput>;

export async function createVenture(input: CreateVentureInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("ventures.create");
  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data;
  const result = await call<string>(ctx, session.supabase, session.userId, "create_venture", {
    p: {
      type: v.type,
      title: v.title,
      description: v.description,
      visibility: v.visibility,
      stage: v.type === "startup" ? (v.stage ?? "idea") : null,
      pitch_url: v.type === "startup" ? v.pitchUrl || null : null,
      affiliation: v.type === "startup" ? v.affiliation || null : null,
      skill_ids: v.skillIds,
      team_size: v.teamSize,
      roles: v.roles.map((r) => ({ title: r.title, skill_ids: r.skillIds, slots: r.slots })),
      questions: v.questions,
    },
  });
  if (!result.ok) return result;
  revalidatePath("/ventures");
  redirect(`/ventures/${result.data}` as Route);
}

export async function updateVenture(ventureId: string, input: z.input<typeof ventureFields>): Promise<ActionResult> {
  const ctx = await actionContext("ventures.update");
  const parsed = z.object({ id: uuid, v: ventureFields }).safeParse({ id: ventureId, v: input });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues.map((i) => ({ ...i, path: i.path.slice(1) }))) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data.v;
  return call(ctx, session.supabase, session.userId, "update_venture", {
    p_venture: ventureId,
    p: {
      title: v.title,
      description: v.description,
      visibility: v.visibility,
      stage: v.stage ?? null,
      pitch_url: v.pitchUrl ?? "",
      affiliation: v.affiliation ?? "",
      skill_ids: v.skillIds,
      team_size: v.teamSize,
    },
  }, [`/ventures/${ventureId}`]);
}

const roleInput = z.object({
  ventureId: uuid,
  roleId: uuid.nullable(),
  title: z.string().trim().min(2, "Name the role (2 to 60 characters).").max(60),
  skillIds: skillIds.max(5),
  slots: z.number().int().min(1).max(5),
});

export async function saveVentureRole(input: z.input<typeof roleInput>): Promise<ActionResult> {
  const ctx = await actionContext("ventures.save_role");
  const parsed = roleInput.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the role's fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const r = parsed.data;
  return call(ctx, session.supabase, session.userId, "save_venture_role", {
    p_venture: r.ventureId,
    p_role: r.roleId,
    p_title: r.title,
    p_skill_ids: r.skillIds,
    p_slots: r.slots,
  }, [`/ventures/${r.ventureId}`]);
}

export async function deleteVentureRole(ventureId: string, roleId: string): Promise<ActionResult> {
  const ctx = await actionContext("ventures.delete_role");
  if (!uuid.safeParse(ventureId).success || !uuid.safeParse(roleId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "delete_venture_role", { p_venture: ventureId, p_role: roleId }, [`/ventures/${ventureId}`]);
}

export async function setVentureQuestions(ventureId: string, questions: string[]): Promise<ActionResult> {
  const ctx = await actionContext("ventures.set_questions");
  const parsed = z
    .object({ id: uuid, q: z.array(z.string().trim().min(3, "Each question needs at least 3 characters.").max(200)).max(3) })
    .safeParse({ id: ventureId, q: questions });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Each question needs 3 to 200 characters; at most 3 questions.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "set_venture_questions", { p_venture: ventureId, p_questions: parsed.data.q }, [
    `/ventures/${ventureId}`,
  ]);
}

// ---------------------------------------------------------------------------
// Apply, decide, message
// ---------------------------------------------------------------------------

const applyInput = z.object({
  ventureId: uuid,
  roleId: uuid.nullable(),
  message: z.string().trim().min(1, "Say why you'd like to join.").max(1000, "Keep it under 1,000 characters."),
  answers: z.array(z.string().trim().min(1, "Answer every question.").max(500, "Keep each answer under 500 characters.")).max(3),
});

export async function applyToVenture(input: z.input<typeof applyInput>): Promise<ActionResult> {
  const ctx = await actionContext("ventures.apply");
  const parsed = applyInput.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check your application.", { fields: fieldErrors(parsed.error.issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const a = parsed.data;
  return call(ctx, session.supabase, session.userId, "apply_to_venture", {
    p_venture: a.ventureId,
    p_message: a.message,
    p_answers: a.answers,
    p_role: a.roleId,
  }, [`/ventures/${a.ventureId}`, "/requests"]);
}

function threadAction(action: string, fn: string, extra: (accept: boolean) => Record<string, unknown> = () => ({})) {
  return async (threadId: string, accept = true): Promise<ActionResult> => {
    const ctx = await actionContext(action);
    if (!uuid.safeParse(threadId).success) {
      ctx.done("refused", { error_code: "invalid_input" });
      return fail("invalid_input", "Refresh the page and try again.");
    }
    const session = await signedIn(ctx);
    if (!session) return NO_SESSION;
    return call(ctx, session.supabase, session.userId, fn, { ...extra(accept), ...(fn.includes("invite") ? { p_invite: threadId } : { p_thread: threadId }) }, [
      "/requests",
      "/ventures",
    ]);
  };
}

export async function withdrawApplication(threadId: string): Promise<ActionResult> {
  return threadAction("ventures.withdraw", "withdraw_application")(threadId);
}

/** Only the owner can decide; decide_application checks that itself (PRD 5.7). */
export async function decideApplication(threadId: string, accept: boolean): Promise<ActionResult> {
  return threadAction("ventures.decide", "decide_application", (a) => ({ p_accept: a }))(threadId, accept);
}

export async function respondInvite(inviteId: string, accept: boolean): Promise<ActionResult> {
  return threadAction("ventures.respond_invite", "respond_invite", (a) => ({ p_accept: a }))(inviteId, accept);
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  return threadAction("ventures.revoke_invite", "revoke_invite")(inviteId);
}

export async function sendApplicationMessage(threadId: string, body: string): Promise<ActionResult> {
  const ctx = await actionContext("ventures.application_message");
  const parsed = z.object({ id: uuid, body: z.string().trim().min(1, "Write a message.").max(1000) }).safeParse({ id: threadId, body });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Write a message of up to 1,000 characters.", { fields: { body: "Write a message of up to 1,000 characters." } });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "add_application_message", { p_thread: threadId, p_body: parsed.data.body }, ["/requests"]);
}

// ---------------------------------------------------------------------------
// Team and lifecycle (owner, except leave)
// ---------------------------------------------------------------------------

export async function inviteToVenture(ventureId: string, username: string): Promise<ActionResult> {
  const ctx = await actionContext("ventures.invite");
  const parsed = z
    .object({ id: uuid, username: z.string().trim().toLowerCase().regex(/^@?[a-z0-9_]{3,30}$/, "Enter a Skilient username.") })
    .safeParse({ id: ventureId, username });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter a Skilient username.", { fields: { username: "Enter a Skilient username." } });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "invite_to_venture", {
    p_venture: ventureId,
    p_username: parsed.data.username.replace(/^@/, ""),
  }, [`/ventures/${ventureId}`]);
}

const memberInput = z.object({ ventureId: uuid, memberId: uuid });

async function memberCall(action: string, fn: string, ventureId: string, memberId: string, extra: Record<string, unknown> = {}) {
  const ctx = await actionContext(action);
  if (!memberInput.safeParse({ ventureId, memberId }).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, fn, { p_venture: ventureId, p_member: memberId, ...extra }, [`/ventures/${ventureId}`]);
}

export async function removeVentureMember(ventureId: string, memberId: string): Promise<ActionResult> {
  return memberCall("ventures.remove_member", "remove_venture_member", ventureId, memberId);
}

export async function transferVentureOwnership(ventureId: string, memberId: string): Promise<ActionResult> {
  return memberCall("ventures.transfer", "transfer_venture_ownership", ventureId, memberId);
}

const TEAM_ROLES = ["lead", "developer", "designer", "researcher", "other"] as const;

export async function setMemberRole(ventureId: string, memberId: string, role: string): Promise<ActionResult> {
  if (!(TEAM_ROLES as readonly string[]).includes(role)) return fail("invalid_input", "Pick a role from the list.");
  return memberCall("ventures.set_member_role", "set_member_role", ventureId, memberId, { p_role: role });
}

function ventureCall(action: string, fn: string, extra: Record<string, unknown> = {}, paths: (id: string) => string[] = (id) => [`/ventures/${id}`]) {
  return async (ventureId: string): Promise<ActionResult> => {
    const ctx = await actionContext(action);
    if (!uuid.safeParse(ventureId).success) {
      ctx.done("refused", { error_code: "invalid_input" });
      return fail("invalid_input", "Refresh the page and try again.");
    }
    const session = await signedIn(ctx);
    if (!session) return NO_SESSION;
    return call(ctx, session.supabase, session.userId, fn, { p_venture: ventureId, ...extra }, paths(ventureId));
  };
}

export async function leaveVenture(ventureId: string): Promise<ActionResult> {
  return ventureCall("ventures.leave", "leave_venture")(ventureId);
}

const STATUSES = ["in_progress", "completed", "abandoned"] as const;

export async function transitionVenture(ventureId: string, to: string): Promise<ActionResult> {
  if (!(STATUSES as readonly string[]).includes(to)) return fail("invalid_input", "Refresh the page and try again.");
  return ventureCall("ventures.transition", "transition_venture", { p_to: to }, (id) => [`/ventures/${id}`, "/ventures"])(ventureId);
}

export async function followVenture(ventureId: string, follow: boolean): Promise<ActionResult> {
  return ventureCall("ventures.follow", "follow_venture", { p_follow: follow })(ventureId);
}

export async function linkVentureRepo(ventureId: string, repoId: number | null): Promise<ActionResult> {
  if (repoId !== null && !(Number.isInteger(repoId) && repoId > 0)) return fail("invalid_input", "Pick a repository from the list.");
  return ventureCall("ventures.link_repo", "link_venture_repo", { p_repo: repoId })(ventureId);
}

// ---------------------------------------------------------------------------
// Updates and deliverables (members)
// ---------------------------------------------------------------------------

export async function postVentureUpdate(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("ventures.post_update");
  const ventureId = String(formData.get("ventureId") ?? "");
  const parsed = z.object({ id: uuid, body: z.string().trim().min(1, "Write an update.").max(2000, "Keep it under 2,000 characters.") })
    .safeParse({ id: ventureId, body: formData.get("body") });
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Write an update of up to 2,000 characters.", { fields: { body: "Write an update of up to 2,000 characters." } });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  // Images are re-encoded (EXIF/GPS stripped) and stored first; a refused update removes them.
  const stored = await storeContentImages(session.supabase, session.userId, files);
  if (!stored.ok) {
    ctx.done(stored.code === "upload_failed" ? "error" : "refused", { error_code: stored.code, user_id: session.userId });
    return fail(stored.code, stored.message, { requestId: ctx.requestId });
  }
  const result = await call(ctx, session.supabase, session.userId, "post_venture_update_media",
    { p_venture: parsed.data.id, p_body: parsed.data.body, p_media: stored.images }, [`/ventures/${parsed.data.id}/updates`]);
  if (!result.ok) await removeContentImages(session.supabase, stored.images.map((i) => i.path));
  return result.ok ? ok(null) : result;
}

export async function deleteVentureUpdate(ventureId: string, updateId: string): Promise<ActionResult> {
  const ctx = await actionContext("ventures.delete_update");
  if (!uuid.safeParse(updateId).success || !uuid.safeParse(ventureId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data: media } = await session.supabase.from("venture_update_media").select("path").eq("update_id", updateId);
  const result = await call(ctx, session.supabase, session.userId, "delete_venture_update", { p_update: updateId }, [`/ventures/${ventureId}/updates`]);
  // Storage lets people delete only their own files; an owner removing a teammate's update
  // leaves that teammate's images (unguessable paths, no longer referenced).
  if (result.ok && media?.length) {
    await removeContentImages(session.supabase, media.map((m) => m.path).filter((p) => p.startsWith(`${session.userId}/`)));
  }
  return result;
}

export async function addVentureDeliverable(ventureId: string, label: string, url: string): Promise<ActionResult> {
  const ctx = await actionContext("ventures.add_deliverable");
  const parsed = z
    .object({
      id: uuid,
      label: z.string().trim().min(2, "Name it (2 to 80 characters).").max(80, "Keep the name under 80 characters."),
      url: z.string().trim().max(500).regex(/^https:\/\/[^\s]+$/, "Use a full https:// link."),
    })
    .safeParse({ id: ventureId, label, url });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the deliverable.", { fields: fieldErrors(parsed.error.issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "add_venture_deliverable", {
    p_venture: ventureId,
    p_label: parsed.data.label,
    p_url: parsed.data.url,
  }, [`/ventures/${ventureId}/deliverables`]);
}

export async function removeVentureDeliverable(ventureId: string, deliverableId: string): Promise<ActionResult> {
  const ctx = await actionContext("ventures.remove_deliverable");
  if (!uuid.safeParse(deliverableId).success || !uuid.safeParse(ventureId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "remove_venture_deliverable", { p_deliverable: deliverableId }, [
    `/ventures/${ventureId}/deliverables`,
  ]);
}

// ---------------------------------------------------------------------------
// Contribution log (PRD 5.14): insert-only; corrections within 24 h; teammates confirm
// ---------------------------------------------------------------------------

const KINDS = ["code", "design", "research", "docs", "management", "other"] as const;

const contributionFields = z.object({
  kind: z.enum(KINDS, "Pick what kind of work it was."),
  description: z.string().trim().min(1, "Describe what you did.").max(500, "Keep it under 500 characters."),
  evidenceUrl: z
    .string()
    .trim()
    .max(500, "Keep the link under 500 characters.")
    .refine((v) => v === "" || /^https?:\/\/[^\s]+$/.test(v), "Use a full link starting with https://."),
  hours: z
    .number("Enter hours as a number.")
    .positive("Hours must be more than 0.")
    .max(100, "At most 100 hours per entry.")
    .multipleOf(0.25, "Round to the nearest quarter hour.")
    .nullable(),
  // PRD 5.5 L3: a teammate's confirmation corroborates the skills an entry is tagged with.
  skillIds: skillIds.max(3, "Tag up to 3 skills.").optional(),
});
export type ContributionInput = z.input<typeof contributionFields>;

function contributionArgs(v: z.output<typeof contributionFields>) {
  return {
    p_kind: v.kind,
    p_description: v.description,
    p_evidence_url: v.evidenceUrl || null,
    p_hours: v.hours,
    p_skill_ids: v.skillIds ?? [],
  };
}

export async function logContribution(ventureId: string, input: ContributionInput): Promise<ActionResult<string>> {
  const ctx = await actionContext("ventures.log_contribution");
  const parsed = z.object({ id: uuid, v: contributionFields }).safeParse({ id: ventureId, v: input });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues.map((i) => ({ ...i, path: i.path.slice(1) }))) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<string>(ctx, session.supabase, session.userId, "log_contribution", {
    p_venture: ventureId,
    ...contributionArgs(parsed.data.v),
  }, [`/ventures/${ventureId}/contributions`]);
}

export async function correctContribution(ventureId: string, entryId: string, input: ContributionInput): Promise<ActionResult<string>> {
  const ctx = await actionContext("ventures.correct_contribution");
  const parsed = z.object({ id: uuid, entry: uuid, v: contributionFields }).safeParse({ id: ventureId, entry: entryId, v: input });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues.map((i) => ({ ...i, path: i.path.slice(1) }))) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<string>(ctx, session.supabase, session.userId, "correct_contribution", {
    p_original: entryId,
    ...contributionArgs(parsed.data.v),
  }, [`/ventures/${ventureId}/contributions`]);
}

export async function confirmContribution(ventureId: string, entryId: string): Promise<ActionResult> {
  const ctx = await actionContext("ventures.confirm_contribution");
  if (!uuid.safeParse(ventureId).success || !uuid.safeParse(entryId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<boolean>(ctx, session.supabase, session.userId, "confirm_contribution", { p_entry: entryId }, [
    `/ventures/${ventureId}/contributions`,
  ]);
  return result.ok ? ok(null) : result;
}
