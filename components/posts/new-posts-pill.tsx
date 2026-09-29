"use client";

import { ArrowUp } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "New posts" pill (PRD 5.6): new posts in this feed never jump in mid-scroll; the pill
 * appears instead, and tapping it loads a freshly ranked feed from the top.
 */
export function NewPostsPill({ userId, scope, universityId }: { userId: string; scope: "university" | "global"; universityId: string | null }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      channel = supabase
        .channel(`feed:${scope}:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
          const row = payload.new as { author_id?: string; audience?: string; university_id?: string | null };
          if (row.author_id === userId) return;
          const inScope = scope === "global" ? row.audience === "global" : row.university_id === universityId;
          if (inScope) setCount((c) => c + 1);
        })
        .subscribe();
    });
    return () => {
      alive = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, scope, universityId]);

  if (!count) return null;
  return (
    <div className="sticky top-3 z-10 flex justify-center" data-testid="new-posts-pill">
      <button
        type="button"
        onClick={() => {
          setCount(0);
          window.scrollTo({ top: 0, behavior: "smooth" });
          router.refresh();
        }}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-body-sm font-semibold text-text-on-primary shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <ArrowUp aria-hidden weight="bold" className="size-4" />
        {count === 1 ? "1 new post" : `${count} new posts`}
      </button>
    </div>
  );
}
