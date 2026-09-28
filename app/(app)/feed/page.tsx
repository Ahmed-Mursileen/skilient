import { Newspaper } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Composer } from "@/components/posts/composer";
import { FeedList } from "@/components/posts/feed-list";
import { Button, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FEED_FILTERS, getInvitableVentures, listPosts, type FeedFilter, type FeedScope } from "@/lib/data/posts";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Home" };

const TABS: { key: FeedScope; label: string }[] = [
  { key: "university", label: "University Feed" },
  { key: "global", label: "Global Feed" },
];
const FILTER_LABELS: Record<FeedFilter, string> = {
  all: "All",
  ventures: "Ventures",
  events: "Events",
  announcements: "Announcements",
  shipped: "Shipped",
};

function href(tab: FeedScope, filter: FeedFilter): Route {
  const q = new URLSearchParams();
  if (tab !== "university") q.set("tab", tab);
  if (filter !== "all") q.set("filter", filter);
  const s = q.toString();
  return (s ? `/feed?${s}` : "/feed") as Route;
}

/**
 * Home (screen spec 3.13): University Feed / Global Feed, filter chips, composer, posts.
 * Newest first until the ranked feed (slice 6) replaces the order.
 */
export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const sp = await searchParams;
  const tab: FeedScope = sp.tab === "global" ? "global" : "university";
  const filter: FeedFilter = FEED_FILTERS.includes(sp.filter as FeedFilter) ? (sp.filter as FeedFilter) : "all";

  const supabase = await createClient();
  const [page, ventures, staff] = await Promise.all([
    listPosts({ scope: tab, filter }),
    getInvitableVentures(user.id),
    supabase.rpc("is_staff").then((r) => r.data === true),
  ]);

  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-5 px-[var(--page-gutter)] py-8">
      <h1 className="sr-only">Home</h1>
      <nav aria-label="Feeds" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={href(t.key, filter)}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap",
                  tab === t.key ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Composer userId={user.id} defaultAudience={tab} ventures={ventures} isStaff={staff} />

      <nav aria-label="Filter posts">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {FEED_FILTERS.map((f) => (
            <li key={f}>
              <Link
                href={href(tab, f)}
                aria-current={filter === f ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-body-sm font-semibold whitespace-nowrap",
                  filter === f ? "border-primary bg-primary-subtle text-text-primary" : "border-border-default text-text-secondary hover:border-border-strong",
                )}
              >
                {FILTER_LABELS[f]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <FeedList
        key={`${tab}-${filter}`}
        initial={page.posts}
        cursor={page.cursor}
        scope={tab}
        filter={filter}
        empty={
          <EmptyState
            icon={<Newspaper aria-hidden className="size-8" />}
            title={filter === "all" ? (tab === "university" ? "Your university feed is quiet" : "Nothing in the Global Feed yet") : `No ${FILTER_LABELS[filter].toLowerCase()} yet`}
            description="Be the first to post, or find a venture to join and classmates to follow."
            action={
              <Button asChild variant="secondary">
                <Link href="/ventures">Browse ventures</Link>
              </Button>
            }
          />
        }
      />
    </main>
  );
}
