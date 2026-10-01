import "server-only";

import { cache } from "react";
import { rpcJson } from "@/lib/data/rpc-json";
import type { ModuleKey, UniRole } from "@/lib/uni/constants";

/**
 * University-portal reads (PRD 5.23). One SQL function per read; each checks the admin's role,
 * two-factor and the plan itself (supabase/migrations/20261017..21_uni_*.sql).
 */

export interface MyUni {
  university_id: string;
  name: string;
  slug: string;
  role: UniRole;
  department_id: string | null;
  department: string | null;
  is_owner: boolean;
  plan: string;
  entitlements: Record<string, boolean>;
  limits: Record<string, number | null>;
}
export const getMyUni = cache(() => rpcJson<MyUni | null>("my_uni"));

export interface ClaimState {
  university_id: string;
  university: string;
  claimed: boolean;
  is_admin: boolean;
  open_claim_by_other: boolean;
  claims: { id: string; status: string; title: string; review_reason: string | null; created_at: string }[];
}
export const getClaimState = () => rpcJson<ClaimState>("my_uni_claim");
export const getMyUniInvites = () =>
  rpcJson<{ id: string; university: string; role: UniRole; department: string | null; expires_at: string }[]>("my_uni_invites");
export const getUniInvitePreview = (tokenHash: string) =>
  rpcJson<{ university: string; email: string; role: UniRole } | null>("uni_invite_preview", { p_token_hash: tokenHash });

export interface UniHome {
  numbers: { students?: number | null; active_30d?: number | null };
  todos: Record<string, number | boolean | null>;
}
export const getUniHome = () => rpcJson<UniHome>("uni_home");

export interface AdminsList {
  seats_limit: number | null;
  seats_used: number;
  admins: { user_id: string; name: string; email: string; role: UniRole; department_id: string | null; department: string | null; since: string }[];
  invites: { id: string; email: string; role: UniRole; department: string | null; expires_at: string; state: string }[];
}
export const getAdmins = () => rpcJson<AdminsList>("uni_admins_list");
export const getAuditLog = () => rpcJson<{ action: string; target_type: string; actor: string | null; detail: unknown; at: string }[]>("uni_audit_list");

export interface Structure {
  departments: { id: string; name: string; students: number; programmes: { id: string; name: string }[] }[];
  unassigned: number;
}
export const getStructure = () => rpcJson<Structure>("uni_structure");
export const getDomains = () =>
  rpcJson<{ domains: { domain: string; kind: string; source: string }[]; requests: { id: string; domain: string; kind: string; status: string; review_reason: string | null; created_at: string }[] }>("uni_domains");

export interface UniTeacher {
  user_id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  status: string;
  requested_at: string;
  on_csv: boolean;
}
export const getUniTeachers = (status: "pending" | "approved" | "revoked") => rpcJson<UniTeacher[]>("uni_teachers", { p_status: status });

export interface Ecosphere {
  modules: Record<ModuleKey, boolean>;
  branding: { primary?: { light: string; dark: string }; accent?: { light: string; dark: string }; logo_path?: string; cover_path?: string };
  welcome: string | null;
  batch_labels: Record<string, string>;
  announcement_categories: string[];
  slug: string;
  slug_changed_at: string | null;
  pages: { id: string; slug: string; title: string; published: boolean; position: number; blocks: PageBlock[]; updated_at: string }[];
}
export type PageBlock =
  | { type: "text"; text: string }
  | { type: "image"; path: string; caption?: string }
  | { type: "links"; items: { label: string; url: string }[] }
  | { type: "announcements"; count: number }
  | { type: "events"; count: number }
  | { type: "ventures"; ids: string[]; items?: { id: string; title: string; type: string; status: string }[] }
  | { type: "faculty"; ids: string[]; items?: { name: string; title: string; department: string }[] };
export const getEcosphere = () => rpcJson<Ecosphere>("uni_ecosphere");
export const getFeatureOptions = () =>
  rpcJson<{ ventures: { id: string; title: string }[]; faculty: { id: string; name: string; title: string; department: string }[] }>("uni_feature_options");

export interface UniQuestion {
  id: string;
  prompt: string;
  options: string[];
  removed: boolean;
  removed_by_staff: boolean;
  removed_reason: string | null;
  answers: number;
  counts: (number | null)[];
}
export const getUniQuestions = () => rpcJson<UniQuestion[]>("uni_questions");

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  archived: boolean;
  awards: { id: string; student: string; username: string | null; department: string | null; awarded_at: string; note: string | null }[];
}
export const getBadges = () => rpcJson<Badge[]>("uni_badges");

export const getCalendar = () =>
  rpcJson<{ semesters: { id: string; name: string; starts_on: string; ends_on: string }[]; exam_periods: { id: string; starts_on: string; ends_on: string; reason: string }[] }>("uni_calendar");

export interface AnnouncementList {
  posted_today: number;
  daily_limit: number;
  categories: string[];
  departments: { id: string; name: string }[];
  items: { id: string; body: string; category: string | null; created_at: string; expires_at: string; pinned_until: string | null; author: string | null; departments: string[] | null; batches: number[] | null }[];
}
export const getAnnouncements = () => rpcJson<AnnouncementList>("uni_announcements");

export interface UniEvent {
  id: string;
  type: string;
  scope: "university" | "global";
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  link: string | null;
  capacity: number | null;
  cancelled: boolean;
  going: number;
  checked_in?: number;
}
export const getUniEvents = () => rpcJson<{ module_on: boolean; can_edit: boolean; items: UniEvent[] }>("uni_events");

export interface ModerationView {
  hides: { id: string; target_type: string; reason: string; status: string; hidden_by: string | null; created_at: string; excerpt: string }[];
  cases: { id: string; target_type: string; status: string; reports: number; opened_at: string; excerpt: string; category: string | null }[];
}
export const getModeration = () => rpcJson<ModerationView>("uni_moderation");

export type Dashboard = { locked: boolean; plan: string; full?: boolean; exports?: boolean; computed_at?: string } & Record<string, unknown>;
export const getDashboard = (area: string) => rpcJson<Dashboard>("uni_dashboard", { p_area: area });

export interface StudentRow { id: string; name: string; username: string | null; department: string | null; batch: number | null; status: string; tier: string | null }
export const getStudents = (q: string | null, department: string | null, batch: number | null, offset: number) =>
  rpcJson<{ items: StudentRow[] }>("uni_students", { p_q: q, p_department: department, p_batch: batch, p_offset: offset });
/** Logged by the database on every call (one row per opening). */
export const getStudentRecord = (id: string) => rpcJson<StudentRecord>("university_student_record", { p_student: id });
export interface StudentRecord {
  profile: { id: string; name: string; username: string | null; department: string | null; programme: string | null; batch: number | null; status: string; joined_at: string };
  skills: { name: string; level: number }[];
  ventures: { title: string; type: string; status: string; role: string; entries: number; faculty_reviewed: boolean }[];
  endorsements: { skill: string; by: string; kind: string; at: string }[];
  credentials: { title: string; issuer: string; issued_on: string }[];
  ranking: { tier: string | null; ranked: boolean; top_percent: number | null } | null;
  ranking_history: { week: string; tier: string | null }[];
  events: { title: string; starts_at: string; checked_in: boolean }[];
  cv: { code: string; version: number; issued_at: string } | null;
  fair_outcomes: { fair: string; company: string; talked: boolean; interview: boolean; hired: boolean }[];
  awards: { name: string; awarded_at: string }[];
}

export const getSponsorship = () =>
  rpcJson<{ plan: string; final_year: number; exception: number | null; eligible_final_year: number | null; eligible_all: number | null; active_grants: number | null; sponsored_level?: string | null; requests: { batch_year: number | null; status: string; review_reason: string | null; created_at: string }[] }>("uni_sponsorship");

export const getHackathons = () =>
  rpcJson<{ limit: number | null; used: number; teachers: { id: string; name: string; department: string }[]; items: { id: string; title: string; status: string; starts_at: string; ends_at: string; teams: number; judges: string[] | null }[] }>("uni_hackathons");

export const getFairs = () =>
  rpcJson<{ limit: number | null; used: number; items: { id: string; title: string; status: string; starts_at: string; ends_at: string; booths: number }[] }>("uni_fairs");
export interface UniFair {
  fair: { id: string; title: string; description: string | null; starts_at: string; ends_at: string; status: string };
  invites: { id: string; email: string; accepted: boolean; company: string | null; verified: boolean | null }[];
  booths: { company: string; verified: boolean; waiting: number; conversations: number; interviews_booked: number; interviews_held: number }[];
  report: { attendees: number; conversations: number; interviews_held: number; contacts: number; hires: number; by_department: { label: string; count: number | null }[] };
}
export const getFair = (id: string) => rpcJson<UniFair>("uni_fair", { p_id: id });

// Ops
export const getOpsUniQueue = () =>
  rpcJson<{
    claims: { id: string; university: string; requester: string; email: string; title: string; created_at: string }[];
    domains: { id: string; university: string; domain: string; kind: string; reason: string; created_at: string }[];
    batches: { id: string; university: string; batch_year: number | null; current: number | null; reason: string; created_at: string }[];
    claimed: { id: string; name: string; owner: string | null; claimed_at: string; plan: string }[];
  }>("ops_uni_queue");
export const getOpsClaim = (id: string) =>
  rpcJson<{ id: string; university: string; claimed: boolean; domains: string[]; requester: string; email: string; title: string; note: string | null; letter_path: string | null; letter_type: string; status: string; review_reason: string | null; created_at: string; has_two_factor: boolean }>("ops_uni_claim", { p_id: id });
export const getOpsQuestions = () => rpcJson<{ id: string; university: string; prompt: string; options: string[]; created_at: string }[]>("ops_uni_questions");
export const getOpsHides = () =>
  rpcJson<{ id: string; university: string; target_type: string; reason: string; status: string; hidden_by: string | null; case_id: string | null; created_at: string; decided_at: string | null; decision_reason: string | null }[]>("ops_university_hides", { p_case: null });

// Student side -------------------------------------------------------------------------------
export interface EventCard {
  id: string;
  type: string;
  scope: "university" | "global";
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  link: string | null;
  capacity: number | null;
  going: number;
  cancelled: boolean;
  university: string;
  university_slug: string;
  my_status: "going" | "checked_in" | null;
  can_attend: boolean;
  can_organise: boolean;
}
export const getEvents = (when: "upcoming" | "past" | "mine") => rpcJson<EventCard[]>("events_list", { p_when: when });
export const getEvent = (id: string) => rpcJson<EventCard>("event_detail", { p_id: id });

export interface EcosphereHome {
  university: { id: string; name: string; slug: string; city: string | null; claimed: boolean };
  branding: Ecosphere["branding"];
  welcome: string | null;
  modules: Record<ModuleKey, boolean>;
  is_member: boolean;
  pages: { slug: string; title: string }[];
  semesters: { name: string; starts_on: string; ends_on: string }[];
  teachers: { name: string; title: string; department: string }[] | null;
  jobs: { id: string; title: string; company: string; type: string; deadline: string }[] | null;
}
export const getEcosphereHome = (slug: string) => rpcJson<EcosphereHome>("ecosphere_home", { p_slug: slug });
export const getEcospherePage = (slug: string, page: string) =>
  rpcJson<{ university: { id: string; name: string; slug: string }; title: string; slug: string; blocks: PageBlock[]; is_member: boolean; branding: Ecosphere["branding"] }>("ecosphere_page", { p_slug: slug, p_page: page });
export const getMyUniAnnouncements = (limit = 5) =>
  rpcJson<{ id: string; body: string; category: string | null; created_at: string }[]>("my_uni_announcements", { p_limit: limit });
export const getMyEcosphere = cache(() =>
  rpcJson<{ slug: string; name: string; modules: Record<ModuleKey, boolean>; batch_labels: Record<string, string> } | null>("my_ecosphere"));
export const getMyUniQuestions = () => rpcJson<{ id: string; prompt: string; options: string[]; answer: number | null }[]>("my_uni_questions");
export const getMyRecordViewers = () => rpcJson<{ locked: boolean; items?: { name: string; role: UniRole; at: string }[] }>("my_record_viewers");
export const getAwardsFor = (userId: string) =>
  rpcJson<{ id: string; name: string; description: string | null; icon: string; university: string; awarded_at: string }[]>("awards_for", { p_user: userId });

export interface FairView {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: "upcoming" | "live" | "ended" | "cancelled";
  university: string;
  viewer: "student" | "recruiter" | "admin";
  my_booth: string | null;
  booths: {
    id: string;
    company: string;
    company_slug: string;
    roles: string[];
    about: string | null;
    waiting: number;
    open_slots: number;
    my_queue: { id: string; status: string; position: number; ahead: number; thread_id: string | null } | null;
    my_slot: { id: string; starts_at: string; ends_at: string } | null;
    slots: { id: string; starts_at: string; ends_at: string }[] | null;
  }[];
}
export const getFairView = (id: string) => rpcJson<FairView>("fair_view", { p_fair: id });
export interface BoothQueue {
  booth: { id: string; roles: string[]; about: string | null };
  queue: { id: string; position: number; status: string; joined_at: string; called_at: string | null; thread_id: string | null; student: FairStudent }[];
  slots: { id: string; starts_at: string; ends_at: string; held: boolean; student: FairStudent | null }[];
}
export interface FairStudent { name: string; department: string | null; batch: number | null; tier: string | null; skills: { name: string; level: number }[] }
export const getBoothQueue = (boothId: string) => rpcJson<BoothQueue>("booth_queue", { p_booth: boothId });
export const getFairInvitePreview = (tokenHash: string) =>
  rpcJson<{ fair: string; university: string; starts_at: string; ends_at: string; email: string } | null>("fair_invite_preview", { p_token_hash: tokenHash });
export const getMyJudging = () => rpcJson<{ id: string; title: string; status: string; ends_at: string }[]>("my_judging");
export const getJudgeHackathon = (id: string) =>
  rpcJson<{ competition: { id: string; title: string; status: string; ends_at: string; rubric: { criterion: string; weight: string }[] }; teams: { id: string; name: string; repo_url: string; frozen_sha: string | null; my_scores: Record<string, number> | null; my_total: number | null; my_feedback: string | null }[] }>("judge_hackathon", { p_id: id });
export const getRecentFeed = () =>
  rpcJson<{ posts: { id: string; type: string; excerpt: string; author: string; created_at: string; hidden: boolean }[]; comments: { id: string; excerpt: string; author: string; created_at: string; hidden: boolean }[] }>("uni_recent_feed");
