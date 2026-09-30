import "server-only";

import { cache } from "react";
import { getSnippet } from "@/lib/data/code-checks";
import { ageLabel, dayLabel } from "@/lib/format/time";
import type { Audience, Difficulty, ReviewRequestStatus, SupervisionStatus, TeacherStatus } from "@/lib/teach/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * Teacher-portal reads (PRD 5.21). Every read is one SQL function that checks who is asking
 * (supabase/migrations/*_teacher_portal.sql) and returns one document; dates are formatted here
 * on the server.
 */

async function rpcJson<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(`${fn}: ${error.code}`);
  return data as T;
}

const day = (iso: string | null | undefined) => (iso ? dayLabel(iso) : null);

export interface TeacherState {
  status: TeacherStatus;
  department: string;
  title: string;
  universityId: string;
  university: string;
}

/** The signed-in account's teacher row, or null when they never asked. */
export const getTeacherState = cache(async (): Promise<TeacherState | null> => {
  const s = await rpcJson<{ status: TeacherStatus; department: string; title: string; university_id: string; university: string } | null>("teacher_state");
  return s ? { status: s.status, department: s.department, title: s.title, universityId: s.university_id, university: s.university } : null;
});

export interface TeacherHome {
  department: string;
  title: string;
  invites: number;
  reviewRequests: number;
  supervising: number;
  superviseCap: number;
  ideasOpen: number;
  checksAvailable: number;
  checksMine: number;
  gradingOptIn: boolean;
  gradingUsed: number;
  gradingCap: number;
  endorsementsMonth: number;
  endorsementsLimit: number;
}

export async function getTeacherHome(): Promise<TeacherHome> {
  const h = await rpcJson<Record<string, number | string | boolean>>("teacher_home");
  return {
    department: String(h.department),
    title: String(h.title),
    invites: Number(h.invites),
    reviewRequests: Number(h.review_requests),
    supervising: Number(h.supervising),
    superviseCap: Number(h.supervise_cap),
    ideasOpen: Number(h.ideas_open),
    checksAvailable: Number(h.checks_available),
    checksMine: Number(h.checks_mine),
    gradingOptIn: h.grading_opt_in === true,
    gradingUsed: Number(h.grading_used),
    gradingCap: Number(h.grading_cap),
    endorsementsMonth: Number(h.endorsements_month),
    endorsementsLimit: Number(h.endorsements_limit),
  };
}

export interface TeacherSettings {
  gradingOptIn: boolean;
  weeklyCap: number;
  digest: boolean;
  skills: { id: string; name: string }[];
}

export async function getTeacherSettings(): Promise<TeacherSettings> {
  const s = await rpcJson<{ grading_opt_in: boolean; weekly_grading_cap: number; digest: boolean; grading_skills: { id: string; name: string }[] }>(
    "teacher_settings_get",
  );
  return { gradingOptIn: s.grading_opt_in, weeklyCap: s.weekly_grading_cap, digest: s.digest, skills: s.grading_skills };
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------
interface IdeaRaw {
  id: string;
  teacher_id: string;
  teacher_name: string;
  teacher_department: string;
  teacher_title: string;
  former_faculty: boolean;
  university: string;
  title: string;
  brief: string;
  difficulty: Difficulty;
  team_size: number;
  duration_weeks: number;
  deliverables: string;
  max_teams: number;
  deadline: string | null;
  course_label: string | null;
  audience: Audience;
  status: "open" | "closed";
  teams: number;
  is_open: boolean;
  created_at: string;
  skills: { id: string; name: string }[];
  ventures?: { id: string; title: string; status: string; members: number }[];
}

export interface Idea {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherLine: string;
  formerFaculty: boolean;
  university: string;
  title: string;
  brief: string;
  difficulty: Difficulty;
  teamSize: number;
  durationWeeks: number;
  deliverables: string;
  maxTeams: number;
  deadline: string | null;
  deadlineLabel: string | null;
  courseLabel: string | null;
  audience: Audience;
  status: "open" | "closed";
  teams: number;
  isOpen: boolean;
  skills: { id: string; name: string }[];
  ventures: { id: string; title: string; status: string; members: number }[] | null;
}

function idea(i: IdeaRaw): Idea {
  return {
    id: i.id,
    teacherId: i.teacher_id,
    teacherName: i.teacher_name,
    teacherLine: `${i.teacher_title}, ${i.teacher_department}`,
    formerFaculty: i.former_faculty,
    university: i.university,
    title: i.title,
    brief: i.brief,
    difficulty: i.difficulty,
    teamSize: i.team_size,
    durationWeeks: i.duration_weeks,
    deliverables: i.deliverables,
    maxTeams: i.max_teams,
    deadline: i.deadline,
    deadlineLabel: day(i.deadline),
    courseLabel: i.course_label,
    audience: i.audience,
    status: i.status,
    teams: i.teams,
    isOpen: i.is_open,
    skills: i.skills,
    ventures: i.ventures ?? null,
  };
}

export async function getIdeas(opts: { mine?: boolean; skill?: string; difficulty?: string } = {}): Promise<Idea[]> {
  const rows = await rpcJson<IdeaRaw[]>("ideas_list", {
    p_mine: opts.mine ?? false,
    p_skill: opts.skill ?? null,
    p_difficulty: opts.difficulty ?? null,
  });
  return rows.map(idea);
}

export async function getIdea(id: string): Promise<Idea | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await rpcJson<IdeaRaw | null>("idea_get", { p_id: id });
  return row ? idea(row) : null;
}

// ---------------------------------------------------------------------------
// Supervision, ventures, reviews
// ---------------------------------------------------------------------------
export interface TeacherVentureRow {
  id: string;
  title: string;
  status: string;
  relation: "supervising" | "invited" | "reviewed" | "ended";
  members: number;
  sinceLabel: string | null;
}

export async function getTeacherVentures(): Promise<TeacherVentureRow[]> {
  const rows = await rpcJson<{ id: string; title: string; status: string; relation: TeacherVentureRow["relation"]; members: number; since: string | null }[]>(
    "teacher_ventures",
  );
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, relation: r.relation, members: Number(r.members), sinceLabel: day(r.since) }));
}

export interface TeacherVenture {
  id: string;
  title: string;
  description: string;
  status: string;
  supervision: SupervisionStatus | null;
  iSupervise: boolean;
  openRequest: string | null;
  reviewed: boolean;
  canRead: boolean;
  canEndorse: boolean;
  skills: { id: string; name: string }[];
  idea: { id: string; title: string } | null;
  members: { userId: string; name: string; role: string }[];
}

export async function getTeacherVenture(id: string): Promise<TeacherVenture | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const v = await rpcJson<Record<string, unknown> | null>("teacher_venture", { p_venture: id });
  if (!v) return null;
  return {
    id: String(v.id),
    title: String(v.title),
    description: String(v.description),
    status: String(v.status),
    supervision: (v.supervision as SupervisionStatus | null) ?? null,
    iSupervise: v.i_supervise === true,
    openRequest: (v.open_request as string | null) ?? null,
    reviewed: v.reviewed === true,
    canRead: v.can_read === true,
    canEndorse: v.can_endorse === true,
    skills: v.skills as { id: string; name: string }[],
    idea: (v.idea as { id: string; title: string } | null) ?? null,
    members: (v.members as { user_id: string; name: string; role: string }[]).map((m) => ({ userId: m.user_id, name: m.name, role: m.role })),
  };
}

export interface TeacherContribution {
  id: string;
  author: string;
  kind: string;
  description: string;
  evidenceUrl: string | null;
  hours: number | null;
  github: boolean;
  peerVerified: boolean;
  facultyConfirmed: boolean;
  dateLabel: string;
}

export async function getTeacherContributions(id: string): Promise<TeacherContribution[]> {
  const rows = await rpcJson<
    { id: string; author: string; kind: string; description: string; evidence_url: string | null; hours: number | null; source: string; peer_verified: boolean; faculty_confirmed: boolean; created_at: string }[]
  >("teacher_contributions", { p_venture: id });
  return rows.map((c) => ({
    id: c.id,
    author: c.author,
    kind: c.kind,
    description: c.description,
    evidenceUrl: c.evidence_url,
    hours: c.hours,
    github: c.source === "github",
    peerVerified: c.peer_verified,
    facultyConfirmed: c.faculty_confirmed,
    dateLabel: dayLabel(c.created_at),
  }));
}

export async function getTeacherDeliverables(id: string): Promise<{ id: string; label: string; url: string }[]> {
  return rpcJson("teacher_deliverables", { p_venture: id });
}

export interface ThreadComment {
  id: number;
  authorId: string;
  authorName: string;
  body: string;
  supervisor: boolean;
  dateLabel: string;
}
export interface SupervisorThread {
  supervisorId: string | null;
  me: string;
  comments: ThreadComment[];
}

export async function getSupervisorThread(ventureId: string): Promise<SupervisorThread | null> {
  const t = await rpcJson<{
    supervisor_id: string | null;
    me: string;
    comments: { id: number; author_id: string; author_name: string; body: string; supervisor: boolean; created_at: string }[];
  } | null>("supervisor_thread", { p_venture: ventureId });
  if (!t) return null;
  return {
    supervisorId: t.supervisor_id,
    me: t.me,
    comments: t.comments.map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: c.author_name,
      body: c.body,
      supervisor: c.supervisor,
      dateLabel: `${dayLabel(c.created_at)} ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" }).format(new Date(c.created_at))}`,
    })),
  };
}

export interface ReviewRow {
  id: string;
  ventureId: string;
  ventureTitle: string;
  ventureStatus: string;
  requestedBy: string;
  startedByMe: boolean;
  status: ReviewRequestStatus;
  dueLabel: string;
  daysLeft: number;
  closedLabel: string | null;
}

export async function getReviewRequests(status: "open" | "done"): Promise<ReviewRow[]> {
  const rows = await rpcJson<
    { id: string; venture_id: string; venture_title: string; venture_status: string; requested_by: string; started_by_me: boolean; status: ReviewRequestStatus; due_at: string; closed_at: string | null }[]
  >("teacher_review_requests", { p_status: status === "open" ? "open" : "done" });
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    ventureId: r.venture_id,
    ventureTitle: r.venture_title,
    ventureStatus: r.venture_status,
    requestedBy: r.requested_by,
    startedByMe: r.started_by_me,
    status: r.status,
    dueLabel: dayLabel(r.due_at),
    daysLeft: Math.ceil((new Date(r.due_at).getTime() - now) / 86_400_000),
    closedLabel: day(r.closed_at),
  }));
}

export interface ReviewRequestDetail {
  id: string;
  ventureId: string;
  ventureTitle: string;
  status: ReviewRequestStatus;
  dueLabel: string;
  requestedBy: string;
  review: { rubric: Record<string, { score: number; comment: string }>; comments: string | null; average: number; dateLabel: string } | null;
}

export async function getReviewRequest(id: string): Promise<ReviewRequestDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await rpcJson<{
    id: string;
    venture_id: string;
    venture_title: string;
    status: ReviewRequestStatus;
    due_at: string;
    requested_by: string;
    review: { rubric: Record<string, { score: number; comment: string }>; comments: string | null; average: number; created_at: string } | null;
  } | null>("teacher_review_request", { p_request: id });
  if (!r) return null;
  return {
    id: r.id,
    ventureId: r.venture_id,
    ventureTitle: r.venture_title,
    status: r.status,
    dueLabel: dayLabel(r.due_at),
    requestedBy: r.requested_by,
    review: r.review ? { rubric: r.review.rubric, comments: r.review.comments, average: Number(r.review.average), dateLabel: dayLabel(r.review.created_at) } : null,
  };
}

export interface TeacherEndorseOptions {
  allowed: boolean;
  monthLeft: number;
  teammates: {
    userId: string;
    name: string;
    skills: { id: string; name: string }[];
    given: string[];
    evidence: { id: string; description: string; kind: string; skills: string[] }[];
  }[];
}

export async function getTeacherEndorseOptions(ventureId: string): Promise<TeacherEndorseOptions> {
  const o = await rpcJson<{
    allowed: boolean;
    month_left: number;
    teammates: { user_id: string; name: string; skills: { id: string; name: string }[]; given: string[]; evidence: { id: string; description: string; kind: string; skills: string[] }[] }[];
  }>("teacher_endorse_options", { p_venture: ventureId });
  return {
    allowed: o.allowed,
    monthLeft: o.month_left,
    teammates: o.teammates.map((t) => ({ userId: t.user_id, name: t.name, skills: t.skills, given: t.given, evidence: t.evidence })),
  };
}

// ---------------------------------------------------------------------------
// What students see on a venture
// ---------------------------------------------------------------------------
export interface Supervision {
  teacherId: string;
  name: string;
  department: string;
  title: string;
  status: SupervisionStatus;
  startedLabel: string | null;
}

export async function getSupervision(ventureId: string): Promise<Supervision | null> {
  const s = await rpcJson<{ teacher_id: string; name: string; department: string; title: string; status: SupervisionStatus; started_at: string | null } | null>(
    "supervision_for",
    { p_venture: ventureId },
  );
  return s ? { teacherId: s.teacher_id, name: s.name, department: s.department, title: s.title, status: s.status, startedLabel: day(s.started_at) } : null;
}

export interface VentureReview {
  id: string;
  teacherName: string;
  teacherLine: string;
  formerFaculty: boolean;
  dateLabel: string;
  /** Null for people outside the team: they see that faculty reviewed, not the scores. */
  average: number | null;
  rubric: Record<string, { score: number; comment: string }> | null;
  comments: string | null;
}

export async function getVentureReviews(ventureId: string): Promise<VentureReview[]> {
  const rows = await rpcJson<
    { id: string; teacher_name: string; department: string; title: string; former_faculty: boolean; created_at: string; average: number | null; rubric: VentureReview["rubric"]; comments: string | null }[]
  >("venture_reviews_for", { p_venture: ventureId });
  return rows.map((r) => ({
    id: r.id,
    teacherName: r.teacher_name,
    teacherLine: `${r.title}, ${r.department}`,
    formerFaculty: r.former_faculty,
    dateLabel: dayLabel(r.created_at),
    average: r.average === null ? null : Number(r.average),
    rubric: r.rubric,
    comments: r.comments,
  }));
}

export interface OwnReviewRequest {
  id: string;
  teacherName: string;
  status: ReviewRequestStatus;
  dueLabel: string;
}

export async function getOwnReviewRequests(ventureId: string): Promise<OwnReviewRequest[]> {
  const rows = await rpcJson<{ id: string; teacher_name: string; status: ReviewRequestStatus; due_at: string }[]>("review_requests_for", { p_venture: ventureId });
  return rows.map((r) => ({ id: r.id, teacherName: r.teacher_name, status: r.status, dueLabel: dayLabel(r.due_at) }));
}

export interface TeacherOption {
  userId: string;
  name: string;
  department: string;
  title: string;
  full: boolean;
}

/** Approved teachers at the owner's university (empty for anyone else). */
export async function getTeachersForVenture(ventureId: string): Promise<TeacherOption[]> {
  const rows = await rpcJson<{ user_id: string; name: string; department: string; title: string; active: number; cap: number }[]>("teachers_for_venture", {
    p_venture: ventureId,
  });
  return rows.map((t) => ({ userId: t.user_id, name: t.name, department: t.department, title: t.title, full: Number(t.active) >= Number(t.cap) }));
}

// ---------------------------------------------------------------------------
// Code-check grading
// ---------------------------------------------------------------------------
export interface TeacherCheckRow {
  id: string;
  student: string;
  skill: string;
  waiting: string;
  dueLabel: string | null;
  handOverLabel: string | null;
  claimedByMe: boolean;
  conflict: boolean;
  gradedLabel: string | null;
  status: string | null;
}

export async function getTeacherCodeChecks(tab: "open" | "graded"): Promise<TeacherCheckRow[]> {
  const rows = await rpcJson<
    { id: string; student_name: string; skill_name: string; submitted_at?: string; due_at?: string; hand_over_at?: string; claimed_by_me?: boolean; conflict?: boolean; graded_at?: string; status?: string }[]
  >("teacher_code_check_queue", { p_status: tab });
  return rows.map((r) => ({
    id: r.id,
    student: r.student_name,
    skill: r.skill_name,
    waiting: r.submitted_at ? ageLabel(r.submitted_at) : "",
    dueLabel: day(r.due_at),
    handOverLabel: day(r.hand_over_at),
    claimedByMe: r.claimed_by_me === true,
    conflict: r.conflict === true,
    gradedLabel: day(r.graded_at),
    status: r.status ?? null,
  }));
}

export interface TeacherCheckCase {
  id: string;
  status: "submitted" | "passed" | "failed" | string;
  skill: string;
  student: string;
  waiting: string | null;
  claimedByMe: boolean;
  claimed: boolean;
  conflict: boolean;
  prompt: string | null;
  answers: { what?: string; why?: string; change?: string } | null;
  rubric: Record<string, { pass: boolean; comment?: string }> | null;
  feedback: string | null;
}

export async function getTeacherCodeCheckCase(id: string): Promise<TeacherCheckCase | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const c = await rpcJson<Record<string, unknown> | null>("teacher_code_check_case", { p_id: id });
  if (!c) return null;
  return {
    id: String(c.id),
    status: String(c.status),
    skill: String(c.skill),
    student: String(c.student),
    waiting: typeof c.submitted_at === "string" ? ageLabel(c.submitted_at) : null,
    claimedByMe: c.claimed_by_me === true,
    claimed: c.claimed === true,
    conflict: c.conflict === true,
    prompt: (c.prompt as string | null) ?? null,
    answers: (c.answers as TeacherCheckCase["answers"]) ?? null,
    rubric: (c.rubric as TeacherCheckCase["rubric"]) ?? null,
    feedback: (c.feedback as string | null) ?? null,
  };
}

/** The code, read from GitHub now, for the teacher who holds the check. */
export const getTeacherSnippet = getSnippet;

// ---------------------------------------------------------------------------
// /ops: approvals and concentration flags
// ---------------------------------------------------------------------------
export interface TeacherRequestRow {
  userId: string;
  name: string;
  email: string;
  universityId: string;
  university: string;
  department: string;
  title: string;
  status: TeacherStatus;
  requestedLabel: string;
  source: string | null;
  decidedLabel: string | null;
}

export async function getTeacherRequests(status: "pending" | "decided"): Promise<TeacherRequestRow[]> {
  const rows = await rpcJson<
    { user_id: string; name: string; email: string; university_id: string; university: string; department: string; title: string; status: TeacherStatus; requested_at: string; approval_source: string | null; decided_at: string | null }[]
  >("teacher_requests", { p_status: status });
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    universityId: r.university_id,
    university: r.university,
    department: r.department,
    title: r.title,
    status: r.status,
    requestedLabel: dayLabel(r.requested_at),
    source: r.approval_source,
    decidedLabel: day(r.decided_at),
  }));
}

export async function getOpsUniversities(): Promise<{ id: string; name: string }[]> {
  return rpcJson("ops_universities");
}

export interface TeacherFlagRow {
  id: string;
  teacher: string;
  student: string;
  given: number;
  total: number;
  status: "open" | "cleared" | "upheld";
  age: string;
  reason: string | null;
}

export async function getTeacherFlags(status: "open" | "reviewed"): Promise<TeacherFlagRow[]> {
  const rows = await rpcJson<{ id: string; teacher: string; student: string; given: number; total: number; status: TeacherFlagRow["status"]; created_at: string; reason: string | null }[]>(
    "teacher_flag_queue",
    { p_status: status },
  );
  return rows.map((f) => ({ id: f.id, teacher: f.teacher, student: f.student, given: f.given, total: f.total, status: f.status, age: ageLabel(f.created_at), reason: f.reason }));
}
