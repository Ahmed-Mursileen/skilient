"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar } from "@/components/ui";
import { markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/cn";

/** One notification: opening it marks it read, then goes where it points. */
export function NotificationRow({
  id,
  text,
  href,
  actorName,
  actorAvatarUrl,
  read,
  createdAt,
  timeLabel,
}: {
  id: string;
  text: string;
  href: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  read: boolean;
  createdAt: string;
  timeLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <li data-testid="notification" data-read={read ? "true" : "false"}>
      <a
        href={href}
        aria-busy={pending || undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          startTransition(async () => {
            if (!read) await markNotificationRead(id);
            router.push(href as Route);
          });
        }}
        className={cn(
          "flex items-start gap-3 px-4 py-3 hover:bg-bg-subtle focus-visible:bg-bg-subtle",
          !read && "bg-primary-subtle/40",
        )}
      >
        <Avatar name={actorName ?? "Skilient"} src={actorAvatarUrl} size="sm" />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-body", !read && "font-semibold")}>{text}</span>
          <span className="block text-caption text-text-secondary">
            <time dateTime={createdAt}>{timeLabel}</time>
            {!read ? <span className="sr-only">, unread</span> : null}
          </span>
        </span>
        {!read ? <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
      </a>
    </li>
  );
}
