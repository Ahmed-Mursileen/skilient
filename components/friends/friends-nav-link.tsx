"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Header "Friends" link with the number of unanswered requests (PRD 5.8 Realtime badge).
 * The count comes from pending_friend_request_count(); a Realtime subscription on the
 * receiver's own friend_requests (RLS applies to the stream) and each navigation re-read it.
 */
export function FriendsNavLink({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const refresh = () =>
      supabase.rpc("pending_friend_request_count").then(({ data }) => {
        if (alive && typeof data === "number") setCount(data);
      });
    void refresh();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Realtime applies RLS with the socket's token, so load the signed-in JWT before joining
    // (setAuth() without an argument asks the client for it); otherwise the channel can join
    // as anon and never receive a row.
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      channel = supabase
        .channel(`friend-requests:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${userId}` }, () => {
          void refresh();
        })
        .subscribe();
    });
    return () => {
      alive = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, pathname]);

  return (
    <Link
      href="/friends"
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
      data-testid="friends-link"
    >
      Friends
      {count > 0 ? (
        <span className="rounded-full bg-primary px-1.5 text-caption font-semibold text-text-on-primary" data-testid="friends-badge">
          {count > 99 ? "99+" : count}
          <span className="sr-only"> {count === 1 ? "request" : "requests"} waiting</span>
        </span>
      ) : null}
    </Link>
  );
}
