"use client";

import { PushPin } from "@phosphor-icons/react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Avatar, Button, FieldError, Label, Textarea } from "@/components/ui";
import { addComment, deleteComment, pinComment } from "@/lib/actions/posts";
import type { CommentItem } from "@/lib/data/posts";
import { linkify } from "@/lib/format/linkify";
import { cn } from "@/lib/cn";

/**
 * Comments under a post (PRD 5.28): oldest first, pinned on top, one level of replies,
 * @mentions notify, 10 s between comments. No reactions on comments.
 */
export function Comments({ postId, comments, isPostAuthor }: { postId: string; comments: CommentItem[]; isPostAuthor: boolean }) {
  const top = comments.filter((c) => !c.parentId);
  const replies = (id: string) => comments.filter((c) => c.parentId === id);
  const live = comments.filter((c) => !c.deleted).length;

  return (
    <section id="comments" aria-labelledby="comments-heading" className="flex flex-col gap-4">
      <h2 id="comments-heading" className="text-h4">
        {live === 0 ? "Comments" : `${live} ${live === 1 ? "comment" : "comments"}`}
      </h2>
      <CommentForm postId={postId} parentId={null} label="Add a comment" />
      {top.length ? (
        <ol className="flex flex-col gap-3">
          {top.map((c) => (
            <li key={c.id} className="flex flex-col gap-2">
              <CommentRow comment={c} postId={postId} isPostAuthor={isPostAuthor} canReply />
              {replies(c.id).length ? (
                <ol className="ml-8 flex flex-col gap-2 border-l border-border-muted pl-3 sm:ml-11">
                  {replies(c.id).map((r) => (
                    <li key={r.id}>
                      <CommentRow comment={r} postId={postId} isPostAuthor={isPostAuthor} canReply={false} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-body-sm text-text-secondary">No comments yet. Start the conversation.</p>
      )}
    </section>
  );
}

function CommentRow({ comment: c, postId, isPostAuthor, canReply }: { comment: CommentItem; postId: string; isPostAuthor: boolean; canReply: boolean }) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const act = (fn: () => ReturnType<typeof deleteComment>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  if (c.deleted) {
    return <p className="rounded-md bg-bg-subtle px-3 py-2 text-body-sm text-text-secondary italic" data-testid="comment-deleted">Comment deleted</p>;
  }
  return (
    <article className={cn("flex gap-3", c.pinned && "rounded-md border border-border-default p-2")} data-testid="comment" aria-label={`Comment by ${c.author.name ?? "someone"}`}>
      <Avatar name={c.author.name ?? "?"} src={c.author.avatarUrl} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 text-body-sm">
          {c.author.username ? (
            <Link href={`/profile/${c.author.username}` as Route} className="font-semibold underline-offset-4 hover:underline">
              {c.author.name}
            </Link>
          ) : (
            <span className="font-semibold">{c.author.name}</span>
          )}
          <time dateTime={c.createdAt} className="text-caption text-text-secondary">
            {c.timeLabel}
          </time>
          {c.pinned ? (
            <span className="inline-flex items-center gap-1 text-caption font-semibold text-text-secondary">
              <PushPin aria-hidden weight="bold" className="size-3.5" /> Pinned by the author
            </span>
          ) : null}
        </p>
        <p className="text-body-sm break-words whitespace-pre-line">
          {linkify(c.body).map((part, i) =>
            part.kind === "link" ? (
              <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline underline-offset-4">
                {part.value}
              </a>
            ) : (
              <span key={i}>{part.value}</span>
            ),
          )}
        </p>
        <div className="flex flex-wrap gap-1">
          {canReply ? (
            <Button variant="ghost" size="sm" onClick={() => setReplying((r) => !r)} aria-expanded={replying}>
              Reply
            </Button>
          ) : null}
          {isPostAuthor && canReply ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => pinComment(c.id, !c.pinned))}>
              {c.pinned ? "Unpin" : "Pin"}
            </Button>
          ) : null}
          {c.canDelete ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => deleteComment(c.id))}>
              Delete
            </Button>
          ) : null}
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {replying ? <CommentForm postId={postId} parentId={c.id} label={`Reply to ${c.author.name ?? "this comment"}`} onDone={() => setReplying(false)} autoFocus /> : null}
      </div>
    </article>
  );
}

function CommentForm({ postId, parentId, label, onDone, autoFocus }: { postId: string; parentId: string | null; label: string; onDone?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const result = await addComment(postId, parentId, text);
          if (result.ok) {
            setText("");
            onDone?.();
            router.refresh();
          } else setError(result.message);
        });
      }}
    >
      <Label htmlFor={id} className={parentId ? "sr-only" : undefined}>
        {label}
      </Label>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={parentId ? 2 : 3}
        maxLength={1000}
        placeholder={parentId ? "Write a reply" : "Write a comment. Mention someone with @username."}
        aria-invalid={error ? true : undefined}
        autoFocus={autoFocus}
      />
      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" size="sm" loading={pending} className="self-end">
        {parentId ? "Reply" : "Comment"}
      </Button>
    </form>
  );
}
