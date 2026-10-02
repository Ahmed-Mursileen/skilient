"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { rpcAction } from "@/lib/actions/recruit-run";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { sha256Hex } from "@/lib/data/recruit-public";
import { sendEmail } from "@/lib/email/send";
import { orgInviteEmail } from "@/lib/email/templates";
import {
  ACTIVE_DAYS,
  AVAILABILITY,
  CONTACT_LIMITS,
  DESCRIPTION_LIMITS,
  JOB_TYPES,
  ORG_SIZES,
  STAGES,
  TIERS,
  WEBHOOK_EVENTS,
} from "@/lib/recruit/constants";

/**
 * Recruiter-portal actions (PRD 5.20). Validation here is for fast feedback; each SQL function
 * behind them (supabase/migrations/20261013..16_recruiter_*.sql) re-checks the role, plan, ownership
 * and every limit, so nothing here is trusted by the database.
 */

const uuid = z.uuid();
const skillId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: at least ${min} characters.`).max(max, `${label}: at most ${max} characters.`);
const tier = z.enum(TIERS);

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------
const orgSchema = z.object({
  name: text(2, 80, "Company name"),
  website: z.string().trim().regex(/^https:\/\/\S+$/, "Enter the website starting with https://").max(200),
  industry: text(2, 60, "Industry"),
  size: z.enum(ORG_SIZES, { error: "Pick the company size." }),
  city: text(2, 60, "City"),
  signerRole: text(2, 60, "Your role"),
  linkedinUrl: z.union([z.literal(""), z.string().trim().regex(/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/\S+$/, "Enter a LinkedIn page address.")]),
  registrationNumber: z.string().trim().max(60, "At most 60 characters."),
});
export type OrgInput = z.input<typeof orgSchema>;

export async function createOrganization(input: OrgInput): Promise<ActionResult<string>> {
  return rpcAction<typeof orgSchema, string>({
    name: "recruit.create_org",
    schema: orgSchema,
    input,
    fn: "create_organization",
    args: (v) => ({
      p: {
        name: v.name,
        website: v.website,
        industry: v.industry,
        size: v.size,
        city: v.city,
        signer_role: v.signerRole,
        linkedin_url: v.linkedinUrl,
        registration_number: v.registrationNumber,
      },
    }),
    revalidate: ["/recruit", "/org/join"],
  });
}

const companySchema = z.object({
  about: z.string().trim().max(1500, "Keep the about text under 1,500 characters."),
  locations: z.array(text(2, 60, "Location")).max(10, "Up to 10 locations."),
  industry: text(2, 60, "Industry"),
  size: z.enum(ORG_SIZES),
  linkedinUrl: orgSchema.shape.linkedinUrl,
});
export async function updateCompanyPage(input: z.input<typeof companySchema>): Promise<ActionResult> {
  return rpcAction({
    name: "recruit.update_company",
    schema: companySchema,
    input,
    fn: "update_company_page",
    args: (v) => ({ p: { about: v.about, locations: v.locations, industry: v.industry, size: v.size, linkedin_url: v.linkedinUrl } }),
    revalidate: ["/org/settings", "/recruit"],
  });
}

// ---------------------------------------------------------------------------
// Members and invites (the token is generated here, emailed, and only its hash is stored)
// ---------------------------------------------------------------------------
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  role: z.enum(["admin", "recruiter", "billing"]),
});
export async function inviteMember(input: z.input<typeof inviteSchema>): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const ctx = await actionContext("recruit.invite_member");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the email address.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const token = randomBytes(32).toString("base64url");
  const result = await call<string>(ctx, session.supabase, session.userId, "invite_org_member", {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_token_hash: sha256Hex(token),
  }, ["/org/members"]);
  if (!result.ok) return result;
  const { data: org } = await session.supabase.rpc("my_org");
  const orgName = (org as { name?: string } | null)?.name ?? "your company";
  const link = `${ctx.origin}/signup/recruiter?invite=${token}`;
  const emailed = await sendEmail(orgInviteEmail(parsed.data.email, { orgName, role: parsed.data.role, link }), ctx.requestId);
  // The admin who made the invite also gets the link, to paste if the email is slow or unconfigured.
  return { ok: true, data: { link, emailed } };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.revoke_invite", schema: uuid, input: id, fn: "revoke_org_invite", args: (v) => ({ p_id: v }), revalidate: ["/org/members"] });
}
export async function acceptInvite(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.accept_invite", schema: uuid, input: id, fn: "accept_org_invite", args: (v) => ({ p_id: v }), revalidate: ["/recruit", "/org/join", "/org/members"] });
}
export async function setMemberRole(userId: string, role: "admin" | "recruiter" | "billing"): Promise<ActionResult> {
  return rpcAction({
    name: "recruit.set_member_role",
    schema: z.object({ userId: uuid, role: z.enum(["admin", "recruiter", "billing"]) }),
    input: { userId, role },
    fn: "set_org_member_role",
    args: (v) => ({ p_user: v.userId, p_role: v.role }),
    revalidate: ["/org/members"],
  });
}
export async function removeMember(userId: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.remove_member", schema: uuid, input: userId, fn: "remove_org_member", args: (v) => ({ p_user: v }), revalidate: ["/org/members"] });
}

// ---------------------------------------------------------------------------
// Shortlists, notes, contact
// ---------------------------------------------------------------------------
const listName = text(1, 60, "List name");
export async function createShortlist(name: string): Promise<ActionResult<string>> {
  return rpcAction<typeof listName, string>({ name: "recruit.create_shortlist", entitlement: "recruit.shortlists", schema: listName, input: name, fn: "create_shortlist", args: (v) => ({ p_name: v }), revalidate: ["/recruit/shortlists"] });
}
export async function renameShortlist(id: string, name: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.rename_shortlist", entitlement: "recruit.shortlists", schema: z.object({ id: uuid, name: listName }), input: { id, name }, fn: "rename_shortlist", args: (v) => ({ p_id: v.id, p_name: v.name }), revalidate: ["/recruit/shortlists"] });
}
export async function deleteShortlist(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.delete_shortlist", schema: uuid, input: id, fn: "delete_shortlist", args: (v) => ({ p_id: v }), revalidate: ["/recruit/shortlists"] });
}
export async function addToShortlist(listId: string, studentId: string): Promise<ActionResult<string | null>> {
  return rpcAction<z.ZodObject<{ listId: z.ZodUUID; studentId: z.ZodUUID }>, string | null>({
    name: "recruit.shortlist_add", entitlement: "recruit.shortlists",
    schema: z.object({ listId: uuid, studentId: uuid }),
    input: { listId, studentId },
    fn: "add_to_shortlist",
    args: (v) => ({ p_list: v.listId, p_student: v.studentId }),
    revalidate: ["/recruit/shortlists", `/recruit/candidates/${studentId}`],
  });
}
export async function removeFromShortlist(itemId: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.shortlist_remove", schema: uuid, input: itemId, fn: "remove_from_shortlist", args: (v) => ({ p_item: v }), revalidate: ["/recruit/shortlists"] });
}
export async function reorderShortlist(listId: string, itemIds: string[]): Promise<ActionResult> {
  return rpcAction({
    name: "recruit.shortlist_reorder", entitlement: "recruit.shortlists",
    schema: z.object({ listId: uuid, itemIds: z.array(uuid).max(500) }),
    input: { listId, itemIds },
    fn: "reorder_shortlist",
    args: (v) => ({ p_list: v.listId, p_items: v.itemIds }),
    revalidate: [],
  });
}
export async function addNote(studentId: string, body: string): Promise<ActionResult<string>> {
  return rpcAction<z.ZodObject<{ studentId: z.ZodUUID; body: z.ZodString }>, string>({
    name: "recruit.add_note", entitlement: "recruit.shortlists",
    schema: z.object({ studentId: uuid, body: text(1, 2000, "Note") }),
    input: { studentId, body },
    fn: "add_note",
    args: (v) => ({ p_student: v.studentId, p_body: v.body }),
    revalidate: [`/recruit/candidates/${studentId}`],
  });
}
export async function deleteNote(noteId: string, studentId: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.delete_note", schema: uuid, input: noteId, fn: "delete_note", args: (v) => ({ p_id: v }), revalidate: [`/recruit/candidates/${studentId}`] });
}

const contactSchema = z.object({
  studentId: uuid,
  role: text(2, 80, "Role or opportunity"),
  message: z
    .string()
    .trim()
    .min(CONTACT_LIMITS.minMessage, `Write at least ${CONTACT_LIMITS.minMessage} characters about the role.`)
    .max(CONTACT_LIMITS.maxMessage, `Keep the message under ${CONTACT_LIMITS.maxMessage} characters.`),
});
export async function sendContactRequest(input: z.input<typeof contactSchema>): Promise<ActionResult<string>> {
  return rpcAction<typeof contactSchema, string>({
    name: "recruit.send_contact", entitlement: "contact.credits",
    schema: contactSchema,
    input,
    fn: "send_contact_request",
    args: (v) => ({ p_student: v.studentId, p_role: v.role, p_message: v.message }),
    revalidate: [`/recruit/candidates/${input.studentId}`, "/recruit/contacts", "/org/plan"],
  });
}

// Saved searches ------------------------------------------------------------------
const filtersSchema = z.object({
  skills: z.array(z.object({ skill: skillId, min_level: z.number().int().min(1).max(4) })).max(10).optional(),
  code_check: z.boolean().optional(),
  universities: z.array(uuid).max(50).optional(),
  departments: z.array(z.string().max(80)).max(30).optional(),
  batch_from: z.number().int().min(1980).max(2100).optional(),
  batch_to: z.number().int().min(1980).max(2100).optional(),
  min_tier: tier.optional(),
  active_days: z.union([z.literal(ACTIVE_DAYS[0]), z.literal(ACTIVE_DAYS[1]), z.literal(ACTIVE_DAYS[2])]).optional(),
  availability: z.array(z.enum(AVAILABILITY)).max(3).optional(),
  city: z.string().trim().min(2).max(60).optional(),
  remote: z.boolean().optional(),
});
export async function saveSearch(name: string, filters: z.input<typeof filtersSchema>, frequency: "daily" | "weekly"): Promise<ActionResult<string>> {
  return rpcAction<z.ZodObject<{ name: z.ZodString; filters: typeof filtersSchema; frequency: z.ZodEnum<{ daily: "daily"; weekly: "weekly" }> }>, string>({
    name: "recruit.save_search", entitlement: "recruit.saved_searches",
    schema: z.object({ name: text(1, 60, "Name"), filters: filtersSchema, frequency: z.enum(["daily", "weekly"]) }),
    input: { name, filters, frequency },
    fn: "save_search",
    args: (v) => ({ p_name: v.name, p_filters: v.filters, p_frequency: v.frequency }),
    revalidate: ["/recruit/search"],
  });
}
export async function deleteSavedSearch(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.delete_saved_search", schema: uuid, input: id, fn: "delete_saved_search", args: (v) => ({ p_id: v }), revalidate: ["/recruit/search"] });
}

// ---------------------------------------------------------------------------
// Jobs and the pipeline
// ---------------------------------------------------------------------------
const jobSchema = z
  .object({
    title: text(3, 100, "Title"),
    type: z.enum(JOB_TYPES, { error: "Pick the job type." }),
    location: z.string().trim().max(80),
    remote: z.boolean(),
    salaryMin: z.number({ error: "Add the pay range: jobs without pay aren't allowed." }).int().min(1, "Add the pay range: jobs without pay aren't allowed."),
    salaryMax: z.number({ error: "Add the pay range: jobs without pay aren't allowed." }).int().min(1, "Add the pay range: jobs without pay aren't allowed."),
    currency: z.enum(["PKR", "USD"]),
    payPeriod: z.enum(["month", "year"]),
    minTier: z.union([tier, z.literal("")]),
    skills: z.array(z.object({ skill: skillId, min_level: z.number().int().min(1).max(4) })).max(10, "Up to 10 skills."),
    openings: z.number().int().min(1, "1 to 100 openings.").max(100, "1 to 100 openings."),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the deadline."),
    description: z.string().trim().min(DESCRIPTION_LIMITS.min, `Describe the role in at least ${DESCRIPTION_LIMITS.min} characters.`).max(DESCRIPTION_LIMITS.max, `Keep it under ${DESCRIPTION_LIMITS.max} characters.`),
  })
  .refine((v) => v.salaryMax >= v.salaryMin, { path: ["salaryMax"], message: "The top of the range can't be below the bottom." })
  .refine((v) => v.remote || v.location.length >= 2, { path: ["location"], message: "Add a location or mark the role remote." });
export type JobInput = z.input<typeof jobSchema>;

export async function saveJob(id: string | null, input: JobInput): Promise<ActionResult<string>> {
  return rpcAction<z.ZodObject<{ id: z.ZodNullable<z.ZodUUID>; v: typeof jobSchema }>, string>({
    name: "recruit.save_job",
    unwrap: "v",
    schema: z.object({ id: uuid.nullable(), v: jobSchema }),
    input: { id, v: input },
    fn: "save_job",
    args: ({ id: jobId, v }) => ({
      p_id: jobId,
      p: {
        title: v.title,
        type: v.type,
        location: v.location,
        remote: v.remote,
        salary_min: v.salaryMin,
        salary_max: v.salaryMax,
        currency: v.currency,
        pay_period: v.payPeriod,
        min_tier: v.minTier,
        min_skill_levels: v.skills,
        openings: v.openings,
        deadline: v.deadline,
        description: v.description,
      },
    }),
    revalidate: ["/recruit/jobs"],
  });
}
export async function publishJob(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.publish_job", schema: uuid, input: id, fn: "publish_job", args: (v) => ({ p_id: v }), revalidate: ["/recruit/jobs", `/recruit/jobs/${id}`, "/opportunities/jobs"] });
}
export async function closeJob(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.close_job", schema: uuid, input: id, fn: "close_job", args: (v) => ({ p_id: v }), revalidate: ["/recruit/jobs", `/recruit/jobs/${id}`, "/opportunities/jobs"] });
}

const stage = z.enum(STAGES);
const reason = z.enum(["skills_gap", "position_filled", "other"]).nullable();
export async function moveApplication(jobId: string, applicationId: string, to: (typeof STAGES)[number], why: string | null = null): Promise<ActionResult> {
  return rpcAction({
    name: "recruit.move_application",
    schema: z.object({ applicationId: uuid, to: stage, why: reason }),
    input: { applicationId, to, why },
    fn: "move_application",
    args: (v) => ({ p_id: v.applicationId, p_stage: v.to, p_reason: v.why }),
    revalidate: [`/recruit/jobs/${jobId}/applicants`],
  });
}
export async function bulkMoveApplications(jobId: string, ids: string[], to: (typeof STAGES)[number], why: string | null = null): Promise<ActionResult<number>> {
  return rpcAction<z.ZodObject<{ ids: z.ZodArray<z.ZodUUID>; to: typeof stage; why: typeof reason }>, number>({
    name: "recruit.bulk_move",
    schema: z.object({ ids: z.array(uuid).min(1, "Pick at least one applicant.").max(100), to: stage, why: reason }),
    input: { ids, to, why },
    fn: "bulk_move_applications",
    args: (v) => ({ p_ids: v.ids, p_stage: v.to, p_reason: v.why }),
    revalidate: [`/recruit/jobs/${jobId}/applicants`],
  });
}
export async function inviteToApply(jobId: string, studentIds: string[]): Promise<ActionResult<number>> {
  return rpcAction<z.ZodObject<{ jobId: z.ZodUUID; studentIds: z.ZodArray<z.ZodUUID> }>, number>({
    name: "recruit.invite_to_apply",
    schema: z.object({ jobId: uuid, studentIds: z.array(uuid).min(1, "Pick at least one person.").max(50) }),
    input: { jobId, studentIds },
    fn: "invite_to_apply",
    args: (v) => ({ p_job: v.jobId, p_students: v.studentIds }),
    revalidate: ["/recruit/shortlists"],
  });
}
export async function answerHireOutcome(hireId: string, answer: "yes" | "partly" | "no" | "left"): Promise<ActionResult> {
  return rpcAction({
    name: "recruit.hire_outcome",
    schema: z.object({ hireId: uuid, answer: z.enum(["yes", "partly", "no", "left"]) }),
    input: { hireId, answer },
    fn: "answer_hire_outcome",
    args: (v) => ({ p_hire: v.hireId, p_answer: v.answer }),
    revalidate: ["/recruit", "/recruit/analytics"],
  });
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------
const competitionSchema = z.object({
  title: text(3, 100, "Title"),
  role: text(2, 80, "Role"),
  skills: z.array(z.object({ skill: skillId, min_level: z.number().int().min(1).max(4) })).min(1, "Add the skills the brief tests.").max(10),
  brief: z.string().trim().min(100, "The brief is at least 100 characters.").max(6000, "Keep the brief under 6,000 characters."),
  briefTemplate: z.string().max(40),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the start date."),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the end date."),
  teamSize: z.number().int().min(1, "Teams are 1 to 3 people.").max(3, "Teams are 1 to 3 people."),
  universities: z.array(uuid).max(50),
  minTier: z.union([tier, z.literal("")]),
  prize: text(3, 300, "Prize"),
  rubric: z
    .array(z.object({ criterion: text(2, 80, "Criterion"), weight: z.number().int().min(1).max(100) }))
    .min(2, "Add 2 to 6 criteria.")
    .max(6, "Add 2 to 6 criteria.")
    .refine((r) => r.reduce((n, c) => n + c.weight, 0) === 100, { message: "The weights must add up to 100." }),
});
export type CompetitionInput = z.input<typeof competitionSchema>;
export async function saveCompetition(id: string | null, input: CompetitionInput): Promise<ActionResult<string>> {
  return rpcAction<z.ZodObject<{ id: z.ZodNullable<z.ZodUUID>; v: typeof competitionSchema }>, string>({
    name: "recruit.save_competition", entitlement: "competitions.run",
    unwrap: "v",
    schema: z.object({ id: uuid.nullable(), v: competitionSchema }),
    input: { id, v: input },
    fn: "save_competition",
    args: ({ id: cid, v }) => ({
      p_id: cid,
      p: {
        title: v.title,
        role: v.role,
        skills: v.skills,
        brief: v.brief,
        brief_template: v.briefTemplate,
        starts_on: v.startsOn,
        ends_on: v.endsOn,
        team_size: v.teamSize,
        eligible_universities: v.universities,
        min_tier: v.minTier,
        prize: v.prize,
        rubric: v.rubric,
      },
    }),
    revalidate: ["/recruit/competitions"],
  });
}
export async function submitCompetition(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.submit_competition", schema: uuid, input: id, fn: "submit_competition", args: (v) => ({ p_id: v }), revalidate: ["/recruit/competitions", `/recruit/competitions/${id}`] });
}
export async function scoreTeam(competitionId: string, teamId: string, scores: Record<string, number>, feedback: string): Promise<ActionResult> {
  return rpcAction({
    name: "recruit.score_team",
    schema: z.object({ teamId: uuid, scores: z.record(z.string().max(80), z.number().min(0).max(10)), feedback: z.string().trim().max(2000) }),
    input: { teamId, scores, feedback },
    fn: "score_team",
    args: (v) => ({ p_team: v.teamId, p_scores: v.scores, p_feedback: v.feedback }),
    revalidate: [`/recruit/competitions/${competitionId}`],
  });
}
export async function finishCompetition(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.finish_competition", schema: uuid, input: id, fn: "finish_competition", args: (v) => ({ p_id: v }), revalidate: ["/recruit/competitions", `/recruit/competitions/${id}`] });
}

// ---------------------------------------------------------------------------
// API tokens and webhooks (the token and the signing secret are shown once)
// ---------------------------------------------------------------------------
export async function createApiToken(name: string): Promise<ActionResult<{ token: string }>> {
  const token = `skl_${randomBytes(32).toString("base64url")}`;
  const result = await rpcAction<typeof listName, string>({
    name: "recruit.create_token", entitlement: "api.access",
    schema: listName,
    input: name,
    fn: "create_api_token",
    args: (v) => ({ p_name: v, p_token_hash: sha256Hex(token) }),
    revalidate: ["/org/settings/api"],
  });
  return result.ok ? { ok: true, data: { token } } : result;
}
export async function revokeApiToken(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.revoke_token", schema: uuid, input: id, fn: "revoke_api_token", args: (v) => ({ p_id: v }), revalidate: ["/org/settings/api"] });
}
export async function createWebhook(url: string, events: string[]): Promise<ActionResult<{ id: string; secret: string }>> {
  return rpcAction<z.ZodObject<{ url: z.ZodString; events: z.ZodArray<z.ZodEnum<{ "application.created": "application.created"; "contact.accepted": "contact.accepted" }>> }>, { id: string; secret: string }>({
    name: "recruit.create_webhook", entitlement: "api.access",
    schema: z.object({
      url: z.string().trim().regex(/^https:\/\/\S+$/, "The address must start with https://").max(300),
      events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Pick at least one event."),
    }),
    input: { url, events },
    fn: "create_webhook",
    args: (v) => ({ p_url: v.url, p_events: v.events }),
    revalidate: ["/org/settings/api"],
  });
}
export async function deleteWebhook(id: string): Promise<ActionResult> {
  return rpcAction({ name: "recruit.delete_webhook", schema: uuid, input: id, fn: "delete_webhook", args: (v) => ({ p_id: v }), revalidate: ["/org/settings/api"] });
}
