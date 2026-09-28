import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";

/** One person in a /friends list: photo, name linking to the profile, meta and actions. */
export function FriendRow({
  username,
  fullName,
  avatarUrl,
  meta,
  actions,
}: {
  username: string;
  fullName: string;
  avatarUrl?: string | null;
  meta?: string | null;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="friend-row" data-username={username}>
      <Avatar name={fullName} src={avatarUrl ?? null} size="md" />
      <span className="min-w-0 flex-1">
        <Link
          href={`/profile/${username}` as Route}
          className="block truncate text-body font-semibold underline-offset-4 hover:underline"
        >
          {fullName}
        </Link>
        <span className="block truncate text-body-sm text-text-secondary">
          @{username}
          {meta ? ` · ${meta}` : ""}
        </span>
      </span>
      {actions ? <span className="flex flex-wrap items-center gap-2">{actions}</span> : null}
    </li>
  );
}

export function personMeta(department: string | null, graduationYear: number | null): string | null {
  return [department, graduationYear ? `Class of ${graduationYear}` : null].filter(Boolean).join(" · ") || null;
}
