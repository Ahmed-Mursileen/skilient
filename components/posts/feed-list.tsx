"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { PostCard } from "@/components/posts/post-card";
import { Button, FieldError } from "@/components/ui";
import { loadMorePosts } from "@/lib/actions/posts";
import type { PostCardData } from "@/lib/data/posts";

/**
 * Infinite list (PRD 5.6): the server renders the first page; more pages load when the
 * sentinel scrolls into view, or with the button (keyboard and no-JS-observer fallback).
 * Posts already shown are never repeated.
 */
export function FeedList({
  initial,
  cursor: initialCursor,
  scope,
  filter,
  authorId,
  empty,
}: {
  initial: PostCardData[];
  cursor: string | null;
  scope: "university" | "global" | "author";
  filter: string;
  authorId?: string;
  empty: React.ReactNode;
}) {
  const [posts, setPosts] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  // A new first page (after a refresh, e.g. a new post) replaces the list.
  const [firstPage, setFirstPage] = useState(initial);
  if (firstPage !== initial) {
    setFirstPage(initial);
    setPosts(initial);
    setCursor(initialCursor);
  }

  const more = useCallback(() => {
    if (!cursor || pending) return;
    startTransition(async () => {
      setError(null);
      const result = await loadMorePosts(scope, filter, cursor, authorId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...result.data.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(result.data.cursor);
    });
  }, [cursor, pending, scope, filter, authorId]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) more();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, more]);

  if (!posts.length) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4" aria-busy={pending || undefined}>
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} />
      {error ? <FieldError>{error}</FieldError> : null}
      {cursor ? (
        <Button variant="ghost" className="self-center" loading={pending} onClick={more}>
          Load more
        </Button>
      ) : (
        <p className="py-4 text-center text-body-sm text-text-secondary" data-testid="feed-end">
          You&apos;re all caught up.
        </p>
      )}
    </div>
  );
}
