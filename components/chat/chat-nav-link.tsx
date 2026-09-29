"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Header "Chat" link with the unread count, live over Realtime (PRD 5.9 unread badges). */
export function ChatNavLink({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = () =>
      supabase.rpc("unread_chat_count").then(({ data }) => {
        if (alive && typeof data === "number") setCount(data);
      });
    void refresh();
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      channel = supabase
        .channel(`chat-badge:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
          if ((payload.new as { sender_id?: string }).sender_id !== userId) setTimeout(() => void refresh(), 1500);
        })
        .subscribe();
    });
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, pathname]);
  return (
    <Link
      href="/chat"
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
      data-testid="chat-link"
    >
      Chat
      {count > 0 ? (
        <span className="rounded-full bg-primary px-1.5 text-caption font-semibold text-text-on-primary" data-testid="chat-badge">
          {count > 99 ? "99+" : count}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
    </Link>
  );
}
