"use client";

import { ArrowClockwise, BellSimple, BellSlash, ImageSquare, PaperPlaneRight, UsersThree, WifiSlash, X } from "@phosphor-icons/react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Avatar, Button, FieldError, Textarea } from "@/components/ui";
import { deleteMessage, editMessage, markThreadRead, muteThread, sendMessage, signImages } from "@/lib/actions/chat";
import type { ChatMessage, ChatPerson, ThreadRow } from "@/lib/data/chat";
import { prepareImages } from "@/lib/images/downscale";
import { linkify } from "@/lib/format/linkify";
import { clockTime } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type Status = "sent" | "sending" | "failed";
interface Item extends ChatMessage {
  status: Status;
  /** Client id for optimistic messages until the server's id arrives. */
  clientId?: string;
  retry?: { body: string; image: File | null };
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
}


/**
 * A conversation (PRD 5.9, screen spec 3.5): Realtime delivery with a visible
 * "Reconnecting" state, optimistic sends that turn into Retry on failure, one image per
 * message, edit and delete for your own messages, and read marks as you look.
 */
export function Conversation({
  thread,
  people,
  initial,
  hasOlder,
  meId,
}: {
  thread: ThreadRow;
  people: ChatPerson[];
  initial: ChatMessage[];
  hasOlder: boolean;
  meId: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(() => initial.map((m) => ({ ...m, status: "sent" as const })));
  const [online, setOnline] = useState(true);
  const [muted, setMuted] = useState(thread.muted);
  const listRef = useRef<HTMLOListElement>(null);
  const byId = new Map(people.map((p) => [p.userId, p]));

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: "end" }));
  }, []);

  // Read marks: on open, on focus, and when a message arrives while the tab is visible.
  const markRead = useCallback(() => {
    if (document.visibilityState === "visible") void markThreadRead(thread.id);
  }, [thread.id]);
  useEffect(() => {
    markRead();
    scrollDown();
    window.addEventListener("focus", markRead);
    return () => window.removeEventListener("focus", markRead);
  }, [markRead, scrollDown]);

  // Realtime: inserts and edits for this thread (RLS limits the stream to members).
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const onOffline = () => setOnline(false);
    const onOnline = () => setOnline(true);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      channel = supabase
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
            const next: Item = {
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
              status: "sent",
            };
            const at = prev.findIndex((m) => m.id === row.id);
            if (at >= 0) {
              const copy = [...prev];
              copy[at] = { ...copy[at], ...next, imageUrl: next.imageUrl ?? (next.deleted ? null : copy[at].imageUrl) };
              return copy;
            }
            return [...prev, next];
          });
          if (payload.eventType === "INSERT") {
            scrollDown();
            if (row.sender_id !== meId) markRead();
          }
        })
        .subscribe((status) => {
          if (!alive) return;
          setOnline(status === "SUBSCRIBED");
        });
    });
    return () => {
      alive = false;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [thread.id, meId, markRead, scrollDown]);

  async function send(body: string, image: File | null, clientId = crypto.randomUUID()) {
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
        status: "sending",
      },
    ]);
    scrollDown();
    const form = new FormData();
    form.set("threadId", thread.id);
    form.set("body", body);
    if (image) form.set("image", image);
    const result = await sendMessage(form).catch(() => null);
    setItems((prev) => {
      if (!result?.ok) {
        return prev.map((m) => (m.clientId === clientId ? { ...m, status: "failed" as const, retry: { body, image } } : m));
      }
      // Realtime may already have delivered the row: keep one copy.
      const delivered = prev.some((m) => m.id === result.data.id);
      return delivered
        ? prev.filter((m) => m.clientId !== clientId)
        : prev.map((m) =>
            m.clientId === clientId
              ? { ...m, id: result.data.id, clientId: undefined, status: "sent" as const, imageUrl: result.data.imageUrl ?? m.imageUrl }
              : m,
          );
    });
    return result;
  }

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
      </header>

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
          return (
            <li key={m.clientId ?? m.id} className={cn("flex max-w-[85%] flex-col gap-0.5", mine ? "self-end items-end" : "self-start items-start")} data-testid="message" data-status={m.status}>
              {showName ? (
                <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                  {person && !person.blocked ? <Avatar name={person.name} src={person.avatarUrl} size="sm" className="size-5" /> : null}
                  {person ? person.name : "Former member"}
                </span>
              ) : null}
              <MessageBubble item={m} mine={mine} onRetry={() => m.retry && void send(m.retry.body, m.retry.image, m.clientId)} />
            </li>
          );
        })}
      </ol>

      <Composer onSend={send} />
    </section>
  );
}

function MessageBubble({ item: m, mine, onRetry }: { item: Item; mine: boolean; onRetry: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (m.deleted) {
    return <p className="rounded-lg bg-bg-subtle px-3 py-2 text-body-sm text-text-secondary italic">Message deleted</p>;
  }
  return (
    <>
      <div className={cn("rounded-lg px-3 py-2", mine ? "bg-primary-subtle" : "bg-bg-subtle", m.status === "failed" && "border border-error")}>
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
      </div>
      <span className="flex items-center gap-2 text-caption text-text-secondary">
        <time dateTime={m.createdAt}>{m.timeLabel}</time>
        {m.edited ? <span>· edited</span> : null}
        {m.status === "sending" ? <span>· sending</span> : null}
        {m.status === "failed" ? (
          <>
            <span className="text-text-error">· not sent</span>
            <button type="button" onClick={onRetry} className="inline-flex min-h-6 items-center gap-1 underline underline-offset-4">
              <ArrowClockwise aria-hidden weight="bold" className="size-3.5" /> Retry
            </button>
          </>
        ) : null}
        {mine && m.status === "sent" && !editing ? (
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

function Composer({ onSend }: { onSend: (body: string, image: File | null) => Promise<unknown> }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

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
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
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
