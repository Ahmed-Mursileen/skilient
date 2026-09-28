"use client";

import { ChatCircle, Globe, Megaphone, PushPin, RocketLaunch, UsersThree } from "@phosphor-icons/react";
import type { Route } from "next";
import Link from "next/link";
import { useRef, useState } from "react";
import { EventBlock } from "@/components/posts/event-block";
import { InsightsButton } from "@/components/posts/insights-button";
import { PollBlock } from "@/components/posts/poll-block";
import { PostMenu } from "@/components/posts/post-menu";
import { SurveyStrip } from "@/components/posts/survey-strip";
import { useQualifiedView } from "@/components/posts/view-tracker";
import { FoldedPost, ViewerActions } from "@/components/posts/viewer-actions";
import { Avatar, Badge, Button } from "@/components/ui";
import type { PostCardData } from "@/lib/data/posts";
import { SURVEYED_TYPES } from "@/lib/posts/constants";
import { linkify } from "@/lib/format/linkify";
import { shortTime } from "@/lib/format/time";
import { cn } from "@/lib/cn";

const TYPE_LABEL: Partial<Record<PostCardData["type"], string>> = {
  invite: "Venture invite",
  announcement: "Announcement",
  event: "Event",
  poll: "Poll",
  shipped: "Shipped",
};

/**
 * One post (PRD 5.28). No like, reaction, save or share controls exist; the micro-survey
 * strip (slice 5) and comments (slice 4) attach below the body.
 */
export function PostCard({ post, headingLevel = 2, showCommentsLink = true }: { post: PostCardData; headingLevel?: 2 | 3; showCommentsLink?: boolean }) {
  const [gone, setGone] = useState(false);
  const [folded, setFolded] = useState<"hidden" | "muted" | null>(null);
  const ref = useRef<HTMLElement>(null);
  const { shownAt, qualified } = useQualifiedView(ref, post.id, !post.isMine);
  if (gone) return null;
  if (folded) {
    return <FoldedPost state={folded} postId={post.id} authorUsername={post.author.username} authorName={post.author.name} onUndo={() => setFolded(null)} />;
  }
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const label = TYPE_LABEL[post.type];
  const pinned = post.pinned;

  return (
    <article
      ref={ref}
      className={cn("flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4 sm:p-5", pinned && "border-primary")}
      aria-labelledby={`post-${post.id}-by`}
      data-testid="post"
      data-post-id={post.id}
      data-type={post.type}
    >
      <header className="flex items-start gap-3">
        <Avatar name={post.author.name} src={post.author.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <Heading id={`post-${post.id}-by`} className="text-body font-semibold">
            {post.author.username ? (
              <Link href={`/profile/${post.author.username}` as Route} className="underline-offset-4 hover:underline">
                {post.author.name}
              </Link>
            ) : (
              post.author.name
            )}
          </Heading>
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-text-secondary">
            <Link href={`/post/${post.id}` as Route} className="inline-flex min-h-6 items-center hover:underline">
              <time dateTime={post.createdAt} suppressHydrationWarning>
                {shortTime(post.createdAt)}
              </time>
            </Link>
            {post.editedAt ? <span>· edited</span> : null}
            <span className="inline-flex items-center gap-1">
              ·{" "}
              {post.audience === "global" ? (
                <>
                  <Globe aria-hidden weight="bold" className="size-3.5" /> Global
                </>
              ) : (
                <>
                  <UsersThree aria-hidden weight="bold" className="size-3.5" /> University
                </>
              )}
            </span>
          </p>
        </div>
        {label ? (
          <Badge tone={post.type === "shipped" ? "verified" : post.type === "announcement" ? "primary" : "neutral"}>
            {post.type === "shipped" ? <RocketLaunch aria-hidden weight="bold" className="size-3.5" /> : null}
            {post.type === "announcement" ? <Megaphone aria-hidden weight="bold" className="size-3.5" /> : null}
            {label}
          </Badge>
        ) : null}
      </header>

      {pinned ? (
        <p className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary">
          <PushPin aria-hidden weight="bold" className="size-3.5" /> Pinned
        </p>
      ) : null}

      <p className="text-body break-words whitespace-pre-line">
        {linkify(post.body).map((part, i) =>
          part.kind === "link" ? (
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline underline-offset-4">
              {part.value}
            </a>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </p>

      {post.images.length ? <PostImages images={post.images} /> : null}
      {post.event ? <EventBlock postId={post.id} event={post.event} /> : null}
      {post.poll ? <PollBlock postId={post.id} poll={post.poll} isMine={post.isMine} /> : null}
      {post.type === "invite" || post.type === "shipped" ? <VentureBlock post={post} /> : null}

      {post.link && !post.images.length ? <LinkPreview link={post.link} /> : null}

      {post.survey ? (
        <SurveyStrip postId={post.id} survey={post.survey} shownAt={shownAt} qualified={qualified} publicLine={<PublicLine parts={post.publicLine} />} />
      ) : post.publicLine.length ? (
        <p className="text-body-sm text-text-secondary">
          <PublicLine parts={post.publicLine} />
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border-muted pt-2">
        {showCommentsLink ? (
          <Link
            href={`/post/${post.id}#comments` as Route}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-body-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
          >
            <ChatCircle aria-hidden weight="bold" className="size-4" />
            {post.commentCount === 0 ? "Comment" : `${post.commentCount} ${post.commentCount === 1 ? "comment" : "comments"}`}
          </Link>
        ) : (
          <span />
        )}
        {post.isMine ? (
          <div className="flex flex-wrap items-center gap-1">
            {(SURVEYED_TYPES as readonly string[]).includes(post.type) ? <InsightsButton postId={post.id} /> : null}
            {post.type !== "shipped" ? <PostMenu postId={post.id} body={post.body} canEdit={post.canEdit} onDeleted={() => setGone(true)} /> : null}
          </div>
        ) : (
          <ViewerActions postId={post.id} authorUsername={post.author.username} authorName={post.author.name} onChange={setFolded} />
        )}
      </footer>
    </article>
  );
}

/** "12 people find this informative · 8 find this interesting" (raw people, 3+ only). */
function PublicLine({ parts }: { parts: PostCardData["publicLine"] }) {
  if (!parts.length) return null;
  return (
    <span data-testid="public-line">
      {parts.map((p, i) => `${p.count} ${i === 0 ? (p.count === 1 ? "person " : "people ") : ""}${p.phrase}`).join(" · ")}
    </span>
  );
}

function LinkPreview({ link }: { link: NonNullable<PostCardData["link"]> }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="flex overflow-hidden rounded-md border border-border-default hover:border-border-strong"
      data-testid="link-preview"
    >
      {/* No third-party preview image: the CSP allows images only from Skilient, and loading
          one would tell the linked site who is reading (decisions.md 2026-09-29). */}
      <span className="flex min-w-0 flex-col gap-0.5 p-3">
        {link.siteName ? <span className="text-caption text-text-secondary">{link.siteName}</span> : null}
        <span className="line-clamp-2 text-body-sm font-semibold">{link.title ?? link.url}</span>
        {link.description ? <span className="line-clamp-2 text-caption text-text-secondary">{link.description}</span> : null}
      </span>
    </a>
  );
}

function PostImages({ images }: { images: PostCardData["images"] }) {
  return (
    <div className={cn("grid gap-1 overflow-hidden rounded-md", images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {images.map((img, i) => (
        <a key={img.url} href={img.url} target="_blank" rel="noopener noreferrer" className={cn(images.length === 3 && i === 0 && "row-span-2")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- user image from our public bucket, already sized */}
          <img
            src={img.url}
            alt=""
            width={img.width}
            height={img.height}
            loading="lazy"
            decoding="async"
            className={cn("size-full bg-bg-subtle object-cover", images.length > 1 ? "aspect-square" : "max-h-[520px]")}
          />
          <span className="sr-only">Open image {i + 1} of {images.length}</span>
        </a>
      ))}
    </div>
  );
}

function VentureBlock({ post }: { post: PostCardData }) {
  const v = post.venture;
  if (!v) {
    return <p className="rounded-md border border-dashed border-border-default px-3 py-2 text-body-sm text-text-secondary">This venture is no longer available.</p>;
  }
  const href = `/ventures/${v.id}` as Route;
  if (post.type === "shipped") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border-default bg-bg-subtle p-3" data-testid="shipped">
        <Link href={href} className="text-h4 underline-offset-4 hover:underline">
          {v.title}
        </Link>
        {v.team?.length ? (
          <p className="text-body-sm text-text-secondary">
            Built by{" "}
            {v.team.map((m, i) => (
              <span key={`${m.name}-${i}`}>
                {i > 0 ? (i === v.team!.length - 1 ? " and " : ", ") : ""}
                {m.username ? (
                  <Link href={`/profile/${m.username}` as Route} className="font-semibold text-text-primary underline-offset-4 hover:underline">
                    {m.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-text-primary">{m.name}</span>
                )}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    );
  }
  const state = v.isMember
    ? "You're on the team"
    : v.myApplication === "pending"
      ? "Requested"
      : v.myApplication === "accepted"
        ? "Accepted"
        : null;
  const open = v.roles.reduce((n, r) => n + r.open, 0);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-default bg-bg-subtle p-3" data-testid="invite">
      <div>
        <Link href={href} className="text-h4 underline-offset-4 hover:underline">
          {v.title}
        </Link>
        <p className="text-body-sm text-text-secondary">
          {v.type === "startup" ? "Startup" : "Project"} · {v.members} of {v.teamSize} members
          {open ? ` · ${open} open ${open === 1 ? "role" : "roles"}` : ""}
        </p>
      </div>
      {v.roles.length ? (
        <ul className="flex flex-wrap gap-2">
          {v.roles.map((r) => (
            <li key={r.title}>
              <Badge>{r.title}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        {state ? (
          <Badge tone={state === "Requested" ? "neutral" : "success"}>{state}</Badge>
        ) : v.status === "recruiting" || v.status === "in_progress" ? (
          <Button asChild size="sm">
            <Link href={href}>Apply</Link>
          </Button>
        ) : (
          <span className="text-body-sm text-text-secondary">Not taking applications.</span>
        )}
      </div>
    </div>
  );
}
