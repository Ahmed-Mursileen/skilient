"use client";

import {
  ArrowBendUpLeft,
  ArrowClockwise,
  BellSimple,
  BellSlash,
  ImageSquare,
  MagnifyingGlass,
  PaperPlaneRight,
  PushPin,
  Smiley,
  UsersThree,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Avatar, Button, FieldError, Input, Textarea } from "@/components/ui";
import {
  deleteMessage,
  editMessage,
  loadPins,
  loadReactions,
  loadReceipt,
  markThreadRead,
  muteThread,
  pinMessage,
  searchChats,
  sendMessage,
  signImages,
  toggleReaction,
  type ChatSearchHit,
} from "@/lib/actions/chat";
import { REACTIONS } from "@/lib/chat/constants";
import type { ChatLink, ChatMessage, ChatPerson, ChatPin, Reaction, ThreadRow } from "@/lib/data/chat";
import { prepareImages } from "@/lib/images/downscale";
import { linkify } from "@/lib/format/linkify";
import { clockTime } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type Status = "sent" | "sending" | "failed";
type ReplyTarget = NonNullable<ChatMessage["replyTo"]>;
interface Item extends ChatMessage {
  status: Status;
  /** Client id for optimistic messages until the server's id arrives. */
  clientId?: string;
  retry?: { body: string; image: File | null; replyTo: ReplyTarget | null };
}

interface Row {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  media_path: string | null;
  media_width: number | null;
  media_height: number | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
}

/** How long a "typing" ping shows, and how often we send one (PRD 5.28: at most every 3 s). */
const TYPING_SHOWN_MS = 4_000;
const TYPING_EVERY_MS = 3_000;

function excerptOf(m: Pick<ChatMessage, "body" | "deleted">): string {
  if (m.deleted) return "Message deleted";
  return m.body ? m.body.slice(0, 140) : "Image";
}

/**
 * A conversation (PRD 5.9, 5.28, screen spec 3.5): Realtime delivery with a visible
 * "Reconnecting" state, optimistic sends that turn into Retry on failure, one image per
 * message, replies, the six reactions, pins in team chats (owner), typing, DM read
 * receipts, search within the thread, and read marks as you look. Typing and "changed"
 * pings go over the thread's members-only broadcast channel; the data behind a ping is
 * always re-read through SQL, which applies blocks and receipt settings.
 */
export function Conversation({
  thread,
  people,
  initial,
  hasOlder,
  meId,
  initialPins,
  initialReceipt,
  readReceipts,
  canPin,
}: {
  thread: ThreadRow;
  people: ChatPerson[];
  initial: ChatMessage[];
  hasOlder: boolean;
  meId: string;
  initialPins: ChatPin[];
  initialReceipt: string | null;
  readReceipts: boolean;
  canPin: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(() => initial.map((m) => ({ ...m, status: "sent" as const })));
  const [online, setOnline] = useState(true);
  const [muted, setMuted] = useState(thread.muted);
  const [pins, setPins] = useState(initialPins);
  const [receipt, setReceipt] = useState(initialReceipt);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const pingRef = useRef<((event: string, payload?: Record<string, unknown>) => void) | null>(null);
  const lastTypingSent = useRef(0);
  const byId = new Map(people.map((p) => [p.userId, p]));

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: "end" }));
  }, []);

  const ping = useCallback((event: string, payload: Record<string, unknown> = {}) => pingRef.current?.(event, payload), []);

  // Read marks: on open, on focus, and when a message arrives while the tab is visible.
  // With receipts on, the other side is pinged to re-read our mark (never the mark itself).
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void markThreadRead(thread.id).then((r) => {
      if (r.ok && readReceipts && thread.type === "dm") ping("read");
    });
  }, [thread.id, thread.type, readReceipts, ping]);
  useEffect(() => {
    markRead();
    scrollDown();
    window.addEventListener("focus", markRead);
    return () => window.removeEventListener("focus", markRead);
  }, [markRead, scrollDown]);

  // Realtime: inserts and edits for this thread (RLS limits the stream to members), and
  // the members-only broadcast channel for typing and change pings.
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let changes: ReturnType<typeof supabase.channel> | null = null;
    let pings: ReturnType<typeof supabase.channel> | null = null;
    const onOffline = () => setOnline(false);
    const onOnline = () => setOnline(true);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      changes = supabase
        .channel(`chat:${thread.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` }, async (payload) => {
          const row = payload.new as Row;
          if (!row?.id) return;
          let imageUrl: string | null = null;
          if (row.media_path && !row.deleted_at) {
            const signed = await signImages([row.media_path]);
            imageUrl = signed.ok ? (signed.data[row.media_path] ?? null) : null;
          }
          setItems((prev) => {
            const at = prev.findIndex((m) => m.id === row.id);
            const quoted = row.reply_to_id ? prev.find((m) => m.id === row.reply_to_id) : undefined;
            const base = {
              id: row.id,
              senderId: row.sender_id,
              body: row.body,
              imageUrl,
              imageWidth: row.media_width,
              imageHeight: row.media_height,
              createdAt: row.created_at,
              timeLabel: clockTime(row.created_at),
              edited: row.edited_at !== null,
              deleted: row.deleted_at !== null,
              status: "sent" as const,
            };
            if (at >= 0) {
              const copy = [...prev];
              const old = copy[at];
              copy[at] = { ...old, ...base, imageUrl: base.imageUrl ?? (base.deleted ? null : old.imageUrl), link: base.deleted ? null : old.link };
              return copy;
            }
            const next: Item = {
              ...base,
              replyTo: row.reply_to_id
                ? { id: row.reply_to_id, senderId: quoted?.senderId ?? null, excerpt: quoted ? excerptOf(quoted) : "Earlier message" }
                : null,
              reactions: [],
              pinned: false,
              link: null,
            };
            return [...prev, next];
          });
          if (payload.eventType === "INSERT") {
            setTyping((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== row.sender_id)));
            scrollDown();
            if (row.sender_id !== meId) markRead();
          }
        })
        .subscribe((status) => {
          if (!alive) return;
          setOnline(status === "SUBSCRIBED");
        });

      pings = supabase
        .channel(`thread:${thread.id}`, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const who = typeof payload?.userId === "string" ? payload.userId : null;
          if (!who || who === meId) return;
          setTyping((t) => ({ ...t, [who]: Date.now() + TYPING_SHOWN_MS }));
          setTimeout(() => setTyping((t) => (t[who] && t[who] <= Date.now() ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== who)) : t)), TYPING_SHOWN_MS + 50);
        })
        .on("broadcast", { event: "reactions" }, async ({ payload }) => {
          const id = typeof payload?.messageId === "string" ? payload.messageId : null;
          if (!id) return;
          const fresh = await loadReactions([id]);
          if (fresh.ok) setItems((prev) => prev.map((m) => (m.id === id ? { ...m, reactions: fresh.data[id] ?? [] } : m)));
        })
        .on("broadcast", { event: "pins" }, async () => {
          const fresh = await loadPins(thread.id);
          if (fresh.ok) {
            setPins(fresh.data);
            const pinned = new Set(fresh.data.map((p) => p.messageId));
            setItems((prev) => prev.map((m) => ({ ...m, pinned: pinned.has(m.id) })));
          }
        })
        .on("broadcast", { event: "read" }, async () => {
          const fresh = await loadReceipt(thread.id);
          if (fresh.ok) setReceipt(fresh.data);
        })
        .subscribe();
      const channel = pings;
      pingRef.current = (event, payload) => void channel.send({ type: "broadcast", event, payload });
    });
    return () => {
      alive = false;
      pingRef.current = null;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (changes) void supabase.removeChannel(changes);
      if (pings) void supabase.removeChannel(pings);
    };
  }, [thread.id, meId, markRead, scrollDown]);

  const onTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_EVERY_MS) return;
    lastTypingSent.current = now;
    ping("typing", { userId: meId });
  }, [ping, meId]);

  async function send(body: string, image: File | null, quoted: ReplyTarget | null, clientId = crypto.randomUUID()) {
    const now = new Date().toISOString();
    setItems((prev) => [
      ...prev.filter((m) => m.clientId !== clientId),
      {
        id: clientId,
        clientId,
        senderId: meId,
        body,
        imageUrl: image ? URL.createObjectURL(image) : null,
        imageWidth: null,
        imageHeight: null,
        createdAt: now,
        timeLabel: clockTime(now),
        edited: false,
        deleted: false,
        replyTo: quoted,
        reactions: [],
        pinned: false,
        link: null,
        status: "sending",
      },
    ]);
    scrollDown();
    const form = new FormData();
    form.set("threadId", thread.id);
    form.set("body", body);
    if (quoted) form.set("replyTo", quoted.id);
    if (image) form.set("image", image);
    const result = await sendMessage(form).catch(() => null);
    setItems((prev) => {
      if (!result?.ok) {
        return prev.map((m) => (m.clientId === clientId ? { ...m, status: "failed" as const, retry: { body, image, replyTo: quoted } } : m));
      }
      // Realtime may already have delivered the row: keep one copy.
      const delivered = prev.some((m) => m.id === result.data.id);
      return delivered
        ? prev.filter((m) => m.clientId !== clientId)
        : prev.map((m) =>
            m.clientId === clientId
              ? { ...m, id: result.data.id, clientId: undefined, status: "sent" as const, createdAt: result.data.createdAt, imageUrl: result.data.imageUrl ?? m.imageUrl }
              : m,
          );
    });
    return result;
  }

  function jumpTo(messageId: string): boolean {
    const el = document.getElementById(`m-${messageId}`);
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    setHighlight(messageId);
    setTimeout(() => setHighlight((h) => (h === messageId ? null : h)), 2_500);
    return true;
  }

  // A search result link (#m-<id>) opens the thread at that message.
  useEffect(() => {
    const target = window.location.hash.match(/^#m-([0-9a-f-]{36})$/)?.[1];
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`m-${target}`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      setHighlight(target);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const title =
    thread.type === "group" ? (
      thread.ventureId ? (
        <Link href={`/ventures/${thread.ventureId}` as Route} className="underline-offset-4 hover:underline">
          {thread.title}
        </Link>
      ) : (
        thread.title
      )
    ) : thread.username ? (
      <Link href={`/profile/${thread.username}` as Route} className="underline-offset-4 hover:underline">
        {thread.title}
      </Link>
    ) : (
      thread.title
    );

  const typingNames = Object.keys(typing)
    .map((id) => byId.get(id))
    .filter((p): p is ChatPerson => Boolean(p && !p.blocked))
    .map((p) => p.name.split(" ")[0]);
  const lastMine = [...items].reverse().find((m) => m.senderId === meId && m.status === "sent" && !m.deleted);
  const seenId = thread.type === "dm" && receipt && lastMine && receipt >= lastMine.createdAt ? lastMine.id : null;

  return (
    <section className="flex h-[calc(100dvh-9rem)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface" aria-labelledby="thread-title">
      <header className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/chat" className="text-body-sm text-text-secondary underline-offset-4 hover:underline md:hidden">
            All chats
          </Link>
          {thread.type === "group" ? <UsersThree aria-hidden weight="bold" className="size-5 shrink-0 text-text-secondary" /> : null}
          <h2 id="thread-title" className="truncate text-h4">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" aria-pressed={searching} aria-label="Search this chat" onClick={() => setSearching((v) => !v)}>
            <MagnifyingGlass aria-hidden weight="bold" className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={muted}
            onClick={async () => {
              const result = await muteThread(thread.id, muted ? 0 : 8760);
              if (result.ok) {
                setMuted(!muted);
                router.refresh();
              }
            }}
          >
            {muted ? <BellSlash aria-hidden weight="bold" className="size-4" /> : <BellSimple aria-hidden weight="bold" className="size-4" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
        </div>
      </header>

      {searching ? <ThreadSearch threadId={thread.id} onPick={jumpTo} onClose={() => setSearching(false)} /> : null}

      {pins.length ? (
        <nav aria-label="Pinned messages" className="flex flex-col gap-1 border-b border-border-default bg-bg-subtle px-4 py-2" data-testid="pins">
          {pins.map((p) => (
            <button
              key={p.messageId}
              type="button"
              onClick={() => jumpTo(p.messageId)}
              className="flex min-h-6 items-center gap-2 text-left text-body-sm underline-offset-4 hover:underline"
            >
              <PushPin aria-hidden weight="fill" className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">
                <span className="font-semibold">{p.senderId === meId ? "You" : (byId.get(p.senderId)?.name ?? "Former member")}:</span> {p.excerpt}
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      {!online ? (
        <p role="status" className="flex items-center gap-2 bg-bg-subtle px-4 py-2 text-body-sm text-text-secondary" data-testid="reconnecting">
          <WifiSlash aria-hidden weight="bold" className="size-4" /> Reconnecting… new messages will appear when you&apos;re back.
        </p>
      ) : null}

      <ol ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" aria-live="polite" aria-label="Messages" data-testid="messages">
        {hasOlder ? (
          <li className="text-center text-caption text-text-secondary">Older messages aren&apos;t shown.</li>
        ) : null}
        {items.length === 0 ? (
          <li className="m-auto text-center text-body-sm text-text-secondary">No messages yet. Say hello.</li>
        ) : null}
        {items.map((m, i) => {
          const mine = m.senderId === meId;
          const person = byId.get(m.senderId);
          const showName = thread.type === "group" && !mine && items[i - 1]?.senderId !== m.senderId;
          const quotedName = m.replyTo ? (m.replyTo.senderId === meId ? "You" : (byId.get(m.replyTo.senderId ?? "")?.name ?? "Someone")) : null;
          return (
            <li
              key={m.clientId ?? m.id}
              id={`m-${m.id}`}
              className={cn(
                "flex max-w-[85%] flex-col gap-0.5 rounded-lg transition-shadow",
                mine ? "self-end items-end" : "self-start items-start",
                highlight === m.id && "ring-2 ring-focus-ring ring-offset-2 ring-offset-bg-surface",
              )}
              data-testid="message"
              data-status={m.status}
            >
              {showName ? (
                <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                  {person && !person.blocked ? <Avatar name={person.name} src={person.avatarUrl} size="sm" className="size-5" /> : null}
                  {person ? person.name : "Former member"}
                </span>
              ) : null}
              <MessageBubble
                item={m}
                mine={mine}
                quotedName={quotedName}
                seen={seenId === m.id}
                canPin={canPin && thread.type === "group"}
                onJump={jumpTo}
                onRetry={() => m.retry && void send(m.retry.body, m.retry.image, m.retry.replyTo, m.clientId)}
                onReply={() => setReplyTo({ id: m.id, senderId: m.senderId, excerpt: excerptOf(m) })}
                onReacted={(reactions) => {
                  setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions } : x)));
                  ping("reactions", { messageId: m.id });
                }}
                onPinned={(next) => {
                  setPins(next);
                  const pinned = new Set(next.map((p) => p.messageId));
                  setItems((prev) => prev.map((x) => ({ ...x, pinned: pinned.has(x.id) })));
                  ping("pins");
                }}
                threadId={thread.id}
              />
            </li>
          );
        })}
      </ol>

      <p className="min-h-5 px-4 text-caption text-text-secondary" aria-live="polite" data-testid="typing">
        {typingNames.length ? `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…` : ""}
      </p>

      <Composer
        onSend={(body, image) => {
          const quoted = replyTo;
          setReplyTo(null);
          return send(body, image, quoted);
        }}
        onTyping={onTyping}
        replyTo={replyTo}
        replyName={replyTo ? (replyTo.senderId === meId ? "yourself" : (byId.get(replyTo.senderId ?? "")?.name ?? "someone")) : null}
        onCancelReply={() => setReplyTo(null)}
      />
    </section>
  );
}

function ThreadSearch({ threadId, onPick, onClose }: { threadId: string; onPick: (id: string) => boolean; onClose: () => void }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    const run = ++seq.current;
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      const result = await searchChats(query, threadId);
      if (run !== seq.current) return;
      setHits(result.ok ? result.data : []);
      setNote(result.ok ? null : result.message);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, threadId]);

  const shown = q.trim().length >= 2 ? hits : null;
  return (
    <div className="flex flex-col gap-2 border-b border-border-default px-4 py-3" role="search">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Search this chat
        </label>
        <Input id={id} type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this chat" className="flex-1" />
        <Button variant="ghost" size="sm" aria-label="Close search" onClick={onClose}>
          <X aria-hidden weight="bold" className="size-4" />
        </Button>
      </div>
      {note ? <FieldError>{note}</FieldError> : null}
      {shown ? (
        shown.length ? (
          <ul className="flex max-h-48 flex-col overflow-y-auto" data-testid="thread-search-results">
            {shown.map((h) => (
              <li key={h.messageId}>
                <button
                  type="button"
                  className="flex w-full min-h-8 flex-col items-start rounded-md px-2 py-1 text-left hover:bg-bg-subtle"
                  onClick={() => {
                    if (!onPick(h.messageId)) setNote("That message is older than what's loaded here.");
                  }}
                >
                  <span className="text-caption text-text-secondary">
                    {h.senderName} · {h.timeLabel}
                  </span>
                  <span className="line-clamp-2 text-body-sm">{h.excerpt}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-text-secondary">No messages match.</p>
        )
      ) : null}
    </div>
  );
}

function MessageBubble({
  item: m,
  mine,
  quotedName,
  seen,
  canPin,
  threadId,
  onJump,
  onRetry,
  onReply,
  onReacted,
  onPinned,
}: {
  item: Item;
  mine: boolean;
  quotedName: string | null;
  seen: boolean;
  canPin: boolean;
  threadId: string;
  onJump: (id: string) => boolean;
  onRetry: () => void;
  onReply: () => void;
  onReacted: (reactions: Reaction[]) => void;
  onPinned: (pins: ChatPin[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState(m.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (m.deleted) {
    return <p className="rounded-lg bg-bg-subtle px-3 py-2 text-body-sm text-text-secondary italic">Message deleted</p>;
  }
  const react = (emoji: string) =>
    startTransition(async () => {
      setPicking(false);
      const result = await toggleReaction(m.id, emoji);
      if (result.ok) onReacted(result.data);
      else setError(result.message);
    });
  const sent = m.status === "sent";
  return (
    <>
      <div className={cn("rounded-lg px-3 py-2", mine ? "bg-primary-subtle" : "bg-bg-subtle", m.status === "failed" && "border border-error")}>
        {m.replyTo ? (
          <button
            type="button"
            onClick={() => onJump(m.replyTo!.id)}
            className="mb-1 flex w-full flex-col border-l-2 border-border-strong pl-2 text-left text-caption text-text-secondary"
            data-testid="reply-quote"
          >
            <span className="font-semibold">{quotedName}</span>
            <span className="line-clamp-2">{m.replyTo.excerpt}</span>
          </button>
        ) : null}
        {m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL from our private bucket, already sized
          <img src={m.imageUrl} alt="" width={m.imageWidth ?? undefined} height={m.imageHeight ?? undefined} className="mb-1 max-h-72 w-auto rounded-md object-contain" />
        ) : null}
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await editMessage(m.id, text);
                if (result.ok) setEditing(false);
                else setError(result.message);
              });
            }}
          >
            <Textarea aria-label="Edit message" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={10000} />
            <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                Save
              </Button>
            </div>
          </form>
        ) : m.body ? (
          <p className="text-body-sm break-words whitespace-pre-wrap">
            {linkify(m.body).map((part, i) =>
              part.kind === "link" ? (
                <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline underline-offset-4">
                  {part.value}
                </a>
              ) : (
                <span key={i}>{part.value}</span>
              ),
            )}
          </p>
        ) : null}
        {m.link && !m.imageUrl && !editing ? <LinkPreview link={m.link} /> : null}
      </div>
      {m.reactions.length ? (
        <ul className="flex flex-wrap gap-1" aria-label="Reactions" data-testid="reactions">
          {m.reactions.map((r) => (
            <li key={r.emoji}>
              <button
                type="button"
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ", including you" : ""}`}
                onClick={() => react(r.emoji)}
                className={cn(
                  "inline-flex min-h-6 items-center gap-1 rounded-full border px-2 text-caption",
                  r.mine ? "border-primary bg-primary-subtle" : "border-border-default bg-bg-surface",
                )}
              >
                <span aria-hidden>{r.emoji}</span>
                <span aria-hidden>{r.count}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picking ? (
        <div role="group" aria-label="Pick a reaction" className="flex gap-1 rounded-full border border-border-default bg-bg-surface p-1 shadow-1">
          {REACTIONS.map((emoji) => (
            <button key={emoji} type="button" aria-label={`React ${emoji}`} onClick={() => react(emoji)} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-bg-subtle">
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>
      ) : null}
      <span className="flex flex-wrap items-center gap-x-2 text-caption text-text-secondary">
        <time dateTime={m.createdAt}>{m.timeLabel}</time>
        {m.edited ? <span>· edited</span> : null}
        {m.pinned ? (
          <span className="inline-flex items-center gap-0.5">
            · <PushPin aria-hidden weight="fill" className="size-3" /> pinned
          </span>
        ) : null}
        {seen ? <span data-testid="seen">· Seen</span> : null}
        {m.status === "sending" ? <span>· sending</span> : null}
        {m.status === "failed" ? (
          <>
            <span className="text-text-error">· not sent</span>
            <button type="button" onClick={onRetry} className="inline-flex min-h-6 items-center gap-1 underline underline-offset-4">
              <ArrowClockwise aria-hidden weight="bold" className="size-3.5" /> Retry
            </button>
          </>
        ) : null}
        {sent && !editing ? (
          <>
            <button type="button" className="inline-flex min-h-6 items-center gap-0.5 underline-offset-4 hover:underline" onClick={onReply}>
              <ArrowBendUpLeft aria-hidden weight="bold" className="size-3" /> Reply
            </button>
            <button
              type="button"
              aria-expanded={picking}
              className="inline-flex min-h-6 items-center gap-0.5 underline-offset-4 hover:underline"
              onClick={() => setPicking((v) => !v)}
            >
              <Smiley aria-hidden weight="bold" className="size-3" /> React
            </button>
            {canPin ? (
              <button
                type="button"
                className="min-h-6 underline-offset-4 hover:underline"
                onClick={() =>
                  startTransition(async () => {
                    const result = await pinMessage(threadId, m.id, !m.pinned);
                    if (result.ok) onPinned(result.data);
                    else setError(result.message);
                  })
                }
              >
                {m.pinned ? "Unpin" : "Pin"}
              </button>
            ) : null}
          </>
        ) : null}
        {mine && sent && !editing ? (
          <>
            {m.body ? (
              <button type="button" className="min-h-6 underline-offset-4 hover:underline" onClick={() => setEditing(true)}>
                Edit
              </button>
            ) : null}
            <button
              type="button"
              className="min-h-6 underline-offset-4 hover:underline"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteMessage(m.id);
                  if (!result.ok) setError(result.message);
                })
              }
            >
              Delete
            </button>
          </>
        ) : null}
      </span>
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  );
}

function LinkPreview({ link }: { link: ChatLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="mt-1 flex flex-col gap-0.5 rounded-md border border-border-default bg-bg-surface p-2 hover:border-border-strong"
      data-testid="chat-link-preview"
    >
      {link.siteName ? <span className="text-caption text-text-secondary">{link.siteName}</span> : null}
      <span className="line-clamp-2 text-body-sm font-semibold">{link.title ?? link.url}</span>
      {link.description ? <span className="line-clamp-2 text-caption text-text-secondary">{link.description}</span> : null}
    </a>
  );
}

function Composer({
  onSend,
  onTyping,
  replyTo,
  replyName,
  onCancelReply,
}: {
  onSend: (body: string, image: File | null) => Promise<unknown>;
  onTyping: () => void;
  replyTo: ReplyTarget | null;
  replyName: string | null;
  onCancelReply: () => void;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (replyTo) textRef.current?.focus();
  }, [replyTo]);

  const submit = () => {
    const body = text;
    if (!body.trim() && !image) return;
    setText("");
    const img = image?.file ?? null;
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
    setError(null);
    void onSend(body, img);
  };

  return (
    <form
      className="flex flex-col gap-2 border-t border-border-default p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {replyTo ? (
        <div className="flex items-start justify-between gap-2 rounded-md border-l-2 border-primary bg-bg-subtle px-3 py-2" data-testid="replying-to">
          <span className="min-w-0 text-caption">
            <span className="font-semibold">Replying to {replyName}</span>
            <span className="line-clamp-1 text-text-secondary">{replyTo.excerpt}</span>
          </span>
          <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-bg-muted">
            <X aria-hidden weight="bold" className="size-3.5" />
          </button>
        </div>
      ) : null}
      {image ? (
        <div className="relative w-24">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={image.url} alt="" className="aspect-square w-24 rounded-md object-cover" />
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => {
              URL.revokeObjectURL(image.url);
              setImage(null);
            }}
            className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full bg-bg-page/90 focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <X aria-hidden weight="bold" className="size-4" />
          </button>
        </div>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Attach an image"
          data-testid="chat-image"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPreparing(true);
            try {
              const [prepared] = await prepareImages([], [f], 1);
              setImage({ file: prepared, url: URL.createObjectURL(prepared) });
            } catch (err) {
              setError(err instanceof Error ? err.message : "That image couldn't be added.");
            } finally {
              setPreparing(false);
              if (fileInput.current) fileInput.current.value = "";
            }
          }}
        />
        <Button type="button" variant="ghost" size="sm" aria-label="Add an image" loading={preparing} onClick={() => fileInput.current?.click()}>
          <ImageSquare aria-hidden weight="bold" className="size-5" />
        </Button>
        <label htmlFor={id} className="sr-only">
          Message
        </label>
        <Textarea
          ref={textRef}
          id={id}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && replyTo) onCancelReply();
          }}
          rows={1}
          maxLength={10000}
          placeholder="Write a message"
          className="min-h-11 flex-1 resize-none"
        />
        <Button type="submit" aria-label="Send" disabled={preparing}>
          <PaperPlaneRight aria-hidden weight="bold" className="size-5" />
        </Button>
      </div>
    </form>
  );
}
