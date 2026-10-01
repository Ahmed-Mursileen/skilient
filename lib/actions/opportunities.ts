"use server";

import { z } from "zod";
import { rpcAction } from "@/lib/actions/recruit-run";
import type { ActionResult } from "@/lib/actions/result";
import { AVAILABILITY } from "@/lib/recruit/constants";

/**
 * The student's side of recruiting (PRD 5.20, 5.25): answer contact requests, block companies,
 * apply to jobs, enter competitions, and say what recruiters may know. Each action validates,
 * checks the session and calls one SQL function that re-checks ownership and every limit.
 */

const uuid = z.uuid();

export async function respondContactRequest(id: string, accept: boolean, reason = ""): Promise<ActionResult<string | null>> {
  return rpcAction<z.ZodObject<{ id: z.ZodUUID; accept: z.ZodBoolean; reason: z.ZodString }>, string | null>({
    name: "student.respond_contact",
    schema: z.object({ id: uuid, accept: z.boolean(), reason: z.string().trim().max(500, "Keep the reason under 500 characters.") }),
    input: { id, accept, reason },
    fn: "respond_contact_request",
    args: (v) => ({ p_id: v.id, p_accept: v.accept, p_reason: v.reason || null }),
    revalidate: ["/opportunities/contact_requests", "/chat"],
  });
}
export async function closeContactChat(id: string): Promise<ActionResult> {
  return rpcAction({ name: "student.close_contact_chat", schema: uuid, input: id, fn: "close_contact_chat", args: (v) => ({ p_id: v }), revalidate: ["/chat", "/opportunities/contact_requests"] });
}
export async function blockCompany(orgId: string): Promise<ActionResult> {
  return rpcAction({ name: "student.block_company", schema: uuid, input: orgId, fn: "block_company", args: (v) => ({ p_org: v }), revalidate: ["/settings/privacy", "/opportunities"] });
}
export async function unblockCompany(orgId: string): Promise<ActionResult> {
  return rpcAction({ name: "student.unblock_company", schema: uuid, input: orgId, fn: "unblock_company", args: (v) => ({ p_org: v }), revalidate: ["/settings/privacy", "/opportunities"] });
}

export async function applyToJob(jobId: string, note: string): Promise<ActionResult<string>> {
  return rpcAction<z.ZodObject<{ jobId: z.ZodUUID; note: z.ZodString }>, string>({
    name: "student.apply_to_job",
    schema: z.object({ jobId: uuid, note: z.string().trim().max(300, "Keep the note under 300 characters.") }),
    input: { jobId, note },
    fn: "apply_to_job",
    args: (v) => ({ p_job: v.jobId, p_note: v.note || null }),
    revalidate: ["/opportunities/applications", `/opportunities/jobs/${jobId}`],
  });
}
export async function withdrawJobApplication(id: string): Promise<ActionResult> {
  return rpcAction({ name: "student.withdraw_job_application", schema: uuid, input: id, fn: "withdraw_job_application", args: (v) => ({ p_id: v }), revalidate: ["/opportunities/applications", `/opportunities/applications/${id}`] });
}

// Competitions ----------------------------------------------------------------------
const teamName = z.string().trim().min(2, "Name your team (2 to 60 characters).").max(60, "Name your team (2 to 60 characters).");
export async function createTeam(competitionId: string, name: string): Promise<ActionResult<string>> {
  return rpcAction<z.ZodObject<{ competitionId: z.ZodUUID; name: typeof teamName }>, string>({
    name: "student.create_team",
    schema: z.object({ competitionId: uuid, name: teamName }),
    input: { competitionId, name },
    fn: "create_team",
    args: (v) => ({ p_competition: v.competitionId, p_name: v.name }),
    revalidate: [`/competitions/${competitionId}`],
  });
}
export async function inviteTeamMember(competitionId: string, teamId: string, username: string): Promise<ActionResult> {
  return rpcAction({
    name: "student.invite_team_member",
    schema: z.object({ teamId: uuid, username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Enter a username.") }),
    input: { teamId, username: username.replace(/^@/, "") },
    fn: "invite_team_member",
    args: (v) => ({ p_team: v.teamId, p_username: v.username }),
    revalidate: [`/competitions/${competitionId}`],
  });
}
export async function respondTeamInvite(competitionId: string, teamId: string, accept: boolean): Promise<ActionResult> {
  return rpcAction({
    name: "student.respond_team_invite",
    schema: z.object({ teamId: uuid, accept: z.boolean() }),
    input: { teamId, accept },
    fn: "respond_team_invite",
    args: (v) => ({ p_team: v.teamId, p_accept: v.accept }),
    revalidate: [`/competitions/${competitionId}`, "/opportunities/competitions"],
  });
}
export async function submitRepo(competitionId: string, teamId: string, url: string): Promise<ActionResult> {
  return rpcAction({
    name: "student.submit_repo",
    schema: z.object({ teamId: uuid, url: z.string().trim().regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/, "Paste the repository address, like https://github.com/team/project.") }),
    input: { teamId, url },
    fn: "submit_repo",
    args: (v) => ({ p_team: v.teamId, p_url: v.url }),
    revalidate: [`/competitions/${competitionId}`],
  });
}

// What recruiters may know ------------------------------------------------------------
const prefsSchema = z.object({
  availability: z.array(z.enum(AVAILABILITY)).max(3),
  city: z.string().trim().max(60, "Keep the city under 60 characters.").refine((c) => c === "" || c.length >= 2, "Enter at least 2 characters."),
  remote: z.boolean(),
});
export async function saveRecruiterPrefs(input: z.input<typeof prefsSchema>): Promise<ActionResult> {
  return rpcAction({
    name: "student.save_recruiter_prefs",
    schema: prefsSchema,
    input,
    fn: "save_recruiter_prefs",
    args: (v) => ({ p_availability: v.availability, p_city: v.city || null, p_remote: v.remote }),
    revalidate: ["/settings/profile", "/settings/privacy"],
  });
}
