import "server-only";

import { cache } from "react";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Venture reads (PRD 5.7, 5.28). RLS and the read functions decide who sees what; these
 * only shape rows for the screens.
 */

type Enums = Database["public"]["Enums"];
export type VentureType = Enums["venture_type"];
export type VentureStatus = Enums["venture_status"];
export type VentureVisibility = Enums["venture_visibility"];
export type VentureStage = Enums["venture_stage"];
export type TeamRole = Enums["venture_team_role"];

export interface VentureRow {
  id: string;
  type: VentureType;
  title: string;
  summary: string;
  status: VentureStatus;
  visibility: VentureVisibility;
  stage: VentureStage | null;
  skills: { id: string; name: string }[];
  universityName: string;
  owner: { username: string | null; name: string };
  members: number;
  teamSize: number;
  openSlots: number;
  createdAt: string;
}

export async function skillNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("skills").select("id, name").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

export interface BrowseFilters {
  type: VentureType;
  status?: VentureStatus | null;
  openRoles?: boolean;
  myUniversity?: boolean;
  before?: string | null;
}

export const PAGE_SIZE = 20;

export async function browseVentures(f: BrowseFilters): Promise<VentureRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("browse_ventures", {
    p_type: f.type,
    p_status: f.status ?? undefined,
    p_open_roles: f.openRoles ?? false,
    p_my_university: f.myUniversity ?? false,
    p_before: f.before ?? undefined,
    p_limit: PAGE_SIZE,
  });
  if (error) throw new Error(`browse ventures: ${error.code}`);
  const names = await skillNames((data ?? []).flatMap((v) => v.skill_ids));
  return (data ?? []).map((v) => ({
    id: v.id,
    type: v.type,
    title: v.title,
    summary: v.summary,
    status: v.status,
    visibility: v.visibility,
    stage: v.stage,
    skills: v.skill_ids.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! })),
    universityName: v.university_name,
    owner: { username: v.owner_username, name: v.owner_name },
    members: v.members,
    teamSize: v.team_size,
    openSlots: v.open_slots,
    createdAt: v.created_at,
  }));
}

export interface TeamMember {
  userId: string;
  username: string | null;
  fullName: string;
  avatarUrl: string | null;
  teamRole: TeamRole;
  joinedAt: string;
  isOwner: boolean;
}

export interface VentureRole {
  id: string;
  title: string;
  skills: { id: string; name: string }[];
  slots: number;
  filled: number;
}

export interface VentureDetail {
  id: string;
  type: VentureType;
  title: string;
  description: string;
  status: VentureStatus;
  visibility: VentureVisibility;
  stage: VentureStage | null;
  pitchUrl: string | null;
  affiliation: string | null;
  skills: { id: string; name: string }[];
  teamSize: number;
  repoFullName: string | null;
  createdAt: string;
  completedAt: string | null;
  ownerId: string;
  team: TeamMember[];
  roles: VentureRole[];
  questions: { position: number; body: string }[];
  counts: { members: number; followers: number; deliverables: number; updates: number };
  viewer: {
    userId: string;
    isOwner: boolean;
    isMember: boolean;
    /** Opened by link only (Unlisted, not a member or invitee). */
    byLinkOnly: boolean;
    following: boolean;
    pendingApplicationId: string | null;
    inviteId: string | null;
    sameUniversity: boolean;
  };
}

/** One venture as the signed-in viewer may see it; null when it doesn't exist for them. */
export const getVenture = cache(async (id: string): Promise<VentureDetail | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("ventures")
    .select("id, type, title, description, status, visibility, stage, pitch_url, affiliation, skill_ids, team_size, repo_full_name, created_at, completed_at, owner_id, university_id")
    .eq("id", id)
    .maybeSingle();
  let v = row;
  let byLinkOnly = false;
  if (!v) {
    const { data: linked } = await supabase.rpc("venture_by_link", { p_venture: id });
    const l = linked?.[0];
    if (!l) return null;
    byLinkOnly = true;
    v = {
      ...l,
      stage: null,
      pitch_url: null,
      affiliation: null,
      skill_ids: [],
      team_size: 6,
      repo_full_name: null,
      completed_at: null,
    };
  }

  const [team, roles, questions, counts, me, follow, application, invite] = await Promise.all([
    supabase.rpc("venture_team", { p_venture: id }),
    byLinkOnly ? Promise.resolve({ data: [] }) : supabase.from("venture_roles").select("id, title, skill_ids, slots, filled").eq("venture_id", id).order("created_at"),
    byLinkOnly ? Promise.resolve({ data: [] }) : supabase.from("venture_questions").select("position, body").eq("venture_id", id).order("position"),
    supabase.rpc("venture_counts", { p_venture: id }),
    supabase.from("profiles").select("university_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("venture_follows").select("venture_id").eq("venture_id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("application_threads").select("id").eq("venture_id", id).eq("candidate_id", user.id).eq("status", "pending").maybeSingle(),
    supabase.from("venture_invites").select("id").eq("venture_id", id).eq("invitee_id", user.id).eq("status", "pending").maybeSingle(),
  ]);

  const roleRows = roles.data ?? [];
  const names = await skillNames([...v.skill_ids, ...roleRows.flatMap((r) => r.skill_ids)]);
  const toSkills = (ids: string[]) => ids.filter((s) => names.has(s)).map((s) => ({ id: s, name: names.get(s)! }));
  const teamRows = (team.data ?? []).map((m) => ({
    userId: m.user_id,
    username: m.username,
    fullName: m.full_name,
    avatarUrl: publicImageUrl("avatars", m.avatar_path),
    teamRole: m.team_role,
    joinedAt: m.joined_at,
    isOwner: m.is_owner,
  }));
  const c = counts.data?.[0];

  return {
    id: v.id,
    type: v.type,
    title: v.title,
    description: v.description,
    status: v.status,
    visibility: v.visibility,
    stage: v.stage,
    pitchUrl: v.pitch_url,
    affiliation: v.affiliation,
    skills: toSkills(v.skill_ids),
    teamSize: v.team_size,
    repoFullName: v.repo_full_name,
    createdAt: v.created_at,
    completedAt: v.completed_at,
    ownerId: v.owner_id,
    team: teamRows,
    roles: roleRows.map((r) => ({ id: r.id, title: r.title, skills: toSkills(r.skill_ids), slots: r.slots, filled: r.filled })),
    questions: questions.data ?? [],
    counts: { members: c?.members ?? teamRows.length, followers: c?.followers ?? 0, deliverables: c?.deliverables ?? 0, updates: c?.updates ?? 0 },
    viewer: {
      userId: user.id,
      isOwner: v.owner_id === user.id,
      isMember: teamRows.some((m) => m.userId === user.id),
      byLinkOnly,
      following: !!follow.data,
      pendingApplicationId: application.data?.id ?? null,
      inviteId: invite.data?.id ?? null,
      sameUniversity: me.data?.university_id === v.university_id,
    },
  };
});

export interface VentureUpdate {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  images: { url: string; width: number; height: number }[];
}

export async function getVentureUpdates(id: string): Promise<VentureUpdate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venture_updates")
    .select("id, body, created_at, author_id, venture_update_media(position, path, width, height)")
    .eq("venture_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`venture updates: ${error.code}`);
  return (data ?? []).map((u) => ({
    id: u.id,
    body: u.body,
    createdAt: u.created_at,
    authorId: u.author_id,
    images: [...(u.venture_update_media ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ url: publicImageUrl("post-media", m.path) ?? "", width: m.width, height: m.height })),
  }));
}

export interface Deliverable {
  id: string;
  label: string;
  url: string;
  addedBy: string | null;
  createdAt: string;
}

/** Members only (RLS); an outsider gets an empty list and sees the count instead. */
export async function getDeliverables(id: string): Promise<Deliverable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venture_deliverables")
    .select("id, label, url, added_by, created_at")
    .eq("venture_id", id)
    .order("created_at");
  if (error) throw new Error(`deliverables: ${error.code}`);
  return (data ?? []).map((d) => ({ id: d.id, label: d.label, url: d.url, addedBy: d.added_by, createdAt: d.created_at }));
}

export interface PendingInvite {
  id: string;
  username: string | null;
  name: string;
  createdAt: string;
}

/** The owner's pending invites for a venture. */
export async function getOwnerInvites(id: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("venture_invites")
    .select("id, invitee_id, created_at")
    .eq("venture_id", id)
    .eq("status", "pending")
    .order("created_at");
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: cards } = await supabase.from("profiles").select("user_id, username, full_name").in("user_id", rows.map((r) => r.invitee_id));
  const byId = new Map((cards ?? []).map((c) => [c.user_id, c]));
  return rows.map((r) => ({
    id: r.id,
    username: byId.get(r.invitee_id)?.username ?? null,
    name: byId.get(r.invitee_id)?.full_name ?? "Invited student",
    createdAt: r.created_at,
  }));
}

/** The owner's shared repositories, for "link a repository". */
export async function getOwnerRepos(userId: string): Promise<{ id: number; fullName: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("github_user_repos")
    .select("repo_id, excluded, github_repos!inner(full_name)")
    .eq("user_id", userId)
    .eq("excluded", false);
  return (data ?? []).map((r) => ({ id: r.repo_id, fullName: r.github_repos.full_name })).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface ApplicationItem {
  id: string;
  status: Enums["application_status"];
  message: string;
  answers: { position: number; question: string; answer: string }[];
  createdAt: string;
  venture: { id: string; title: string } | null;
  role: string | null;
  person: { username: string | null; name: string };
  messages: { id: number; mine: boolean; body: string; createdAt: string }[];
}

export interface InviteItem {
  id: string;
  createdAt: string;
  venture: { id: string; title: string; type: VentureType } | null;
}

export interface Requests {
  received: ApplicationItem[];
  sent: ApplicationItem[];
  invites: InviteItem[];
}

/** /requests: applications to my ventures, mine to others, and invites to me (RLS: the two sides only). */
export async function getRequests(userId: string): Promise<Requests> {
  const supabase = await createClient();
  const [threads, invites] = await Promise.all([
    supabase
      .from("application_threads")
      .select("id, venture_id, role_id, candidate_id, owner_id, status, message, answers, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("venture_invites")
      .select("id, venture_id, created_at")
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  if (threads.error || invites.error) throw new Error(`requests: ${(threads.error ?? invites.error)?.code}`);
  const rows = threads.data ?? [];
  const ventureIds = [...new Set([...rows.map((t) => t.venture_id), ...(invites.data ?? []).map((i) => i.venture_id)])];
  const peopleIds = [...new Set(rows.map((t) => (t.owner_id === userId ? t.candidate_id : t.owner_id)))];
  const [ventures, roles, messages] = await Promise.all([
    ventureIds.length ? supabase.from("ventures").select("id, title, type").in("id", ventureIds) : Promise.resolve({ data: [] }),
    supabase.from("venture_roles").select("id, title").in("id", rows.map((t) => t.role_id).filter((r): r is string => !!r)),
    rows.length
      ? supabase.from("application_messages").select("id, thread_id, sender_id, body, created_at").in("thread_id", rows.map((t) => t.id)).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const cards = await requestCards(peopleIds);
  const ventureBy = new Map((ventures.data ?? []).map((v) => [v.id, v]));
  const roleBy = new Map((roles.data ?? []).map((r) => [r.id, r.title]));
  const messagesBy = new Map<string, ApplicationItem["messages"]>();
  for (const m of messages.data ?? []) {
    const list = messagesBy.get(m.thread_id) ?? [];
    list.push({ id: m.id, mine: m.sender_id === userId, body: m.body, createdAt: m.created_at });
    messagesBy.set(m.thread_id, list);
  }
  const toItem = (t: (typeof rows)[number]): ApplicationItem => {
    const other = t.owner_id === userId ? t.candidate_id : t.owner_id;
    const v = ventureBy.get(t.venture_id);
    return {
      id: t.id,
      status: t.status,
      message: t.message,
      answers: (Array.isArray(t.answers) ? t.answers : []) as ApplicationItem["answers"],
      createdAt: t.created_at,
      venture: v ? { id: v.id, title: v.title } : null,
      role: t.role_id ? (roleBy.get(t.role_id) ?? null) : null,
      person: cards.get(other) ?? { username: null, name: "A Skilient student" },
      messages: messagesBy.get(t.id) ?? [],
    };
  };
  return {
    received: rows.filter((t) => t.owner_id === userId).map(toItem),
    sent: rows.filter((t) => t.candidate_id === userId).map(toItem),
    invites: (invites.data ?? []).map((i) => {
      const v = ventureBy.get(i.venture_id);
      return { id: i.id, createdAt: i.created_at, venture: v ? { id: v.id, title: v.title, type: v.type } : null };
    }),
  };
}

/** Name and username of the other side of an application or invite (application_people). */
async function requestCards(ids: string[]): Promise<Map<string, { username: string | null; name: string }>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("application_people", { p_ids: ids });
  return new Map((data ?? []).map((p) => [p.user_id, { username: p.username, name: p.full_name }]));
}

export interface ProfileVenture {
  id: string;
  type: VentureType;
  title: string;
  status: VentureStatus;
  teamRole: TeamRole;
  isOwner: boolean;
}

export async function getProfileVentures(userId: string): Promise<ProfileVenture[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_ventures", { p_user: userId });
  if (error) throw new Error(`profile ventures: ${error.code}`);
  return (data ?? []).map((v) => ({ id: v.id, type: v.type, title: v.title, status: v.status, teamRole: v.team_role, isOwner: v.is_owner }));
}

// ---------------------------------------------------------------------------
// Contribution log (PRD 5.14)
// ---------------------------------------------------------------------------

export type ContributionKind = Enums["contribution_kind"];

export interface Contribution {
  /** The original entry's id: what confirmations and corrections refer to. */
  id: string;
  userId: string;
  kind: ContributionKind;
  description: string;
  evidenceUrl: string | null;
  hours: number | null;
  source: Enums["contribution_source"];
  createdAt: string;
  correctedAt: string | null;
  confirmations: number;
  peerVerified: boolean;
  /** The venture's supervisor confirmed it (PRD 5.21): counts as peer-verified. */
  facultyConfirmed: boolean;
  confirmedByMe: boolean;
  /** False once the author left or was removed: the entry stays but no longer counts. */
  byMember: boolean;
  /** A GitHub commit from before the venture was created: counts once a teammate confirms it. */
  beforeVenture: boolean;
  /** Skills the current version is tagged with (a teammate's confirmation makes them L3). */
  skillIds: string[];
}

/** The venture's timeline, newest first (RLS: whoever can see the venture). */
export async function getContributions(ventureId: string): Promise<Contribution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contributions_with_status")
    .select("id, user_id, kind, description, evidence_url, hours, source, created_at, corrected_at, confirmations, peer_verified, confirmed_by_me, by_member, before_venture, skill_ids, faculty_confirmed")
    .eq("venture_id", ventureId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`contributions: ${error.code}`);
  return (data ?? []).map((c) => ({
    id: c.id!,
    userId: c.user_id!,
    kind: c.kind!,
    description: c.description!,
    evidenceUrl: c.evidence_url,
    hours: c.hours === null ? null : Number(c.hours),
    source: c.source!,
    createdAt: c.created_at!,
    correctedAt: c.corrected_at,
    confirmations: c.confirmations ?? 0,
    peerVerified: Boolean(c.peer_verified),
    facultyConfirmed: Boolean(c.faculty_confirmed),
    confirmedByMe: Boolean(c.confirmed_by_me),
    byMember: Boolean(c.by_member),
    beforeVenture: Boolean(c.before_venture),
    skillIds: c.skill_ids ?? [],
  }));
}

/** How many current members have a peer-verified contribution (completion needs 2). */
export async function getVerifiedContributors(ventureId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("venture_verified_contributors", { p_venture: ventureId });
  if (error) throw new Error(`verified contributors: ${error.code}`);
  return data ?? 0;
}

/** Per-venture contribution counts for a profile (only ventures the viewer may see). */
export async function getContributionSummary(userId: string): Promise<Map<string, { entries: number; verified: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contributions_with_status")
    .select("venture_id, peer_verified")
    .eq("user_id", userId)
    .limit(2000);
  if (error) throw new Error(`contribution summary: ${error.code}`);
  const summary = new Map<string, { entries: number; verified: number }>();
  for (const row of data ?? []) {
    const s = summary.get(row.venture_id!) ?? { entries: 0, verified: 0 };
    s.entries += 1;
    if (row.peer_verified) s.verified += 1;
    summary.set(row.venture_id!, s);
  }
  return summary;
}

/**
 * Ventures a student left but keeps confirmed work in (decisions.md 2026-09-28): their
 * peer-verified contributions stay on their record. Only ventures the viewer may see.
 */
export async function getFormerVentures(
  userId: string,
  currentIds: string[],
  summary: Map<string, { entries: number; verified: number }>,
): Promise<{ id: string; type: VentureType; title: string; status: VentureStatus; verified: number }[]> {
  const ids = [...summary.entries()].filter(([id, s]) => s.verified > 0 && !currentIds.includes(id)).map(([id]) => id);
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("ventures").select("id, type, title, status").in("id", ids.slice(0, 100));
  if (error) throw new Error(`former ventures: ${error.code}`);
  return (data ?? [])
    .map((v) => ({ id: v.id, type: v.type, title: v.title, status: v.status, verified: summary.get(v.id)?.verified ?? 0 }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
