import type { Metadata, Route } from "next";
import Link from "next/link";
import { EventCard } from "@/components/uni/event-card";
import { PageTitle } from "@/components/uni/page-parts";
import { EmptyState } from "@/components/ui";
import { getEvents, getMyEcosphere } from "@/lib/data/uni";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Events" };

const TABS = [{ key: "upcoming", label: "Upcoming" }, { key: "mine", label: "Going" }, { key: "past", label: "Past" }] as const;

/** /events (PRD 5.23): your university's events and events open to everyone. */
export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const sp = await searchParams;
  const when = TABS.some((t) => t.key === sp.when) ? (sp.when as (typeof TABS)[number]["key"]) : "upcoming";
  const [events, eco] = await Promise.all([getEvents(when), getMyEcosphere().catch(() => null)]);
  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-6 px-[var(--page-gutter)] py-6">
      <PageTitle title="Events">Talks, workshops, hackathons and competitions. At the door, scan the code on the organiser&apos;s screen to check in.</PageTitle>
      {eco ? <Link className="text-body-sm font-semibold underline underline-offset-4" href={`/u/${eco.slug}` as Route}>{eco.name} on Skilient</Link> : null}
      <nav aria-label="Events" className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/events?when=${t.key}` as Route} aria-current={t.key === when ? "page" : undefined}
            className={cn("rounded-md border px-3 py-1.5 text-body-sm font-semibold", t.key === when ? "border-primary bg-primary-subtle" : "border-border-default")}>{t.label}</Link>
        ))}
      </nav>
      {events.length === 0 ? <EmptyState title="No events here" description="When your university or another one posts an event open to you, it shows up here." /> : (
        <div className="grid gap-3 md:grid-cols-2">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>
      )}
    </main>
  );
}
