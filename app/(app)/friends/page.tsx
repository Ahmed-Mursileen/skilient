import { PaperPlaneTilt, Prohibit, Tray, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddByUsername } from "@/components/friends/add-by-username";
import { FriendRow, personMeta } from "@/components/friends/friend-row";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { EmptyState } from "@/components/ui";
import { cancelFriendRequest, respondFriendRequest, unblockUser, unfriend } from "@/lib/actions/friends";
import { muteUser } from "@/lib/actions/posts";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBlocks, getFriendRequests, getFriends } from "@/lib/data/friends";
import { getMutes } from "@/lib/data/posts";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Friends" };

const TABS = [
  { key: "friends", label: "Friends" },
  { key: "received", label: "Received" },
  { key: "sent", label: "Sent" },
  { key: "blocked", label: "Blocked" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const LIST = "divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface";

/** /friends (screen spec 3.5): Friends, Received, Sent, Blocked; add by username. */
export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "friends";

  const [friends, requests, blocks, mutes] = await Promise.all([getFriends(), getFriendRequests(), getBlocks(), getMutes()]);
  const received = requests.filter((r) => r.direction === "received");
  const sent = requests.filter((r) => r.direction === "sent");
  const counts: Record<Tab, number> = { friends: friends.length, received: received.length, sent: sent.length, blocked: blocks.length };

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Friends</h1>
        <p className="mt-1 text-body text-text-secondary">
          Friends see your friends-only profile and can message you. Requests you haven&apos;t answered wait here.
        </p>
      </div>

      <AddByUsername />

      <nav aria-label="Friends" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={(t.key === "friends" ? "/friends" : `/friends?tab=${t.key}`) as Route}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-2 border-b-2 px-3 text-body font-semibold whitespace-nowrap",
                  tab === t.key ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
                {counts[t.key] ? (
                  <span className="rounded-full bg-bg-subtle px-2 text-caption text-text-primary">{counts[t.key]}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "friends" ? (
        friends.length ? (
          <ul className={LIST}>
            {friends.map((f) => (
              <FriendRow
                key={f.username}
                username={f.username}
                fullName={f.fullName}
                avatarUrl={f.avatarUrl}
                meta={personMeta(f.department, f.graduationYear)}
                actions={
                  <ConfirmAction
                    action={unfriend.bind(null, f.username)}
                    label="Unfriend"
                    ariaLabel={`Unfriend ${f.fullName}`}
                    confirm={{
                      title: `Unfriend ${f.fullName}?`,
                      description: "You'll go back to being strangers. Either of you can send a new request later.",
                    }}
                  />
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<UsersThree aria-hidden className="size-8" />}
            title="No friends yet"
            description="Add classmates and teammates by username. Friends see your friends-only profile and can message you."
          />
        )
      ) : null}

      {tab === "received" ? (
        received.length ? (
          <ul className={LIST}>
            {received.map((r) => (
              <FriendRow
                key={r.id}
                username={r.username}
                fullName={r.fullName}
                avatarUrl={r.avatarUrl}
                meta={personMeta(r.department, r.graduationYear)}
                actions={
                  <>
                    <ConfirmAction
                      action={respondFriendRequest.bind(null, r.id, true)}
                      label="Accept"
                      variant="primary"
                      ariaLabel={`Accept ${r.fullName}'s request`}
                    />
                    <ConfirmAction
                      action={respondFriendRequest.bind(null, r.id, false)}
                      label="Decline"
                      ariaLabel={`Decline ${r.fullName}'s request`}
                    />
                  </>
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Tray aria-hidden className="size-8" />} title="No requests waiting" description="When someone asks to be your friend, you'll accept or decline here." />
        )
      ) : null}

      {tab === "sent" ? (
        sent.length ? (
          <ul className={LIST}>
            {sent.map((r) => (
              <FriendRow
                key={r.id}
                username={r.username}
                fullName={r.fullName}
                avatarUrl={r.avatarUrl}
                meta={personMeta(r.department, r.graduationYear)}
                actions={
                  <ConfirmAction
                    action={cancelFriendRequest.bind(null, r.id)}
                    label="Cancel"
                    ariaLabel={`Cancel your request to ${r.fullName}`}
                  />
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<PaperPlaneTilt aria-hidden className="size-8" />} title="No requests sent" description="Requests you send stay here until they're answered." />
        )
      ) : null}

      {tab === "blocked" ? (
        blocks.length ? (
          <ul className={LIST}>
            {blocks.map((b) => (
              <li key={b.username} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="blocked-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">{b.fullName}</span>
                  <span className="block truncate text-body-sm text-text-secondary">@{b.username}</span>
                </span>
                <ConfirmAction
                  action={unblockUser.bind(null, b.username)}
                  label="Unblock"
                  ariaLabel={`Unblock ${b.fullName}`}
                  confirm={{
                    title: `Unblock ${b.fullName}?`,
                    description: "You'll be able to see each other again. Your old friendship isn't restored; either of you can send a new request.",
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Prohibit aria-hidden className="size-8" />} title="You haven't blocked anyone" description="Block someone from their profile. They aren't told, and you stop seeing each other." />
        )
      ) : null}

      {tab === "blocked" && mutes.length ? (
        <section aria-labelledby="muted-heading" className="flex flex-col gap-2">
          <h2 id="muted-heading" className="text-h4">
            Muted
          </h2>
          <p className="text-body-sm text-text-secondary">Their posts stay out of your feeds. They aren&apos;t told, and nothing else changes.</p>
          <ul className={LIST}>
            {mutes.map((m) => (
              <li key={m.username} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="muted-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">{m.fullName}</span>
                  <span className="block truncate text-body-sm text-text-secondary">@{m.username}</span>
                </span>
                <ConfirmAction action={muteUser.bind(null, m.username, false)} label="Unmute" ariaLabel={`Unmute ${m.fullName}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
