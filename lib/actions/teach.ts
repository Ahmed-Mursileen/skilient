"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext, type ActionContext } from "@/lib/actions/context";
import { fail, fieldErrors, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import type { CreateVentureInput } from "@/lib/actions/ventures";
import { AUDIENCES, DIFFICULTIES } from "@/lib/teach/constants";

/**
 * Teacher portal actions (PRD 5.21). Each validates its input, checks the session and calls one
 * SQL function that re-checks the teacher's status, ownership and every limit itself
 * (supabase/migrations/*_teacher_portal.sql). The user id never comes from the browser.
 */

const uuid = z.uuid();
const skillId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const invalid = (ctx: ActionContext, message: string) => {
  ctx.done("refused", { error_code: "invalid_input" });
  return fail("invalid_input", message);
};

// ---------------------------------------------------------------------------
// Verification and settings
// ---------------------------------------------------------------------------
const applySchema = z.object({
  department: z.string().trim().min(2, "Enter your department (at least 2 characters).").max(80, "Keep it under 80 characters."),
  title: z.string().trim().min(2, "Enter your title (at least 2 characters).").max(80, "Keep it under 80 characters."),
});

export async function requestTeacherRole(input: z.input<typeof applySchema>): Promise<ActionResult<{ status: string }>> {
  const ctx = await actionContext("teach.apply");
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string>(ctx, session.supabase, session.userId, "request_teacher_role", {
    p_department: parsed.data.department,
    p_title: parsed.data.title,
  }, ["/teach", "/teach/apply"]);
  return result.ok ? { ok: true, data: { status: result.data } } : result;
}

const settingsSchema = z.object({
  optIn: z.boolean(),
  cap: z.number().int().min(1, "The weekly limit is between 1 and 50.").max(50, "The weekly limit is between 1 and 50."),
  skills: z.array(skillId).max(30, "Choose up to 30 skills."),
  digest: z.boolean(),
});

export async function saveTeacherSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  const ctx = await actionContext("teach.settings");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check your settings.", { fields: fieldErrors(parsed.error.issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data;
  return call(ctx, session.supabase, session.userId, "save_teacher_settings", {
    p_opt_in: v.optIn,
    p_cap: v.cap,
    p_skills: v.skills,
    p_digest: v.digest,
  }, ["/teach/settings", "/teach/code-checks", "/teach"]);
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------
const ideaSchema = z.object({
  title: z.string().trim().min(3, "Give the idea a title of at least 3 characters.").max(100, "Keep the title under 100 characters."),
  brief: z.string().trim().min(1, "Describe the project.").max(2000, "Keep the brief under 2,000 characters."),
  skills: z.array(skillId).min(1, "Choose at least one skill.").max(10, "Choose up to 10 skills."),
  difficulty: z.enum(DIFFICULTIES),
  teamSize: z.number().int().min(2, "A team is 2 to 6 people.").max(6, "A team is 2 to 6 people."),
  durationWeeks: z.number().int().min(1, "Duration is 1 to 52 weeks.").max(52, "Duration is 1 to 52 weeks."),
  deliverables: z.string().trim().min(1, "Say what the teams hand in.").max(500, "Keep it under 500 characters."),
  maxTeams: z.number().int().min(1, "Allow 1 to 50 teams.").max(50, "Allow 1 to 50 teams."),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date.").or(z.literal("")),
  courseLabel: z.string().trim().max(60, "Keep the label under 60 characters."),
  audience: z.enum(AUDIENCES),
});
export type IdeaInput = z.input<typeof ideaSchema>;

export async function saveIdea(id: string | null, input: IdeaInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("teach.save_idea");
  const parsed = z.object({ id: uuid.nullable(), v: ideaSchema }).safeParse({ id, v: input });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", {
      fields: fieldErrors(parsed.error.issues.map((i) => ({ ...i, path: i.path.slice(1) }))),
    });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data.v;
  const result = await call<string>(ctx, session.supabase, session.userId, "save_idea", {
    p_id: id,
    p: {
      title: v.title,
      brief: v.brief,
      skills: v.skills,
      difficulty: v.difficulty,
      team_size: v.teamSize,
      duration_weeks: v.durationWeeks,
      deliverables: v.deliverables,
      max_teams: v.maxTeams,
      deadline: v.deadline,
      course_label: v.courseLabel,
      audience: v.audience,
    },
  }, ["/teach/ideas", "/teach", "/explore"]);
  return result.ok ? { ok: true, data: { id: result.data } } : result;
}

export async function setIdeaOpen(id: string, open: boolean): Promise<ActionResult> {
  const ctx = await actionContext("teach.idea_status");
  const parsed = z.object({ id: uuid, open: z.boolean() }).safeParse({ id, open });
  if (!parsed.success) return invalid(ctx, "That idea doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "set_idea_status", { p_id: id, p_open: open }, [`/teach/ideas/${id}`, "/teach/ideas", "/explore"]);
}

// A student starts a venture from an idea: the same fields as a new venture, linked and with the teacher invited.
const startSchema = z.object({
  title: z.string().trim().min(3, "Give it a title of at least 3 characters.").max(80, "Keep the title under 80 characters."),
  description: z.string().trim().min(1, "Describe what you're building.").max(4000, "Keep it under 4,000 characters."),
  visibility: z.enum(["public", "university", "unlisted"]),
  skillIds: z.array(skillId).max(10),
  teamSize: z.number().int().min(2).max(6),
  roles: z.array(z.object({ title: z.string().trim().min(2).max(60), skillIds: z.array(skillId).max(5), slots: z.number().int().min(1).max(5) })).max(6),
  questions: z.array(z.string().trim().min(3, "Each question needs at least 3 characters.").max(200)).max(3),
});

export async function startVentureFromIdea(ideaId: string, input: CreateVentureInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("teach.start_from_idea");
  const parsed = z.object({ id: uuid, v: startSchema }).safeParse({ id: ideaId, v: input });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", {
      fields: fieldErrors(parsed.error.issues.map((i) => ({ ...i, path: i.path.slice(1) }))),
    });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data.v;
  const result = await call<string>(ctx, session.supabase, session.userId, "start_venture_from_idea", {
    p_idea: ideaId,
    p: {
      title: v.title,
      description: v.description,
      visibility: v.visibility,
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

// ---------------------------------------------------------------------------
// Supervision
// ---------------------------------------------------------------------------
export async function inviteSupervisor(ventureId: string, teacherId: string): Promise<ActionResult> {
  const ctx = await actionContext("teach.invite_supervisor");
  const parsed = z.object({ v: uuid, t: uuid }).safeParse({ v: ventureId, t: teacherId });
  if (!parsed.success) return invalid(ctx, "Choose a teacher.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "invite_supervisor", { p_venture: ventureId, p_teacher: teacherId }, [`/ventures/${ventureId}/reviews`]);
}

export async function respondSupervision(ventureId: string, accept: boolean): Promise<ActionResult> {
  const ctx = await actionContext("teach.respond_supervision");
  const parsed = z.object({ v: uuid, a: z.boolean() }).safeParse({ v: ventureId, a: accept });
  if (!parsed.success) return invalid(ctx, "That venture doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "respond_supervision", { p_venture: ventureId, p_accept: accept }, [
    "/teach",
    `/teach/ventures/${ventureId}`,
  ]);
}

export async function endSupervision(ventureId: string): Promise<ActionResult> {
  const ctx = await actionContext("teach.end_supervision");
  if (!uuid.safeParse(ventureId).success) return invalid(ctx, "That venture doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "end_supervision", { p_venture: ventureId }, [
    `/ventures/${ventureId}/reviews`,
    `/teach/ventures/${ventureId}`,
    "/teach",
  ]);
}

export async function postSupervisorComment(ventureId: string, body: string): Promise<ActionResult> {
  const ctx = await actionContext("teach.supervisor_comment");
  const parsed = z.object({ v: uuid, body: z.string().trim().min(1, "Write something first.").max(2000, "Keep it under 2,000 characters.") }).safeParse({ v: ventureId, body });
  if (!parsed.success) return invalid(ctx, parsed.error.issues[0]?.message ?? "Write something first.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "post_supervisor_comment", { p_venture: ventureId, p_body: parsed.data.body }, [
    `/ventures/${ventureId}/reviews`,
    `/teach/ventures/${ventureId}`,
  ]);
}

export async function confirmAsSupervisor(entryId: string, ventureId: string): Promise<ActionResult> {
  const ctx = await actionContext("teach.confirm_contribution");
  const parsed = z.object({ e: uuid, v: uuid }).safeParse({ e: entryId, v: ventureId });
  if (!parsed.success) return invalid(ctx, "That entry doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "supervisor_confirm_contribution", { p_entry: entryId }, [`/teach/ventures/${ventureId}`]);
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export async function requestReview(ventureId: string, teacherId: string): Promise<ActionResult> {
  const ctx = await actionContext("teach.request_review");
  const parsed = z.object({ v: uuid, t: uuid }).safeParse({ v: ventureId, t: teacherId });
  if (!parsed.success) return invalid(ctx, "Choose a teacher.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "request_review", { p_venture: ventureId, p_teacher: teacherId }, [`/ventures/${ventureId}/reviews`]);
}

export async function startReview(ventureId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("teach.start_review");
  if (!uuid.safeParse(ventureId).success) return invalid(ctx, "That venture doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string>(ctx, session.supabase, session.userId, "start_review", { p_venture: ventureId }, [
    "/teach/reviews",
    `/teach/ventures/${ventureId}`,
  ]);
  return result.ok ? { ok: true, data: { id: result.data } } : result;
}

export async function closeReviewRequest(requestId: string, ventureId: string): Promise<ActionResult> {
  const ctx = await actionContext("teach.close_review_request");
  const parsed = z.object({ r: uuid, v: uuid }).safeParse({ r: requestId, v: ventureId });
  if (!parsed.success) return invalid(ctx, "That request doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "close_review_request", { p_request: requestId }, [
    "/teach/reviews",
    "/teach",
    `/ventures/${ventureId}/reviews`,
  ]);
}

const reviewSchema = z.object({
  request: uuid,
  rubric: z.object(
    Object.fromEntries(
      ["scope", "technical", "collaboration", "documentation", "outcome"].map((k) => [
        k,
        z.object({
          score: z.number().int().min(1, "Score every part from 1 to 5.").max(5, "Score every part from 1 to 5."),
          comment: z.string().trim().min(3, "Add a short comment to every part.").max(500, "Keep each comment under 500 characters."),
        }),
      ]),
    ) as Record<string, z.ZodObject<{ score: z.ZodNumber; comment: z.ZodString }>>,
  ),
  comments: z.string().trim().max(2000, "Keep the overall comment under 2,000 characters."),
});
export type ReviewInput = z.input<typeof reviewSchema>;

export async function submitReview(input: ReviewInput): Promise<ActionResult> {
  const ctx = await actionContext("teach.submit_review");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return invalid(ctx, parsed.error.issues[0]?.message ?? "Score and comment on every part.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data;
  return call(ctx, session.supabase, session.userId, "submit_review", { p_request: v.request, p_rubric: v.rubric, p_comments: v.comments || null }, [
    "/teach/reviews",
    `/teach/reviews/${v.request}`,
    "/teach",
  ]);
}

// ---------------------------------------------------------------------------
// Endorsements and code checks
// ---------------------------------------------------------------------------
const endorseSchema = z.object({
  ventureId: uuid,
  endorseeId: uuid,
  items: z
    .array(z.object({ skillId, evidenceId: uuid.nullable() }))
    .min(1, "Choose at least one skill.")
    .max(5, "Choose up to 5 skills.")
    .refine((items) => new Set(items.map((i) => i.skillId)).size === items.length, "Choose each skill once."),
  note: z.string().trim().max(280, "Keep the note under 280 characters.").optional(),
});
export type TeacherEndorseInput = z.input<typeof endorseSchema>;

export async function teacherEndorse(input: TeacherEndorseInput): Promise<ActionResult<{ count: number }>> {
  const ctx = await actionContext("teach.endorse");
  const parsed = endorseSchema.safeParse(input);
  if (!parsed.success) return invalid(ctx, parsed.error.issues[0]?.message ?? "Check your choices.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data;
  const result = await call<number>(ctx, session.supabase, session.userId, "teacher_endorse", {
    p_endorsee: v.endorseeId,
    p_venture: v.ventureId,
    p_items: v.items.map((i) => ({ skill: i.skillId, evidence: i.evidenceId })),
    p_note: v.note || null,
  }, [`/teach/ventures/${v.ventureId}`, "/teach"]);
  if (!result.ok) return result;
  if (result.data !== v.items.length) return fail("unavailable", "Something went wrong on our side. Try again.", { requestId: ctx.requestId });
  return { ok: true, data: { count: result.data } };
}

export async function claimTeacherCheck(id: string, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("teach.check_claim");
  const parsed = z.object({ id: uuid, claim: z.boolean() }).safeParse({ id, claim });
  if (!parsed.success) return invalid(ctx, "That code check doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "teacher_claim_code_check", { p_id: id, p_claim: claim }, [
    `/teach/code-checks/${id}`,
    "/teach/code-checks",
    "/teach",
  ]);
}

const rubricPart = z.object({ pass: z.boolean(), comment: z.string().trim().max(500).optional() });
export async function gradeTeacherCheck(
  id: string,
  rubric: Record<"behaviour" | "design" | "change" | "accuracy", { pass: boolean; comment?: string }>,
  feedback: string,
): Promise<ActionResult<{ passed: boolean }>> {
  const ctx = await actionContext("teach.check_grade");
  const parsed = z
    .object({
      id: uuid,
      rubric: z.object({ behaviour: rubricPart, design: rubricPart, change: rubricPart, accuracy: rubricPart }),
      feedback: z.string().trim().min(3, "Give the student some feedback.").max(2000, "Keep the feedback under 2,000 characters."),
    })
    .safeParse({ id, rubric, feedback });
  if (!parsed.success) return invalid(ctx, parsed.error.issues[0]?.message ?? "Mark each part and give feedback.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<boolean>(
    ctx,
    session.supabase,
    session.userId,
    "teacher_grade_code_check",
    { p_id: id, p_rubric: parsed.data.rubric, p_feedback: parsed.data.feedback },
    [`/teach/code-checks/${id}`, "/teach/code-checks", "/teach"],
  );
  return result.ok ? { ok: true, data: { passed: result.data } } : result;
}
