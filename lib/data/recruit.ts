import "server-only";

import { cache } from "react";
import type { CompetitionStatus, ContactStatus, JobStatus, JobType, OrgRole, OrgStatus, Stage, TalentFilters, TierKey } from "@/lib/recruit/constants";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rpcJson } from "@/lib/data/rpc-json";
import { createClient } from "@/lib/supabase/server";

/**
 * Recruiter-portal reads (PRD 5.20). Each is one SQL function that checks the caller's
 * organisation, role, two-factor session and plan itself and returns one document (snake_case,
 * as SQL built it); pages format dates with lib/format/time on the server.
 */

export interface MyOrg {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: OrgStatus;
  status_reason: string | null;
  role: OrgRole;
  member_status: "active" | "inactive";
  website: string;
  industry: string;
  size: string;
  city: string;
  about: string | null;
  locations: string[];
  linkedin_url: string | null;
}

/** The signed-in recruiter's organisation, or null when they haven't set one up (or joined). */
export const getMyOrg = cache(async (): Promise<MyOrg | null> => rpcJson<MyOrg | null>("my_org"));

export interface OrgInvite {
  id: string;
  org_name: string;
  role: OrgRole;
  expires_at: string;
}
export const getMyOrgInvites = async (): Promise<OrgInvite[]> => rpcJson<OrgInvite[]>("my_org_invites");

export interface OrgPlan {
  seats_limit: number | null;
  seats_used: number;
  contact_credits_limit: number | null;
  contact_credits_used: number;
  active_posts_limit: number | null;
  entitlements: Record<string, boolean>;
}
export const getOrgPlan = async (): Promise<OrgPlan> => rpcJson<OrgPlan>("org_plan");

export interface OrgMembers {
  seats_limit: number | null;
  seats_used: number;
  members: { user_id: string; name: string; email: string; role: OrgRole; status: "active" | "inactive"; joined_at: string }[];
  invites: { id: string; email: string; role: OrgRole; expires_at: string; state: "pending" | "accepted" | "revoked" | "expired" }[];
}
export const getOrgMembers = async (): Promise<OrgMembers> => rpcJson<OrgMembers>("org_members_list");

// ---------------------------------------------------------------------------
// Talent
// ---------------------------------------------------------------------------
export interface TalentSkill {
  name: string;
  level: number;
  code_check: boolean;
}
export interface TalentRow {
  /** Present only in full results. */
  id?: string;
  name?: string;
  username?: string | null;
  avatar_path?: string | null;
  contacted?: boolean;
  tier: TierKey | null;
  skills: TalentSkill[];
  university: string;
  department: string | null;
  batch: number | null;
  activity: string;
  why: string;
}
export interface TalentPage {
  total: number;
  results: TalentRow[];
  full_access: boolean;
}

export const exploreTalent = async (filters: TalentFilters, offset = 0): Promise<TalentPage> =>
  rpcJson<TalentPage>("talent_explore", { p_filters: filters, p_offset: offset });
export const searchTalent = async (filters: TalentFilters, offset = 0): Promise<TalentPage> =>
  rpcJson<TalentPage>("search_talent", { p_filters: filters, p_offset: offset });

export interface TalentFacets {
  universities: { id: string; name: string }[];
  departments: string[];
  skills: { id: string; name: string }[];
}
export const getTalentFacets = cache(async (): Promise<TalentFacets> => rpcJson<TalentFacets>("talent_facets"));

export interface SavedSearches {
  entitled: boolean;
  items: { id: string; name: string; filters: TalentFilters; frequency: "daily" | "weekly"; last_run_at: string }[];
}
export const getSavedSearches = async (): Promise<SavedSearches> => rpcJson<SavedSearches>("saved_searches_list");

export interface Candidate {
  access: "search" | "contact" | "application";
  person: {
    id: string;
    name: string;
    username: string | null;
    avatar_path: string | null;
    university: string;
    department: string | null;
    batch: number | null;
    looking_for: string[];
    availability: string[];
    city: string | null;
    remote_ok: boolean;
    status: string;
  };
  cv: import("@/lib/cv/types").CvSnapshotV1 | null;
  verify_code: string | null;
  tier: TierKey | null;
  last_contact: {
    status: ContactStatus;
    role_title: string;
    at: string;
    by_name: string | null;
    retry_after: string | null;
    thread_id: string | null;
  } | null;
  shortlists: { id: string; name: string }[];
}
export const getCandidate = async (id: string): Promise<Candidate> => rpcJson<Candidate>("recruit_candidate", { p_student: id });

export interface Note {
  id: string;
  body: string;
  created_at: string;
  author: string | null;
  mine: boolean;
}
export const getNotes = async (studentId: string): Promise<Note[]> => rpcJson<Note[]>("notes_for", { p_student: studentId });

export interface ShortlistSummary {
  id: string;
  name: string;
  count: number;
  created_at: string;
}
export const getShortlists = async (): Promise<ShortlistSummary[]> => rpcJson<ShortlistSummary[]>("shortlists_list");

export interface ShortlistItem {
  id: string;
  visible: boolean;
  student_id: string | null;
  name: string | null;
  university: string | null;
  department: string | null;
  tier: TierKey | null;
  notes: number | null;
  added_by: string | null;
  added_at: string;
}
export const getShortlist = async (id: string): Promise<{ id: string; name: string; items: ShortlistItem[] }> =>
  rpcJson("shortlist_get", { p_list: id });

export interface ActivityItem {
  kind: "viewed" | "contact_sent" | "shortlisted" | "noted" | "invited_to_apply" | "hired";
  at: string;
  actor: string | null;
  student_id: string | null;
  student_name: string | null;
}
export const getOrgActivity = async (): Promise<ActivityItem[]> => rpcJson<ActivityItem[]>("org_activity", { p_limit: 30 });

export interface OrgContact {
  id: string;
  status: ContactStatus;
  role_title: string;
  created_at: string;
  decided_at: string | null;
  by_name: string | null;
  student_id: string | null;
  student_name: string | null;
  thread_id: string | null;
}
export const getOrgContacts = async (): Promise<OrgContact[]> => rpcJson<OrgContact[]>("org_contact_requests");

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export interface JobSummary {
  id: string;
  title: string;
  type: JobType;
  status: JobStatus;
  deadline: string;
  location: string | null;
  remote: boolean;
  created_at: string;
  applicants: number;
  hired: number;
  openings: number;
}
export const getOrgJobs = async (): Promise<{ slots_limit: number | null; jobs: JobSummary[] }> => rpcJson("jobs_for_org");

export interface JobDoc {
  id: string;
  title: string;
  type: JobType;
  location: string | null;
  remote: boolean;
  salary_min: number;
  salary_max: number;
  currency: "PKR" | "USD";
  pay_period: "month" | "year";
  min_tier: TierKey | null;
  min_skill_levels: { skill: string; min_level: number }[];
  openings: number;
  deadline: string;
  description: string;
  status: JobStatus;
}
export const getOrgJob = async (id: string): Promise<JobDoc> => rpcJson<JobDoc>("job_get", { p_id: id });

export interface Applicant {
  id: string;
  student_id: string;
  name: string;
  university: string | null;
  department: string | null;
  batch: number | null;
  tier: TierKey | null;
  note: string | null;
  stage: Stage;
  reject_reason: string | null;
  applied_at: string;
  stage_changed_at: string;
  cv_code: string | null;
  skills: { name: string; level: number }[];
}
export interface ApplicantsDoc {
  job: { id: string; title: string; status: JobStatus; type: JobType; openings: number; min_tier: TierKey | null; min_skill_levels: { skill: string; min_level: number }[] };
  applicants: Applicant[];
}
export const getApplicants = async (jobId: string): Promise<ApplicantsDoc> => rpcJson<ApplicantsDoc>("job_applicants", { p_job: jobId });

export interface HireRow {
  id: string;
  hired_at: string;
  kind: "intern" | "full_time";
  job_title: string | null;
  student_name: string | null;
  asked: boolean;
  answer: "yes" | "partly" | "no" | "left" | null;
  answered_at: string | null;
  due: boolean;
}
export const getHires = async (): Promise<HireRow[]> => rpcJson<HireRow[]>("hires_list");

export interface Analytics {
  locked: boolean;
  days?: number;
  plan: OrgPlan;
  funnel?: { views: number; contacts: number; accepted: number; applied: number; hired: number };
  median_first_response_hours?: number | null;
  median_days_to_hire?: number | null;
  skills_demand?: { skill: string; searches: number }[];
}
export const getAnalytics = async (days: number): Promise<Analytics> => rpcJson<Analytics>("org_analytics", { p_days: days });

// ---------------------------------------------------------------------------
// Competitions and the API
// ---------------------------------------------------------------------------
export interface CompetitionSummary {
  id: string;
  title: string;
  status: CompetitionStatus;
  starts_at: string;
  ends_at: string;
  teams: number;
  review_note: string | null;
}
export const getOrgCompetitions = async (): Promise<{ entitled: boolean; items: CompetitionSummary[] }> => rpcJson("competitions_for_org");

export interface CompetitionManage {
  competition: {
    id: string;
    title: string;
    role: string;
    skills: { skill: string; min_level: number }[];
    brief: string;
    starts_at: string;
    ends_at: string;
    team_size: number;
    min_tier: TierKey | null;
    prize: string;
    rubric: { criterion: string; weight: number }[];
    status: CompetitionStatus;
    review_note: string | null;
    eligible_universities: string[];
  };
  teams: {
    id: string;
    name: string;
    repo_url: string | null;
    submitted_at: string | null;
    frozen_sha: string | null;
    frozen_note: string | null;
    scores: Record<string, number> | null;
    total: number | null;
    feedback: string | null;
    placement: number | null;
    members: string[];
  }[];
}
export const getCompetitionManage = async (id: string): Promise<CompetitionManage> => rpcJson<CompetitionManage>("competition_manage", { p_id: id });

export interface ApiSettings {
  entitled: boolean;
  tokens: { id: string; name: string; created_at: string; last_used_at: string | null; revoked_at: string | null }[];
  webhooks: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    failures: number;
    recent: { event: string; status: string; attempt: number; http: number | null; at: string }[];
  }[];
}
export const getApiSettings = async (): Promise<ApiSettings> => rpcJson<ApiSettings>("api_settings");

/** On /verify/[code]: the candidate's id when the signed-in recruiter's organisation may open them. */
export async function getCandidateForCode(code: string): Promise<string | null> {
  const user = await getCurrentUser();
  if (user?.role !== "recruiter") return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("recruit_candidate_for_code", { p_code: code });
  return typeof data === "string" ? data : null;
}
