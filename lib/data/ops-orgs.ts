import "server-only";

import type { CompetitionStatus, OrgRole, OrgStatus } from "@/lib/recruit/constants";
import { rpcJson } from "@/lib/data/rpc-json";

/** /ops reads for the recruiter side (PRD 5.20, 5.26): accounts staff, two-factor. */

export interface OpsOrgRow {
  id: string;
  name: string;
  domain: string;
  website: string;
  industry: string;
  size: string;
  city: string;
  status: OrgStatus;
  created_at: string;
  admin_name: string | null;
}
export const getOpsOrgs = async (status: OrgStatus): Promise<OpsOrgRow[]> => rpcJson<OpsOrgRow[]>("ops_orgs", { p_status: status });

export interface OpsOrgCase {
  id: string;
  name: string;
  slug: string;
  domain: string;
  website: string;
  linkedin_url: string | null;
  registration_number: string | null;
  signer_role: string;
  industry: string;
  size: string;
  city: string;
  status: OrgStatus;
  status_reason: string | null;
  created_at: string;
  verified_at: string | null;
  members: { name: string; email: string; role: OrgRole; status: string }[];
  history: { action: string; reason: string; at: string }[];
}
export const getOpsOrgCase = async (id: string): Promise<OpsOrgCase> => rpcJson<OpsOrgCase>("ops_org_case", { p_org: id });

export interface OpsReputation {
  stats: { requests_30d: number; answered_30d: number; response_rate: number | null; decline_rate: number | null; median_response_hours: number | null };
  searches: { mode: string; filters: Record<string, unknown>; results: number; at: string; by: string | null }[];
  reviews: { id: string; status: string; rate: number; requests: number; declined: number; opened_at: string; note: string | null }[];
}
export const getOpsReputation = async (org: string): Promise<OpsReputation> => rpcJson<OpsReputation>("ops_org_reputation", { p_org: org });

export interface SpamReview {
  id: string;
  org_id: string;
  org: string;
  domain: string;
  rate: number;
  requests: number;
  declined: number;
  status: string;
  opened_at: string;
  note: string | null;
}
export const getSpamReviews = async (status: "open" | "cleared" | "suspended"): Promise<SpamReview[]> => rpcJson<SpamReview[]>("ops_spam_reviews", { p_status: status });

export interface OpsCompetition {
  id: string;
  title: string;
  org: string;
  role: string;
  prize: string;
  starts_at: string;
  ends_at: string;
  status: CompetitionStatus;
  brief: string;
  rubric: { criterion: string; weight: number }[];
  skills: { skill: string; min_level: number }[];
}
export const getOpsCompetitions = async (status: CompetitionStatus): Promise<OpsCompetition[]> => rpcJson<OpsCompetition[]>("ops_competitions", { p_status: status });
