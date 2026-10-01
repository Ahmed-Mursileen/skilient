/**
 * CvSnapshotV1: what private.cv_snapshot() builds and cv-sign signs (PRD 5.18). Integers and
 * strings only. Client-safe (no server imports).
 */
export const CV_SECTIONS = ["summary", "skills", "projects", "open_source", "endorsements", "credentials", "education"] as const;
export type CvSection = (typeof CV_SECTIONS)[number];

export type CvTier = "raw" | "spark" | "flare" | "shine" | "radiant" | "luminary";

export interface CvSnapshotV1 {
  schema: "skilient.cv/1";
  person: {
    name: string;
    username: string;
    university: string;
    department: string | null;
    graduation_year: number | null;
    /** The university email, only when the student chose to show it. */
    email: string | null;
  };
  standing: { tier: CvTier | null; top_percent: number | null };
  sections: CvSection[];
  summary: string;
  skills: {
    id: string;
    name: string;
    level: number;
    evidence: { repos: number; active_days: number; pull_requests: number; entries: number; endorsements: number };
  }[];
  projects: {
    id: string;
    title: string;
    type: string;
    status: "in_progress" | "completed";
    /** A team role, or "former_member" for a venture the student left with confirmed work. */
    role: string;
    owner: boolean;
    started: string | null; // YYYY-MM
    completed: string | null; // YYYY-MM
    team_size: number;
    verified_entries: number;
    faculty_confirmed: number;
    faculty_reviewed: boolean;
    deliverables: number;
    skills: string[];
    /** "owner/name", "Private repository", or null when no repository is linked. */
    repository: string | null;
    /** Written by the team, frozen at issue. */
    description: string;
  }[];
  open_source: { repository: string; number: number | null; merged: string; skills: string[] }[];
  endorsements: { endorser: string; skill: string; venture: string; note: string | null; date: string }[];
  credentials: { title: string; issuer: string; issued: string; expires: string | null }[];
  education: { university: string; department: string | null; graduation_year: number | null };
  /** University awards (phase 9), in the next version after they are granted. Never part of ranking. */
  awards?: { name: string; university: string; awarded: string }[];
}
