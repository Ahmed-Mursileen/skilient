"use client";

import { BellSlash, UsersThree } from "@phosphor-icons/react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar, FieldError, Input } from "@/components/ui";
import { searchChats, type ChatSearchHit } from "@/lib/actions/chat";
import type { ThreadRow } from "@/lib/data/chat";
import { cn } from "@/lib/cn";

/** Search across your chats (PRD 5.28): 250 ms debounce, stale answers dropped. */
function ChatSearch() {
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ChatSearchHit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    const run = ++seq.current;
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      const result = await searchChats(query);
      if (run !== seq.current) return;
      setHits(result.ok ? result.data : []);
      setNote(result.ok ? null : result.message);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const active = q.trim().length >= 2;
  return (
    <div className="flex flex-col gap-2" role="search">
      <label htmlFor={id} className="sr-only">
        Search messages
      </label>
      <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" />
      {note ? <FieldError>{note}</FieldError> : null}
      {active ? (
        hits.length ? (
          <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border-default bg-bg-surface" data-testid="chat-search-results">
            {hits.map((h) => (
              <li key={h.messageId}>
                <Link href={`/chat/${h.threadId}#m-${h.messageId}` as Route} className="flex flex-col gap-0.5 px-3 py-2 hover:bg-bg-subtle">
                  <span className="flex justify-between gap-2 text-caption text-text-secondary">
                    <span className="truncate font-semibold text-text-primary">{h.threadTitle}</span>
                    <span className="shrink-0">{h.timeLabel}</span>
                  </span>
                  <span className="line-clamp-2 text-body-sm">
                    <span className="text-text-secondary">{h.senderName}: </span>
                    {h.excerpt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-body-sm text-text-secondary">No messages match.</p>
        )
      ) : null}
    </div>
  );
}

/** Thread list (screen spec 3.5): DMs and venture group chats with last message and unread count. */
export function ThreadList({ threads }: { threads: ThreadRow[] }) {
  const pathname = usePathname();
  const inThread = pathname !== "/chat";
  return (
    <nav aria-label="Conversations" className={cn("min-w-0 flex-col gap-3 md:flex", inThread ? "hidden" : "flex")}>
      <ChatSearch />
      {threads.length ? (
        <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border-default bg-bg-surface" data-testid="thread-list">
          {threads.map((t) => {
            const active = pathname === `/chat/${t.id}`;
            return (
              <li key={t.id}>
                <Link
                  href={`/chat/${t.id}` as Route}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-3 px-3 py-3 hover:bg-bg-subtle", active && "bg-bg-subtle")}
                  data-testid="thread-row"
                >
                  {t.type === "group" ? (
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-text-secondary">
                      <UsersThree aria-hidden weight="bold" className="size-5" />
                    </span>
                  ) : (
                    <Avatar name={t.title} src={t.avatarUrl} size="md" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-body-sm", t.unread ? "font-semibold" : "font-medium")}>{t.title}</span>
                      <span className="shrink-0 text-caption text-text-secondary">{t.timeLabel}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-caption text-text-secondary">
                        {t.lastMessage ? `${t.lastSenderIsMe ? "You: " : ""}${t.lastMessage}` : "No messages yet"}
                      </span>
                      {t.muted ? <BellSlash aria-label="Muted" weight="bold" className="size-3.5 shrink-0 text-text-secondary" /> : null}
                      {t.unread && !active ? (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 text-caption font-semibold text-text-on-primary" data-testid="thread-unread">
                          {t.unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border-default bg-bg-surface px-4 py-8 text-center text-body-sm text-text-secondary">
          No conversations yet. Message a friend from their profile, or open your venture&apos;s chat.
        </div>
      )}
    </nav>
  );
}
