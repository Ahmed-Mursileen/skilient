import { BellSimple } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { NotificationRow } from "@/components/notifications/notification-row";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { Button, EmptyState } from "@/components/ui";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { getNotifications, PAGE_SIZE, type NotificationItem } from "@/lib/data/notifications";

export const metadata: Metadata = { title: "Notifications" };

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" });

/** /notifications (screen spec 3.3): the latest 50, grouped Today / Earlier; older pages by cursor. */
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const sp = await searchParams;
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null;
  const items = await getNotifications(before);
  const todayKey = dayKey.format(new Date());
  const today = items.filter((n) => dayKey.format(new Date(n.createdAt)) === todayKey);
  const earlier = items.filter((n) => dayKey.format(new Date(n.createdAt)) !== todayKey);
  const unread = items.some((n) => !n.read);
  const older = items.length === PAGE_SIZE ? items[items.length - 1].createdAt : null;

  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1">Notifications</h1>
          <p className="mt-1 text-body text-text-secondary">
            Requests, decisions and team news.{" "}
            <Link href="/settings/notifications" className="underline underline-offset-4 hover:text-text-primary">
              Email settings
            </Link>
          </p>
        </div>
        {unread ? <ConfirmAction action={markAllNotificationsRead} label="Mark all read" variant="secondary" /> : null}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<BellSimple aria-hidden className="size-8" />}
          title={before ? "Nothing older" : "You're all caught up"}
          description={
            before
              ? "That's everything from the last few months."
              : "Friend requests, applications, invites and team news show up here."
          }
        />
      ) : null}

      <Group title="Today" items={today} today />
      <Group title="Earlier" items={earlier} today={false} />

      {older ? (
        <Button asChild variant="ghost" className="self-center">
          <Link href={`/notifications?before=${encodeURIComponent(older)}` as Route}>Show older</Link>
        </Button>
      ) : null}
    </main>
  );
}

function Group({ title, items, today }: { title: string; items: NotificationItem[]; today: boolean }) {
  if (!items.length) return null;
  const id = `group-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-h4">
        {title}
      </h2>
      <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        {items.map((n) => (
          <NotificationRow
            key={n.id}
            id={n.id}
            text={n.text}
            href={n.href}
            actorName={n.actorName}
            actorAvatarUrl={n.actorAvatarUrl}
            read={n.read}
            createdAt={n.createdAt}
            today={today}
          />
        ))}
      </ul>
    </section>
  );
}
