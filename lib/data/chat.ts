import "server-only";

import { clockTime, shortTime } from "@/lib/format/time";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Chat reads (PRD 5.9). Every function returns only threads the caller is in; images come
 * back as signed URLs (1 hour) because the chat-media bucket is private.
 */

export interface ThreadRow {
  id: string;
  type: "dm" | "group";
  title: string;
  username: string | null;
  avatarUrl: string | null;
  ventureId: string | null;
  lastMessage: string | null;
  lastSenderIsMe: boolean;
  timeLabel: string;
  unread: number;
  muted: boolean;
}

export async function getThreads(): Promise<ThreadRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_threads");
  if (error) throw new Error(`my_threads failed: ${error.code}`);
  return (data ?? []).map((t) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    username: t.username,
    avatarUrl: publicImageUrl("avatars", t.avatar_path),
    ventureId: t.venture_id,
    lastMessage: t.last_message,
    lastSenderIsMe: t.last_sender_is_me ?? false,
    timeLabel: shortTime(t.last_message_at),
    unread: t.unread,
    muted: t.muted,
  }));
}

export interface ChatPerson {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  blocked: boolean;
  isMe: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ChatLink {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  createdAt: string;
  timeLabel: string;
  edited: boolean;
  deleted: boolean;
  replyTo: { id: string; senderId: string | null; excerpt: string } | null;
  reactions: Reaction[];
  pinned: boolean;
  link: ChatLink | null;
}

export interface ChatPin {
  messageId: string;
  senderId: string;
  excerpt: string;
}

export interface ThreadView {
  thread: ThreadRow;
  people: ChatPerson[];
  messages: ChatMessage[];
  hasOlder: boolean;
  pins: ChatPin[];
  /** DMs with receipts on both sides: when the other person last read the thread. */
  receipt: string | null;
  /** The caller's own read-receipts setting. */
  readReceipts: boolean;
  /** The venture owner may pin in the team chat. */
  canPin: boolean;
}

export function toReactions(value: unknown): Reaction[] {
  return Array.isArray(value)
    ? value.map((r: Record<string, unknown>) => ({ emoji: String(r.emoji), count: Number(r.count), mine: Boolean(r.mine) }))
    : [];
}

export function toLink(value: unknown): ChatLink | null {
  if (!value || typeof value !== "object") return null;
  const l = value as Record<string, string | null>;
  return l.url ? { url: l.url, title: l.title ?? null, description: l.description ?? null, siteName: l.site_name ?? null } : null;
}

export async function getPins(threadId: string): Promise<ChatPin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("thread_pins", { p_thread: threadId });
  if (error) throw new Error(`thread_pins failed: ${error.code}`);
  return (data ?? []).map((p) => ({ messageId: p.message_id, senderId: p.sender_id, excerpt: p.excerpt }));
}

const PAGE = 50;

export async function signChatImages(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("chat-media").createSignedUrls(paths, 3600);
  const out = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

/** One thread for /chat/[id], or null when the caller isn't in it (or the DM is closed). */
export async function getThread(id: string, before: string | null = null): Promise<ThreadView | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const threads = await getThreads();
  const thread = threads.find((t) => t.id === id);
  const supabase = await createClient();
  const [people, msgs, receipt, settings] = await Promise.all([
    supabase.rpc("thread_people", { p_thread: id }),
    supabase.rpc("thread_messages", { p_thread: id, p_before: before ?? undefined, p_limit: PAGE }),
    supabase.rpc("dm_receipt", { p_thread: id }),
    supabase.rpc("my_chat_settings"),
  ]);
  if (people.error || msgs.error) throw new Error(`thread read failed: ${people.error?.code ?? msgs.error?.code}`);
  if (!people.data?.length) return null;
  // A thread with no messages yet isn't in the list's "last message" order; build its row.
  const other = people.data.find((p) => !p.is_me);
  const row: ThreadRow =
    thread ??
    (await (async () => {
      const { data: t } = await supabase.from("chat_threads").select("id, type, venture_id, ventures(title)").eq("id", id).maybeSingle();
      if (!t) return null;
      return {
        id: t.id,
        type: t.type,
        title: t.type === "dm" ? (other?.name ?? "Chat") : (t.ventures?.title ?? "Chat"),
        username: t.type === "dm" ? (other?.username ?? null) : null,
        avatarUrl: t.type === "dm" ? publicImageUrl("avatars", other?.avatar_path ?? null) : null,
        ventureId: t.venture_id,
        lastMessage: null,
        lastSenderIsMe: false,
        timeLabel: "",
        unread: 0,
        muted: false,
      } satisfies ThreadRow;
    })()) as ThreadRow;
  if (!row) return null;
  const rows = msgs.data ?? [];
  const [pins, owner] = await Promise.all([
    row.type === "group" ? getPins(id) : Promise.resolve([]),
    row.type === "group" && row.ventureId
      ? supabase.from("ventures").select("owner_id").eq("id", row.ventureId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const me = people.data.find((p) => p.is_me)?.user_id;
  const signed = await signChatImages(rows.map((m) => m.media_path).filter((p): p is string => Boolean(p)));
  return {
    thread: row,
    people: people.data.map((p) => ({
      userId: p.user_id,
      name: p.name,
      username: p.username,
      avatarUrl: publicImageUrl("avatars", p.avatar_path),
      blocked: p.blocked,
      isMe: p.is_me,
    })),
    messages: rows
      .map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        body: m.body,
        imageUrl: m.media_path ? (signed.get(m.media_path) ?? null) : null,
        imageWidth: m.media_width,
        imageHeight: m.media_height,
        createdAt: m.created_at,
        timeLabel: clockTime(m.created_at),
        edited: m.edited_at !== null,
        deleted: m.deleted,
        replyTo: m.reply_to_id ? { id: m.reply_to_id, senderId: m.reply_sender_id, excerpt: m.reply_excerpt ?? "Earlier message" } : null,
        reactions: toReactions(m.reactions),
        pinned: m.pinned,
        link: toLink(m.link),
      }))
      .reverse(),
    hasOlder: rows.length === PAGE,
    pins,
    receipt: receipt.data ?? null,
    readReceipts: settings.data?.[0]?.read_receipts ?? true,
    canPin: Boolean(me && owner.data?.owner_id === me),
  };
}

export async function getVentureChatId(ventureId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("venture_chat", { p_venture: ventureId });
  return data ?? null;
}

export async function getUnreadChatCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_chat_count");
  return data ?? 0;
}

export async function getChatSettings(): Promise<{ readReceipts: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_chat_settings");
  return { readReceipts: data?.[0]?.read_receipts ?? true };
}
