/** Client-safe recruiter-portal constants and wording (PRD 5.20): no server imports. */

export const ORG_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;
export type OrgSize = (typeof ORG_SIZES)[number];

export type OrgStatus = "pending" | "verified" | "suspended" | "rejected";
export type OrgRole = "admin" | "recruiter" | "billing";
export const ORG_ROLE_LABELS: Record<OrgRole, string> = { admin: "Admin", recruiter: "Recruiter", billing: "Billing" };
export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  pending: "Waiting for verification",
  verified: "Verified",
  suspended: "Suspended",
  rejected: "Not verified",
};

export const TIERS = ["raw", "spark", "flare", "shine", "radiant", "luminary"] as const;
export type TierKey = (typeof TIERS)[number];
export const TIER_LABELS: Record<TierKey, string> = {
  raw: "Raw",
  spark: "Spark",
  flare: "Flare",
  shine: "Shine",
  radiant: "Radiant",
  luminary: "Luminary",
};

export const AVAILABILITY = ["internship", "full_time", "part_time"] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const AVAILABILITY_LABELS: Record<Availability, string> = { internship: "Internship", full_time: "Full-time", part_time: "Part-time" };

export const ACTIVE_DAYS = [30, 90, 180] as const;

export const JOB_TYPES = ["internship", "full_time", "part_time"] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABELS: Record<JobType, string> = { internship: "Internship", full_time: "Full-time", part_time: "Part-time" };
export type JobStatus = "draft" | "live" | "closed";

export const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;
export type Stage = (typeof STAGES)[number] | "withdrawn";
export const STAGE_LABELS: Record<Stage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
export const REJECT_REASONS = [
  { value: "skills_gap", label: "Skills gap" },
  { value: "position_filled", label: "Position filled" },
  { value: "other", label: "Other" },
] as const;

export type ContactStatus = "pending" | "accepted" | "declined" | "expired";
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  pending: "Waiting for an answer",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

/** Templates for the contact message (PRD 5.20: "templates provided"); the recruiter edits them. */
export const CONTACT_TEMPLATES = [
  {
    key: "internship",
    label: "Internship",
    text: "Hi, we're hiring a [role] intern at [company] for [duration]. Your verified work in [skill] stands out. Would you be open to a short chat about it?",
  },
  {
    key: "full_time",
    label: "Full-time role",
    text: "Hi, we're growing our team at [company] and looking for a [role]. Your verified projects in [skill] match what we need. Could we talk about the role this week?",
  },
  {
    key: "project",
    label: "Paid project",
    text: "Hi, we have a paid [duration] project at [company] that needs [skill]. Your work on Skilient caught our eye. Interested in hearing the details?",
  },
] as const;

export const CONTACT_LIMITS = { minMessage: 50, maxMessage: 1000, expiryDays: 14, cooloffDays: 90 } as const;
export const DESCRIPTION_LIMITS = { min: 50, max: 5000 } as const;

export const OUTCOME_ANSWERS = [
  { value: "yes", label: "Yes, meeting expectations" },
  { value: "partly", label: "Partly" },
  { value: "no", label: "No" },
  { value: "left", label: "They left" },
] as const;

export type CompetitionStatus = "draft" | "in_review" | "rejected" | "approved" | "live" | "frozen" | "judged";
export const COMPETITION_STATUS_LABELS: Record<CompetitionStatus, string> = {
  draft: "Draft",
  in_review: "With a Skilient reviewer",
  rejected: "Changes needed",
  approved: "Approved, starts soon",
  live: "Live",
  frozen: "Submissions closed",
  judged: "Results out",
};
export const COMPETITION_TEMPLATES = [
  {
    key: "ship-a-feature",
    label: "Ship a feature",
    brief: "Build [feature] for an existing open-source app of your choice. Submit a public repository with a README that explains how to run it and what you decided not to build. We'll judge correctness, code quality and how clearly you explain your work.",
  },
  {
    key: "fix-the-bug",
    label: "Find and fix",
    brief: "We publish a small app with five planted bugs. Find and fix as many as you can, write a test for each and explain the root cause in the pull request. We'll judge the bugs fixed, the tests and the explanations.",
  },
] as const;

export const WEBHOOK_EVENTS = ["application.created", "contact.accepted"] as const;

export const SKILL_LEVEL_LABELS: Record<number, string> = { 1: "L1", 2: "L2", 3: "L3", 4: "L4" };

export interface TalentFilters {
  skills?: { skill: string; min_level: number }[];
  code_check?: boolean;
  universities?: string[];
  departments?: string[];
  batch_from?: number;
  batch_to?: number;
  min_tier?: TierKey;
  active_days?: (typeof ACTIVE_DAYS)[number];
  availability?: Availability[];
  city?: string;
  remote?: boolean;
}

/** `?skills=react:3,python:2&code=1&availability=internship,part_time&active=90…` ↔ filters. */
export function filtersFromParams(sp: Record<string, string | string[] | undefined>): TalentFilters {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const list = (k: string) => one(k)?.split(",").map((x) => x.trim()).filter(Boolean);
  const f: TalentFilters = {};
  const skills = list("skills")
    ?.map((pair) => {
      const [skill, level] = pair.split(":");
      const n = Number(level ?? 1);
      return /^[a-z0-9][a-z0-9-]{0,39}$/.test(skill ?? "") && n >= 1 && n <= 4 ? { skill: skill as string, min_level: n } : null;
    })
    .filter((x): x is { skill: string; min_level: number } => x !== null)
    .slice(0, 10);
  if (skills?.length) f.skills = skills;
  if (one("code") === "1") f.code_check = true;
  const unis = list("uni")?.filter((u) => /^[0-9a-f-]{36}$/.test(u)).slice(0, 50);
  if (unis?.length) f.universities = unis;
  const depts = list("dept")?.slice(0, 30);
  if (depts?.length) f.departments = depts;
  const from = Number(one("from"));
  const to = Number(one("to"));
  if (Number.isInteger(from) && from >= 1980 && from <= 2100) f.batch_from = from;
  if (Number.isInteger(to) && to >= 1980 && to <= 2100) f.batch_to = to;
  const tier = one("tier");
  if (tier && (TIERS as readonly string[]).includes(tier)) f.min_tier = tier as TierKey;
  const active = Number(one("active"));
  if ((ACTIVE_DAYS as readonly number[]).includes(active)) f.active_days = active as (typeof ACTIVE_DAYS)[number];
  const avail = list("avail")?.filter((a): a is Availability => (AVAILABILITY as readonly string[]).includes(a));
  if (avail?.length) f.availability = avail;
  const city = one("city");
  if (city && city.length >= 2 && city.length <= 60) f.city = city;
  if (one("remote") === "1") f.remote = true;
  return f;
}

export function filtersToParams(f: TalentFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.skills?.length) p.set("skills", f.skills.map((s) => `${s.skill}:${s.min_level}`).join(","));
  if (f.code_check) p.set("code", "1");
  if (f.universities?.length) p.set("uni", f.universities.join(","));
  if (f.departments?.length) p.set("dept", f.departments.join(","));
  if (f.batch_from) p.set("from", String(f.batch_from));
  if (f.batch_to) p.set("to", String(f.batch_to));
  if (f.min_tier) p.set("tier", f.min_tier);
  if (f.active_days) p.set("active", String(f.active_days));
  if (f.availability?.length) p.set("avail", f.availability.join(","));
  if (f.city) p.set("city", f.city);
  if (f.remote) p.set("remote", "1");
  return p;
}
