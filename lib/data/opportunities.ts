import "server-only";

import { cache } from "react";
import type { CompetitionStatus, ContactStatus, JobStatus, JobType, Stage, TierKey } from "@/lib/recruit/constants";
import { rpcJson } from "@/lib/data/rpc-json";

/**
 * The student's side of recruiting (PRD 5.20, 5.25): jobs, applications, contact requests,
 * competitions, company pages and the controls over who can find them. One SQL function each.
 */

export interface PublicJob {
  id: string;
  title: string;
  type: JobType;
  location: string | null;
  remote: boolean;
  salary_min: number;
  salary_max: number;
  currency: "PKR" | "USD";
  pay_period: "month" | "year";
  openings: number;
  deadline: string;
  description: string;
  status: JobStatus;
  min_tier: TierKey | null;
  requirements: { name: string; min_level: number }[];
  unmet: string[];
  org: { id: string; name: string; slug: string; city: string };
  application: { id: string; stage: Stage } | null;
  invited: boolean;
}
export const getPublicJob = async (id: string): Promise<PublicJob> => rpcJson<PublicJob>("job_public", { p_id: id });

export interface ApplicationDoc {
  id: string;
  stage: Stage;
  note: string | null;
  applied_at: string;
  reason: string | null;
  job: { id: string; title: string; type: JobType };
  org: { name: string; slug: string };
  history: { stage: Stage; at: string }[];
}
export const getApplication = async (id: string): Promise<ApplicationDoc> => rpcJson<ApplicationDoc>("application_get", { p_id: id });

export interface MyContactRequest {
  id: string;
  status: ContactStatus;
  role_title: string;
  message: string;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  closed: boolean;
  thread_id: string | null;
  org: { id: string; name: string; slug: string; industry: string; size: string; city: string; verified: boolean; blocked: boolean };
}
export const getMyContactRequests = async (): Promise<MyContactRequest[]> => rpcJson<MyContactRequest[]>("my_contact_requests");

export interface CompanyPage {
  id: string;
  slug: string;
  name: string;
  about: string | null;
  website: string;
  industry: string;
  size: string;
  city: string;
  locations: string[];
  status: string;
  is_member: boolean;
  blocked: boolean;
  roles: { id: string; title: string; type: JobType; location: string | null; remote: boolean; deadline: string }[];
}
export const getCompanyPage = async (slug: string): Promise<CompanyPage> => rpcJson<CompanyPage>("company_page", { p_slug: slug });

export interface PublicCompetition {
  id: string;
  title: string;
  role: string;
  brief: string;
  status: CompetitionStatus;
  prize: string;
  starts_at: string;
  ends_at: string;
  team_size: number;
  min_tier: TierKey | null;
  rubric: { criterion: string; weight: number }[];
  eligible: boolean;
  unmet: string[];
  skills: string[];
  org: { name: string; slug: string };
  team: {
    id: string;
    name: string;
    is_lead: boolean;
    repo_url: string | null;
    submitted_at: string | null;
    frozen_sha: string | null;
    total: number | null;
    placement: number | null;
    feedback: string | null;
    my_status: "invited" | "joined";
    members: { name: string; status: "invited" | "joined" }[];
  } | null;
}
export const getPublicCompetition = async (id: string): Promise<PublicCompetition> => rpcJson<PublicCompetition>("competition_public", { p_id: id });

export const getBlockedCompanies = cache(async (): Promise<{ id: string; name: string; slug: string }[]> => rpcJson("my_blocked_companies"));

export interface ProfileViewers {
  companies_30d: number;
  views_30d: number;
  names_visible: boolean;
  companies: { id: string; name: string; slug: string; last_at: string }[] | null;
}
export const getProfileViewers = async (): Promise<ProfileViewers> => rpcJson<ProfileViewers>("my_profile_viewers");

export interface RecruiterPrefs {
  availability: string[];
  city: string | null;
  remote_ok: boolean;
  recruiter_visible: boolean;
  looking_for: string[];
}
export const getRecruiterPrefs = async (): Promise<RecruiterPrefs> => rpcJson<RecruiterPrefs>("my_recruiter_prefs");
