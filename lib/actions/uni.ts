"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { rpcAction } from "@/lib/actions/recruit-run";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { sha256Hex } from "@/lib/data/recruit-public";
import { sendEmail } from "@/lib/email/send";
import { fairInviteEmail, uniAdminInviteEmail } from "@/lib/email/templates";
import { brandColourError } from "@/lib/ecosphere/contrast";
import { ADMIN_ROLE_LABELS, BADGE_ICONS, EVENT_TYPES, MODULES, sensitiveTopic } from "@/lib/uni/constants";

/**
 * University-portal actions (PRD 5.23). Each validates its input with Zod, reads the session with
 * getUser(), and calls one SQL function that re-checks the admin's role, two-factor, the plan and
 * every limit itself (supabase/migrations/20261017..21_uni_*.sql). The user id never comes from
 * the browser; one JSON log line per call through actionContext.
 */

const uuid = z.uuid();
const optUuid = z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} needs at least ${min} characters.`).max(max, `${label} is at most ${max} characters.`);
const reason = text(3, 500, "The reason");
const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address."));
// datetime-local inputs carry no offset: they are Pakistan time (UTC+5, no daylight saving).
const datetime = z.string().trim().min(1, "Pick a date and time.")
  .transform((v) => (/([zZ]|[+-]\d{2}:?\d{2})$/.test(v) ? v : `${v.length === 16 ? `${v}:00` : v}+05:00`))
  .refine((v) => !Number.isNaN(Date.parse(v)), "Pick a date and time.")
  .transform((v) => new Date(v).toISOString());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const role = z.enum(["admin", "career", "coordinator", "comms"]);
const PORTAL = ["/uni"];

// ---------------------------------------------------------------------------
// Claim and invites
// ---------------------------------------------------------------------------
const claimSchema = z.object({ title: text(2, 80, "Your title"), note: z.string().trim().max(1000).optional(), path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/, "Upload the letter first.") });
const LETTER_MAX = 5 * 1024 * 1024;
/** The letter is uploaded by the browser into the caller's folder; its bytes must really be a PDF. */
export async function submitClaim(input: z.input<typeof claimSchema>): Promise<ActionResult<string>> {
  const ctx = await actionContext("uni.claim");
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  if (!parsed.data.path.startsWith(`${session.userId}/`)) {
    ctx.done("refused", { error_code: "forbidden", user_id: session.userId });
    return fail("forbidden", "Upload the letter again.");
  }
  const bucket = session.supabase.storage.from("university-claims");
  const { data: blob, error } = await bucket.download(parsed.data.path);
  const head = blob ? Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString("latin1") : "";
  if (error || !blob || blob.size > LETTER_MAX || head !== "%PDF-") {
    ctx.done("refused", { error_code: "invalid_file", user_id: session.userId });
    return fail("invalid_file", "That file isn't a PDF we can accept (up to 5 MB).");
  }
  return call<string>(ctx, session.supabase, session.userId, "submit_uni_claim", { p: { title: parsed.data.title, note: parsed.data.note ?? "", path: parsed.data.path } }, ["/uni/claim"]);
}

const inviteSchema = z
  .object({ email, role, departmentId: optUuid })
  .refine((v) => (v.role === "coordinator") === Boolean(v.departmentId), { message: "A department coordinator needs a department.", path: ["departmentId"] });
export async function inviteAdmin(input: z.input<typeof inviteSchema>): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const ctx = await actionContext("uni.invite_admin");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the email address.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const token = randomBytes(32).toString("base64url");
  const result = await call<string>(ctx, session.supabase, session.userId, "invite_uni_admin", {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_department: parsed.data.departmentId,
    p_token_hash: sha256Hex(token),
  }, ["/uni/settings/admins"]);
  if (!result.ok) return result;
  const { data: uni } = await session.supabase.rpc("my_uni" as never);
  const university = (uni as { name?: string } | null)?.name ?? "your university";
  const link = `${ctx.origin}/uni/join?invite=${token}`;
  const emailed = await sendEmail(uniAdminInviteEmail(parsed.data.email, { university, role: ADMIN_ROLE_LABELS[parsed.data.role], link }), ctx.requestId);
  return { ok: true, data: { link, emailed } };
}
export async function revokeAdminInvite(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.revoke_invite", schema: uuid, input: id, fn: "revoke_uni_invite", args: (v) => ({ p_id: v }), revalidate: ["/uni/settings/admins"] });
}
export async function acceptAdminInvite(id: string): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.accept_invite", schema: uuid, input: id, fn: "accept_uni_invite", args: (v) => ({ p_id: v }), revalidate: PORTAL });
}
export async function setAdminRole(input: { userId: string; role: string; departmentId?: string | null }): Promise<ActionResult> {
  return rpcAction({
    name: "uni.set_admin_role",
    schema: z.object({ userId: uuid, role, departmentId: optUuid }),
    input,
    fn: "set_uni_admin_role",
    args: (v) => ({ p_user: v.userId, p_role: v.role, p_department: v.departmentId }),
    revalidate: ["/uni/settings/admins"],
  });
}
export async function removeAdmin(userId: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.remove_admin", schema: uuid, input: userId, fn: "remove_uni_admin", args: (v) => ({ p_user: v }), revalidate: ["/uni/settings/admins"] });
}
export async function transferOwnership(userId: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.transfer_ownership", schema: uuid, input: userId, fn: "transfer_uni_ownership", args: (v) => ({ p_user: v }), revalidate: PORTAL });
}

// ---------------------------------------------------------------------------
// Domains, final-year batch, structure
// ---------------------------------------------------------------------------
const domainSchema = z.object({
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/, "Enter a domain like students.example.edu.pk."),
  kind: z.enum(["student", "faculty", "both"]),
  reason,
});
export async function requestDomain(input: z.input<typeof domainSchema>): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.request_domain", schema: domainSchema, input, fn: "request_uni_domain", args: (v) => ({ p_domain: v.domain, p_kind: v.kind, p_reason: v.reason }), revalidate: ["/uni/settings/domains"] });
}
const batchSchema = z.object({ year: z.union([z.coerce.number().int().min(2000).max(2100), z.literal(""), z.null()]).transform((v) => (v === "" ? null : v)), reason });
export async function requestFinalYear(input: z.input<typeof batchSchema>): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.request_final_year", schema: batchSchema, input, fn: "request_final_year_batch", args: (v) => ({ p_year: v.year, p_reason: v.reason }), revalidate: ["/uni/sponsorship"] });
}
export async function saveDepartment(input: { id?: string | null; name: string }): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.save_department", schema: z.object({ id: optUuid, name: text(2, 80, "The name") }), input, fn: "save_department", args: (v) => ({ p_id: v.id, p_name: v.name }), revalidate: ["/uni/people"] });
}
export async function deleteDepartment(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.delete_department", schema: uuid, input: id, fn: "delete_department", args: (v) => ({ p_id: v }), revalidate: ["/uni/people"] });
}
export async function saveProgramme(input: { departmentId: string; name: string }): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.save_programme", schema: z.object({ departmentId: uuid, name: text(2, 80, "The name") }), input, fn: "save_programme", args: (v) => ({ p_department: v.departmentId, p_name: v.name }), revalidate: ["/uni/people"] });
}
export async function deleteProgramme(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.delete_programme", schema: uuid, input: id, fn: "delete_programme", args: (v) => ({ p_id: v }), revalidate: ["/uni/people"] });
}

// ---------------------------------------------------------------------------
// Teachers
// ---------------------------------------------------------------------------
export async function approveTeacher(userId: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.approve_teacher", schema: uuid, input: userId, fn: "uni_approve_teacher", args: (v) => ({ p_user: v }), revalidate: ["/uni/people"] });
}
export async function revokeTeacher(input: { userId: string; reason: string }): Promise<ActionResult> {
  return rpcAction({ name: "uni.revoke_teacher", schema: z.object({ userId: uuid, reason }), input, fn: "uni_revoke_teacher", args: (v) => ({ p_user: v.userId, p_reason: v.reason }), revalidate: ["/uni/people"] });
}
export async function setTeacherDepartment(input: { userId: string; departmentId: string }): Promise<ActionResult> {
  return rpcAction({ name: "uni.teacher_department", schema: z.object({ userId: uuid, departmentId: uuid }), input, fn: "uni_set_teacher_department", args: (v) => ({ p_user: v.userId, p_department: v.departmentId }), revalidate: ["/uni/people"] });
}
const csvRow = z.object({ email, department: z.string().trim().max(80).optional(), title: z.string().trim().max(80).optional() });
export async function importFaculty(input: { csv: string }): Promise<ActionResult<number>> {
  const rows = input.csv
    .split(/\r?\n/)
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => c[0] && c[0].includes("@"))
    .map(([e, department, title]) => ({ email: e, department, title }));
  return rpcAction({ name: "uni.import_faculty", schema: z.array(csvRow).min(1, "Paste at least one row: email, department, title.").max(2000), input: rows, fn: "uni_import_faculty", args: (v) => ({ p_rows: v }), revalidate: ["/uni/people"] });
}

// ---------------------------------------------------------------------------
// Ecosphere
// ---------------------------------------------------------------------------
const modulesSchema = z.object(Object.fromEntries(MODULES.map((m) => [m.key, z.boolean()])) as Record<(typeof MODULES)[number]["key"], z.ZodBoolean>);
export async function saveModules(input: z.input<typeof modulesSchema>): Promise<ActionResult> {
  return rpcAction({ name: "uni.modules", schema: modulesSchema, input, fn: "save_ecosphere_modules", args: (v) => ({ p: v }), revalidate: ["/uni/settings/ecosphere"] });
}
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1F4E79.");
const pair = z.object({ light: hex, dark: hex }).nullable();
const brandingSchema = z
  .object({ primary: pair, accent: pair, welcome: z.string().trim().max(1000, "Keep the welcome under 1,000 characters.") })
  .superRefine((v, ctx) => {
    const error = brandColourError({ primary: v.primary, accent: v.accent });
    if (error) ctx.addIssue({ code: "custom", message: error, path: ["primary"] });
  });
export async function saveBranding(input: z.input<typeof brandingSchema>): Promise<ActionResult> {
  return rpcAction({ name: "uni.branding", schema: brandingSchema, input, fn: "save_branding", args: (v) => ({ p: v }), revalidate: ["/uni/settings/branding"] });
}
const structureSchema = z.object({
  labels: z.record(z.string().regex(/^(19|20|21)\d{2}$/), z.string().trim().min(1).max(30)),
  categories: z.array(z.string().trim().min(2).max(40)).max(20, "Up to 20 categories."),
});
export async function saveStructure(input: z.input<typeof structureSchema>): Promise<ActionResult> {
  return rpcAction({ name: "uni.structure", schema: structureSchema, input, fn: "save_ecosphere_structure", args: (v) => ({ p_labels: v.labels, p_categories: v.categories }), revalidate: ["/uni/settings/ecosphere"] });
}
export async function changeSlug(slug: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.slug", schema: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.").min(3).max(60), input: slug, fn: "uni_change_slug", args: (v) => ({ p_slug: v }), revalidate: ["/uni/settings/branding"] });
}
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal("image"), path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/), caption: z.string().max(200).optional() }),
  z.object({ type: z.literal("links"), items: z.array(z.object({ label: z.string().trim().min(1).max(80), url: z.string().regex(/^https:\/\/\S+$/).max(500) })).min(1).max(20) }),
  z.object({ type: z.literal("announcements"), count: z.number().int().min(1).max(10) }),
  z.object({ type: z.literal("events"), count: z.number().int().min(1).max(10) }),
  z.object({ type: z.literal("ventures"), ids: z.array(uuid).min(1).max(12) }),
  z.object({ type: z.literal("faculty"), ids: z.array(uuid).min(1).max(12) }),
]);
const pageSchema = z.object({
  id: optUuid,
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.").max(40),
  title: text(2, 80, "The title"),
  blocks: z.array(block).max(30),
  published: z.boolean(),
  position: z.number().int().min(1).max(10),
});
export async function savePage(input: z.input<typeof pageSchema>): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.page", schema: pageSchema, input, fn: "save_ecosphere_page", args: (v) => ({ p_id: v.id, p: { slug: v.slug, title: v.title, blocks: v.blocks, published: v.published, position: v.position } }), revalidate: ["/uni/settings/ecosphere"], invalidMessage: "Check the page's blocks." });
}
export async function deletePage(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.page_delete", schema: uuid, input: id, fn: "delete_ecosphere_page", args: (v) => ({ p_id: v }), revalidate: ["/uni/settings/ecosphere"] });
}
const questionSchema = z.object({
  prompt: text(5, 200, "The question").refine((v) => !sensitiveTopic(v), "Questions can't ask about religion, ethnicity, health, politics or income."),
  options: z.array(z.string().trim().min(1).max(60)).min(2, "Give 2 to 6 options.").max(6, "Give 2 to 6 options.")
    .refine((o) => !o.some(sensitiveTopic), "Questions can't ask about religion, ethnicity, health, politics or income."),
});
export async function saveQuestion(input: z.input<typeof questionSchema>): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.question", schema: questionSchema, input, fn: "save_uni_question", args: (v) => ({ p_prompt: v.prompt, p_options: v.options }), revalidate: ["/uni/settings/ecosphere"] });
}
export async function removeQuestion(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.question_remove", schema: uuid, input: id, fn: "remove_uni_question", args: (v) => ({ p_id: v }), revalidate: ["/uni/settings/ecosphere"] });
}

// Awards (never affect ranking)
const badgeSchema = z.object({ id: optUuid, name: text(2, 60, "The name"), description: z.string().trim().max(300).optional(), icon: z.enum(BADGE_ICONS) });
export async function saveBadge(input: z.input<typeof badgeSchema>): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.badge", schema: badgeSchema, input, fn: "save_badge", args: (v) => ({ p_id: v.id, p: { name: v.name, description: v.description ?? "", icon: v.icon } }), revalidate: ["/uni/people/awards"] });
}
export async function archiveBadge(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.badge_archive", schema: uuid, input: id, fn: "archive_badge", args: (v) => ({ p_id: v }), revalidate: ["/uni/people/awards"] });
}
export async function awardBadge(input: { badgeId: string; student: string; note?: string }): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.award", schema: z.object({ badgeId: uuid, student: text(3, 254, "The username or email"), note: z.string().trim().max(300).optional() }), input, fn: "award_badge", args: (v) => ({ p_badge: v.badgeId, p_student: v.student, p_note: v.note ?? null }), revalidate: ["/uni/people/awards"] });
}
export async function revokeAward(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.award_revoke", schema: uuid, input: id, fn: "revoke_award", args: (v) => ({ p_award: v }), revalidate: ["/uni/people/awards"] });
}

// Calendar
export async function saveSemester(input: { name: string; starts: string; ends: string }): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.semester", schema: z.object({ name: text(2, 60, "The name"), starts: date, ends: date }), input, fn: "uni_save_semester", args: (v) => ({ p_name: v.name, p_starts: v.starts, p_ends: v.ends }), revalidate: ["/uni/settings/calendar"] });
}
export async function deleteSemester(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.semester_delete", schema: uuid, input: id, fn: "uni_delete_semester", args: (v) => ({ p_id: v }), revalidate: ["/uni/settings/calendar"] });
}
export async function addExamPeriod(input: { starts: string; ends: string; reason: string }): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.exam_add", schema: z.object({ starts: date, ends: date, reason }), input, fn: "uni_add_exam_period", args: (v) => ({ p_starts: v.starts, p_ends: v.ends, p_reason: v.reason }), revalidate: ["/uni/settings/calendar"] });
}
export async function removeExamPeriod(input: { id: string; reason: string }): Promise<ActionResult> {
  return rpcAction({ name: "uni.exam_remove", schema: z.object({ id: uuid, reason }), input, fn: "uni_remove_exam_period", args: (v) => ({ p_id: v.id, p_reason: v.reason }), revalidate: ["/uni/settings/calendar"] });
}

// ---------------------------------------------------------------------------
// Announcements, events, moderation
// ---------------------------------------------------------------------------
const announceSchema = z.object({
  body: text(1, 2000, "The announcement"),
  category: z.string().trim().max(40).optional(),
  expiresDays: z.coerce.number().int().min(1).max(90),
  pinDays: z.coerce.number().int().min(0).max(7),
  departments: z.array(uuid).max(30),
  batches: z.array(z.coerce.number().int().min(1980).max(2100)).max(10),
});
export async function postAnnouncement(input: z.input<typeof announceSchema>): Promise<ActionResult<string>> {
  return rpcAction({
    name: "uni.announce",
    schema: announceSchema,
    input,
    fn: "uni_post_announcement",
    args: (v) => ({ p: { body: v.body, category: v.category || null, expires_days: v.expiresDays, pin_days: v.pinDays, departments: v.departments, batches: v.batches } }),
    revalidate: ["/uni/announcements", "/feed"],
  });
}
export async function endAnnouncement(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.announce_end", schema: uuid, input: id, fn: "uni_end_announcement", args: (v) => ({ p_post: v }), revalidate: ["/uni/announcements"] });
}
const eventSchema = z
  .object({
    id: optUuid,
    type: z.enum(EVENT_TYPES),
    scope: z.enum(["university", "global"]),
    title: text(3, 120, "The title"),
    description: z.string().trim().max(4000).optional(),
    startsAt: datetime,
    endsAt: datetime,
    location: z.string().trim().max(120).optional(),
    link: z.union([z.string().trim().regex(/^https:\/\/\S+$/, "Links start with https://").max(500), z.literal("")]).optional(),
    capacity: z.union([z.coerce.number().int().min(1).max(20000), z.literal("")]).optional(),
  })
  .refine((v) => Boolean(v.location) || Boolean(v.link), { message: "Give a place or an https:// link.", path: ["location"] })
  .refine((v) => v.endsAt > v.startsAt, { message: "The event ends after it starts.", path: ["endsAt"] });
export async function saveEvent(input: z.input<typeof eventSchema>): Promise<ActionResult<string>> {
  return rpcAction({
    name: "uni.event",
    schema: eventSchema,
    input,
    fn: "save_event",
    args: (v) => ({ p_id: v.id, p: { type: v.type, scope: v.scope, title: v.title, description: v.description ?? "", starts_at: v.startsAt, ends_at: v.endsAt, location: v.location ?? "", link: v.link ?? "", capacity: v.capacity === "" || v.capacity === undefined ? "" : String(v.capacity) } }),
    revalidate: ["/uni/events", "/events"],
  });
}
export async function cancelEvent(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.event_cancel", schema: uuid, input: id, fn: "cancel_event", args: (v) => ({ p_id: v }), revalidate: ["/uni/events", "/events"] });
}
export async function hideContent(input: { type: "post" | "comment"; id: string; reason: string }): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.hide", schema: z.object({ type: z.enum(["post", "comment"]), id: uuid, reason }), input, fn: "uni_hide", args: (v) => ({ p_type: v.type, p_id: v.id, p_reason: v.reason }), revalidate: ["/uni/moderation", "/feed"] });
}

// ---------------------------------------------------------------------------
// Hackathons and job fairs
// ---------------------------------------------------------------------------
const hackSchema = z.object({
  id: optUuid,
  title: text(3, 100, "The title"),
  brief: text(100, 6000, "The brief"),
  startsAt: datetime,
  endsAt: datetime,
  teamSize: z.coerce.number().int().min(1).max(3),
  skills: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)).min(1, "Pick 1 to 5 skills.").max(5, "Pick 1 to 5 skills."),
  prize: text(3, 300, "The prize"),
  rubric: z.array(z.object({ criterion: text(2, 80, "Each criterion"), weight: z.coerce.number().int().min(1).max(100) })).min(2).max(6)
    .refine((r) => r.reduce((s, c) => s + c.weight, 0) === 100, "The weights add up to 100."),
  openToAll: z.boolean(),
  judges: z.array(uuid).min(1, "Pick 1 to 5 teachers to judge.").max(5, "Pick 1 to 5 teachers to judge."),
});
export async function saveHackathon(input: z.input<typeof hackSchema>): Promise<ActionResult<string>> {
  return rpcAction({
    name: "uni.hackathon",
    schema: hackSchema,
    input,
    fn: "save_hackathon",
    args: (v) => ({ p_id: v.id, p: { title: v.title, brief: v.brief, starts_at: v.startsAt, ends_at: v.endsAt, team_size: v.teamSize, skills: v.skills.map((skill) => ({ skill })), prize: v.prize, rubric: v.rubric.map((r) => ({ criterion: r.criterion, weight: String(r.weight) })), open_to_all: v.openToAll, judges: v.judges } }),
    revalidate: ["/uni/hackathons"],
  });
}
export async function finishHackathon(id: string): Promise<ActionResult> {
  return rpcAction({ name: "uni.hackathon_finish", schema: uuid, input: id, fn: "finish_hackathon", args: (v) => ({ p_id: v }), revalidate: ["/uni/hackathons"] });
}
export async function judgeScore(input: { teamId: string; scores: Record<string, number>; feedback?: string }): Promise<ActionResult> {
  return rpcAction({ name: "teach.judge_score", schema: z.object({ teamId: uuid, scores: z.record(z.string(), z.number().min(0).max(10)), feedback: z.string().max(2000).optional() }), input, fn: "judge_score_team", args: (v) => ({ p_team: v.teamId, p_scores: v.scores, p_feedback: v.feedback ?? null }), revalidate: ["/teach/judging"] });
}

const fairSchema = z.object({ id: optUuid, title: text(3, 120, "The title"), description: z.string().trim().max(4000).optional(), startsAt: datetime, endsAt: datetime })
  .refine((v) => v.endsAt > v.startsAt, { message: "The fair ends after it starts.", path: ["endsAt"] });
export async function saveFair(input: z.input<typeof fairSchema>): Promise<ActionResult<string>> {
  return rpcAction({ name: "uni.fair", schema: fairSchema, input, fn: "save_job_fair", args: (v) => ({ p_id: v.id, p: { title: v.title, description: v.description ?? "", starts_at: v.startsAt, ends_at: v.endsAt } }), revalidate: ["/uni/fairs"] });
}
export async function setFairStatus(input: { id: string; action: "publish" | "cancel" }): Promise<ActionResult> {
  return rpcAction({ name: "uni.fair_status", schema: z.object({ id: uuid, action: z.enum(["publish", "cancel"]) }), input, fn: "set_job_fair_status", args: (v) => ({ p_id: v.id, p_action: v.action }), revalidate: ["/uni/fairs"] });
}
export async function inviteFairCompany(input: { fairId: string; email: string }): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const ctx = await actionContext("uni.fair_invite");
  const parsed = z.object({ fairId: uuid, email }).safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the email address.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const token = randomBytes(32).toString("base64url");
  const result = await call<string>(ctx, session.supabase, session.userId, "invite_fair_company", {
    p_fair: parsed.data.fairId,
    p_email: parsed.data.email,
    p_token_hash: sha256Hex(token),
  }, [`/uni/fairs/${parsed.data.fairId}`]);
  if (!result.ok) return result;
  const { data: preview } = await session.supabase.rpc("fair_invite_preview" as never, { p_token_hash: sha256Hex(token) } as never);
  const p = preview as { university?: string; fair?: string } | null;
  const link = `${ctx.origin}/fairs/invite?token=${token}`;
  const emailed = await sendEmail(fairInviteEmail(parsed.data.email, { university: p?.university ?? "A university", fair: p?.fair ?? "a job fair", link }), ctx.requestId);
  return { ok: true, data: { link, emailed } };
}

// Student and recruiter sides of a fair
export async function acceptFairInvite(token: string): Promise<ActionResult<string>> {
  return rpcAction({ name: "fair.accept_invite", schema: z.string().min(20).max(100), input: token, fn: "accept_fair_invite", args: (v) => ({ p_token_hash: sha256Hex(v) }), revalidate: ["/recruit"] });
}
export async function joinQueue(boothId: string): Promise<ActionResult<number>> {
  return rpcAction({ name: "fair.join", schema: uuid, input: boothId, fn: "join_fair_queue", args: (v) => ({ p_booth: v }) });
}
export async function leaveBooth(boothId: string): Promise<ActionResult> {
  return rpcAction({ name: "fair.leave", schema: uuid, input: boothId, fn: "leave_fair_booth", args: (v) => ({ p_booth: v }) });
}
export async function answerCall(queueId: string): Promise<ActionResult<string>> {
  return rpcAction({ name: "fair.answer", schema: uuid, input: queueId, fn: "answer_fair_call", args: (v) => ({ p_queue: v }) });
}
export async function bookSlot(slotId: string): Promise<ActionResult> {
  return rpcAction({ name: "fair.book", schema: uuid, input: slotId, fn: "book_fair_slot", args: (v) => ({ p_slot: v }) });
}
export async function callNext(boothId: string): Promise<ActionResult<string>> {
  return rpcAction({ name: "fair.call_next", schema: uuid, input: boothId, fn: "fair_call_next", args: (v) => ({ p_booth: v }) });
}
export async function markFair(input: { kind: "done" | "held"; id: string }): Promise<ActionResult> {
  return rpcAction({ name: "fair.mark", schema: z.object({ kind: z.enum(["done", "held"]), id: uuid }), input, fn: "fair_mark", args: (v) => ({ p_kind: v.kind, p_id: v.id }) });
}
export async function saveBooth(input: { boothId: string; roles: string; about?: string }): Promise<ActionResult> {
  return rpcAction({ name: "fair.booth", schema: z.object({ boothId: uuid, roles: z.string().max(900), about: z.string().max(1000).optional() }), input, fn: "save_booth", args: (v) => ({ p_booth: v.boothId, p_roles: v.roles.split(",").map((r) => r.trim()).filter(Boolean), p_about: v.about ?? "" }) });
}
export async function addSlots(input: { boothId: string; startsAt: string; count: number; minutes: number }): Promise<ActionResult<number>> {
  return rpcAction({ name: "fair.slots", schema: z.object({ boothId: uuid, startsAt: datetime, count: z.coerce.number().int().min(1).max(40), minutes: z.coerce.number().int().min(15).max(60) }), input, fn: "add_booth_slots", args: (v) => ({ p_booth: v.boothId, p_starts: v.startsAt, p_count: v.count, p_minutes: v.minutes }) });
}

// ---------------------------------------------------------------------------
// Students: events, questions
// ---------------------------------------------------------------------------
export async function rsvpEvent(id: string): Promise<ActionResult> {
  return rpcAction({ name: "event.rsvp", schema: uuid, input: id, fn: "rsvp_event", args: (v) => ({ p_id: v }), revalidate: ["/events"] });
}
export async function cancelRsvp(id: string): Promise<ActionResult> {
  return rpcAction({ name: "event.cancel_rsvp", schema: uuid, input: id, fn: "cancel_rsvp", args: (v) => ({ p_id: v }), revalidate: ["/events"] });
}
export async function checkIn(input: { id: string; token: string }): Promise<ActionResult<string>> {
  return rpcAction({ name: "event.check_in", schema: z.object({ id: uuid, token: z.string().regex(/^[0-9a-f]{24}$/, "That code isn't valid; scan the screen again.") }), input, fn: "check_in_event", args: (v) => ({ p_id: v.id, p_token: v.token }) });
}
export async function answerQuestion(input: { questionId: string; option: number | null }): Promise<ActionResult> {
  return rpcAction({ name: "uni.answer_question", schema: z.object({ questionId: uuid, option: z.number().int().min(0).max(5).nullable() }), input, fn: "answer_uni_question", args: (v) => ({ p_question: v.questionId, p_option: v.option }), revalidate: ["/feed"] });
}
export async function dismissQuestions(): Promise<ActionResult> {
  return rpcAction({ name: "uni.dismiss_questions", schema: z.literal(true), input: true, fn: "set_ui_state", args: () => ({ p_key: "uni_questions_dismissed", p_value: true }), revalidate: ["/feed"] });
}

// ---------------------------------------------------------------------------
// Staff (/ops/universities)
// ---------------------------------------------------------------------------
const decideSchema = z.object({ id: uuid, approve: z.boolean(), reason });
export async function decideClaim(input: z.input<typeof decideSchema>): Promise<ActionResult> {
  return rpcAction({ name: "ops.uni_claim", schema: decideSchema, input, fn: "decide_uni_claim", args: (v) => ({ p_id: v.id, p_approve: v.approve, p_reason: v.reason }), revalidate: ["/ops/universities"] });
}
export async function decideDomain(input: z.input<typeof decideSchema>): Promise<ActionResult> {
  return rpcAction({ name: "ops.uni_domain", schema: decideSchema, input, fn: "decide_uni_domain", args: (v) => ({ p_id: v.id, p_approve: v.approve, p_reason: v.reason }), revalidate: ["/ops/universities"] });
}
export async function decideFinalYear(input: z.input<typeof decideSchema>): Promise<ActionResult> {
  return rpcAction({ name: "ops.uni_final_year", schema: decideSchema, input, fn: "decide_final_year_batch", args: (v) => ({ p_id: v.id, p_approve: v.approve, p_reason: v.reason }), revalidate: ["/ops/universities"] });
}
export async function opsRemoveQuestion(input: { id: string; reason: string }): Promise<ActionResult> {
  return rpcAction({ name: "ops.uni_question", schema: z.object({ id: uuid, reason }), input, fn: "ops_remove_uni_question", args: (v) => ({ p_id: v.id, p_reason: v.reason }), revalidate: ["/ops/universities"] });
}

// ---------------------------------------------------------------------------
// Branding and page images: re-encoded to WebP by sharp, stored in the university's folder of
// the public university-media bucket (the storage policy needs an owner/admin on two-factor)
// ---------------------------------------------------------------------------
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export async function uploadUniImage(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const ctx = await actionContext("uni.upload_image");
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  if (!["logo", "cover", "page"].includes(kind) || !(file instanceof File) || file.size === 0 || file.size > IMAGE_MAX_BYTES) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Choose a JPEG, PNG or WebP image up to 8 MB.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data: uni } = await session.supabase.rpc("my_uni" as never);
  const u = uni as { university_id?: string; role?: string } | null;
  if (!u?.university_id || !["owner", "admin"].includes(u.role ?? "")) {
    ctx.done("refused", { error_code: "forbidden", user_id: session.userId });
    return fail("forbidden", "Only the owner and admins change branding and page images.");
  }
  const { reencodeImage, reencodeToFit, ImageRejected } = await import("@/lib/images/reencode");
  let data: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    data = kind === "logo" ? await reencodeImage(input, "avatar") : kind === "cover" ? await reencodeImage(input, "cover") : (await reencodeToFit(input)).data;
  } catch (err) {
    ctx.done("refused", { error_code: err instanceof ImageRejected ? err.message : "decode_failed", user_id: session.userId });
    return fail("invalid_file", "That image couldn't be read. Use a JPEG, PNG or WebP up to 6,000 px.");
  }
  const path = `${u.university_id}/${randomUUID()}.webp`;
  const upload = await session.supabase.storage.from("university-media").upload(path, data, { contentType: "image/webp", upsert: false });
  if (upload.error) {
    ctx.done("error", { error_code: "upload_failed", user_id: session.userId });
    return fail("unavailable", "Couldn't store the image. Try again.", { requestId: ctx.requestId });
  }
  if (kind === "page") {
    ctx.done("ok", { user_id: session.userId });
    return { ok: true, data: { path } };
  }
  const result = await call(ctx, session.supabase, session.userId, "set_branding_image", { p_kind: kind, p_path: path }, ["/uni/settings/branding"]);
  return result.ok ? { ok: true, data: { path } } : result;
}
export async function clearBrandingImage(kind: "logo" | "cover"): Promise<ActionResult> {
  return rpcAction({ name: "uni.clear_image", schema: z.enum(["logo", "cover"]), input: kind, fn: "set_branding_image", args: (v) => ({ p_kind: v, p_path: null }), revalidate: ["/uni/settings/branding"] });
}

/** The organiser's rotating check-in QR (30-second windows): the code comes from SQL, the QR is drawn here. */
export async function checkinCode(eventId: string): Promise<ActionResult<{ qr: string; url: string; changesAt: string; going: number; checkedIn: number }>> {
  const ctx = await actionContext("event.checkin_code");
  const parsed = uuid.safeParse(eventId);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Unknown event.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<{ token: string; changes_at: string; going: number; checked_in: number }>(ctx, session.supabase, session.userId, "event_checkin_code", { p_id: parsed.data });
  if (!result.ok) return result;
  const { qrDataUri } = await import("@/lib/cv/qr");
  const url = `${ctx.origin}/events/${parsed.data}/attend?t=${result.data.token}`;
  return { ok: true, data: { qr: await qrDataUri(url), url, changesAt: result.data.changes_at, going: result.data.going, checkedIn: result.data.checked_in } };
}
