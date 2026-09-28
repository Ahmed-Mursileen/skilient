"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar } from "@/components/ui";
import { markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/cn";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });

/** One notification: opening it marks it read, then goes where it points. */
export function NotificationRow({
  id,
  text,
  href,
  actorName,
  actorAvatarUrl,
  read,
  createdAt,
  today,
}: {
  id: string;
  text: string;
  href: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  read: boolean;
  createdAt: string;
  today: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const when = today ? timeFormat.format(new Date(createdAt)) : dateFormat.format(new Date(createdAt));

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
            <time dateTime={createdAt}>{when}</time>
            {!read ? <span className="sr-only">, unread</span> : null}
          </span>
        </span>
        {!read ? <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
      </a>
    </li>
  );
}
