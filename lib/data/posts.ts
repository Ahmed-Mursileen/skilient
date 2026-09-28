import "server-only";

import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Posts (PRD 5.6, 5.28). Which posts come back is decided in SQL (RLS and
 * post_cards/list_posts); this only shapes rows for the cards.
 */

type Enums = Database["public"]["Enums"];
export type PostType = Enums["post_type"];
export type PostAudience = Enums["post_audience"];
export type FeedScope = "university" | "global";
export const FEED_FILTERS = ["all", "ventures", "events", "announcements", "shipped"] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

export interface PostImage {
  url: string;
  width: number;
  height: number;
}

export interface PostEvent {
  startsAt: string;
  /** More than 6 hours after the start: RSVPs are closed. */
  past: boolean;
  place: string | null;
  url: string | null;
  going: number;
  interested: number;
  mine: "going" | "interested" | null;
}

export interface PostPoll {
  closesAt: string;
  closed: boolean;
  myVote: number | null;
  total: number;
  options: { position: number; label: string; votes: number | null }[];
}

export interface PostVenture {
  id: string;
  title: string;
  type: "project" | "startup";
  status: string;
  members: number;
  teamSize: number;
  isMember: boolean;
  myApplication: string | null;
  roles: { title: string; open: number }[];
  team: { name: string; username: string | null }[] | null;
}

export interface PostCardData {
  id: string;
  type: PostType;
  audience: PostAudience;
  body: string;
  createdAt: string;
  editedAt: string | null;
  pinnedUntil: string | null;
  /** An announcement pinned right now. */
  pinned: boolean;
  author: { username: string | null; name: string; avatarUrl: string | null };
  isMine: boolean;
  canEdit: boolean;
  images: PostImage[];
  event: PostEvent | null;
  poll: PostPoll | null;
  /** Null when the linked venture is gone or no longer visible to you. */
  venture: PostVenture | null;
}

type CardRow = Database["public"]["Functions"]["post_cards"]["Returns"][number];

function mapCard(r: CardRow, now: number): PostCardData {
  const media = (r.media ?? []) as { path: string; width: number; height: number }[];
  const e = r.event as Record<string, unknown> | null;
  const p = r.poll as Record<string, unknown> | null;
  const v = r.venture as Record<string, unknown> | null;
  return {
    id: r.id,
    type: r.type,
    audience: r.audience,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    pinnedUntil: r.pinned_until,
    pinned: r.pinned_until !== null && new Date(r.pinned_until).getTime() > now,
    author: { username: r.author_username, name: r.author_name, avatarUrl: publicImageUrl("avatars", r.author_avatar_path) },
    isMine: r.is_mine,
    canEdit: r.can_edit,
    images: media.map((m) => ({ url: publicImageUrl("post-media", m.path) ?? "", width: m.width, height: m.height })),
    event: e
      ? {
          startsAt: String(e.starts_at),
          past: new Date(String(e.starts_at)).getTime() < now - 6 * 3600 * 1000,
          place: (e.place as string | null) ?? null,
          url: (e.url as string | null) ?? null,
          going: Number(e.going ?? 0),
          interested: Number(e.interested ?? 0),
          mine: (e.mine as PostEvent["mine"]) ?? null,
        }
      : null,
    poll: p
      ? {
          closesAt: String(p.closes_at),
          closed: Boolean(p.closed),
          myVote: p.my_vote == null ? null : Number(p.my_vote),
          total: Number(p.total ?? 0),
          options: ((p.options ?? []) as { position: number; label: string; votes: number | null }[]).map((o) => ({
            position: Number(o.position),
            label: o.label,
            votes: o.votes == null ? null : Number(o.votes),
          })),
        }
      : null,
    venture: v
      ? {
          id: String(v.id),
          title: String(v.title),
          type: v.type as PostVenture["type"],
          status: String(v.status),
          members: Number(v.members ?? 0),
          teamSize: Number(v.team_size ?? 0),
          isMember: Boolean(v.is_member),
          myApplication: (v.my_application as string | null) ?? null,
          roles: (v.roles ?? []) as PostVenture["roles"],
          team: (v.team ?? null) as PostVenture["team"],
        }
      : null,
  };
}

export async function getPostCards(ids: string[]): Promise<PostCardData[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_cards", { p_ids: ids });
  if (error) throw new Error(`post_cards failed: ${error.code}`);
  const now = Date.now();
  return (data ?? []).map((r) => mapCard(r, now));
}

export interface PostPage {
  posts: PostCardData[];
  /** Pass back to load the next page; null at the end. */
  cursor: string | null;
}

export const PAGE_SIZE = 20;

/** Cursor = "<created_at>|<id>" of the last row. */
export function parseCursor(cursor: string | null | undefined): { before: string; beforeId: string } | null {
  if (!cursor) return null;
  const [before, beforeId] = cursor.split("|");
  if (!before || Number.isNaN(Date.parse(before)) || !/^[0-9a-f-]{36}$/.test(beforeId ?? "")) return null;
  return { before, beforeId };
}

export async function listPosts(opts: {
  scope: FeedScope | "author";
  filter?: FeedFilter;
  cursor?: string | null;
  authorId?: string;
}): Promise<PostPage> {
  const supabase = await createClient();
  const c = parseCursor(opts.cursor);
  const { data, error } = await supabase.rpc("list_posts", {
    p_scope: opts.scope,
    p_filter: opts.filter ?? "all",
    p_before: c?.before,
    p_before_id: c?.beforeId,
    p_author: opts.authorId,
    p_limit: PAGE_SIZE,
  });
  if (error) throw new Error(`list_posts failed: ${error.code}`);
  const rows = data ?? [];
  const posts = await getPostCards(rows.map((r) => r.id));
  const last = rows[rows.length - 1];
  return { posts, cursor: rows.length === PAGE_SIZE && last ? `${last.created_at}|${last.id}` : null };
}

export async function getPost(id: string): Promise<PostCardData | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [card] = await getPostCards([id]);
  return card ?? null;
}

/** Ventures the caller owns that can take an invite post. */
export async function getInvitableVentures(userId: string): Promise<{ id: string; title: string; visibility: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ventures")
    .select("id, title, visibility")
    .eq("owner_id", userId)
    .in("status", ["recruiting", "in_progress"])
    .neq("visibility", "unlisted")
    .order("created_at", { ascending: false });
  return data ?? [];
}
