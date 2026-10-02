import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Blocks, EcosphereFrame } from "@/components/uni/ecosphere-view";
import { DataTable, Section } from "@/components/uni/page-parts";
import { isRefusal } from "@/lib/data/rpc-json";
import { getEcosphereHome, getEcospherePage, getEvents, getMyUniAnnouncements, type EcosphereHome } from "@/lib/data/uni";
import { dayLabel, eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "University", robots: { index: false, follow: false } };

/**
 * /u/[slug]/[[...page]] (PRD 5.23): a university's ecosphere, for signed-in users only (no public
 * per-university pages). Members also see announcements, university events and the teachers directory.
 */
export default async function EcospherePage({ params }: PageProps<"/u/[slug]/[[...page]]">) {
  const { slug, page } = await params;
  if (!/^[a-z0-9-]{1,100}$/.test(slug) || (page && (page.length > 1 || !/^[a-z0-9-]{1,40}$/.test(page[0])))) notFound();
  let home: EcosphereHome;
  try {
    home = await getEcosphereHome(slug);
  } catch (err) {
    if (isRefusal(err, "P0002")) notFound();
    throw err;
  }
  const [announcements, events] = await Promise.all([
    home.is_member ? getMyUniAnnouncements(10) : Promise.resolve([]),
    home.modules.events ? getEvents("upcoming") : Promise.resolve([]),
  ]);
  const uniEvents = events.filter((e) => e.university_slug === home.university.slug);
  const eventItems = uniEvents.map((e) => ({ id: e.id, title: e.title, starts: eventTime(e.starts_at) }));
  if (page?.[0]) {
    let p;
    try {
      p = await getEcospherePage(slug, page[0]);
    } catch (err) {
      if (isRefusal(err, "P0002")) notFound();
      throw err;
    }
    return (
      <EcosphereFrame name={home.university.name} slug={home.university.slug} branding={home.branding} pages={home.pages} current={p.slug}>
        <h2 className="font-display text-h2">{p.title}</h2>
        <Blocks blocks={p.blocks} announcements={announcements} events={eventItems} />
      </EcosphereFrame>
    );
  }
  return (
    <EcosphereFrame name={home.university.name} slug={home.university.slug} branding={home.branding} pages={home.pages} current={null}>
      {home.welcome ? <p className="max-w-prose whitespace-pre-line text-body">{home.welcome}</p> : null}
      {home.is_member && announcements.length > 0 ? (
        <Section title="Announcements" id="a-h">
          <ul className="flex flex-col gap-2">{announcements.map((a) => <li key={a.id} className="rounded-md border border-border-default p-3"><p className="whitespace-pre-line">{a.body}</p><p className="text-body-sm text-text-secondary">{dayLabel(a.created_at)}</p></li>)}</ul>
        </Section>
      ) : null}
      {home.modules.events ? (
        <Section title="Upcoming events" id="e-h">
          {uniEvents.length === 0 ? <p className="text-body text-text-secondary">No upcoming events.</p> : (
            <ul className="flex flex-col gap-1">{uniEvents.map((e) => <li key={e.id}><Link className="eco-accent underline" href={`/events/${e.id}` as Route}>{e.title}</Link> · {eventTime(e.starts_at)}</li>)}</ul>
          )}
        </Section>
      ) : null}
      {home.semesters.length > 0 ? (
        <Section title="Academic calendar" id="c-h">
          <ul className="text-body">{home.semesters.map((s) => <li key={s.name}>{s.name}: {dayLabel(s.starts_on)} to {dayLabel(s.ends_on)}</li>)}</ul>
        </Section>
      ) : null}
      {home.teachers ? (
        <Section title="Teachers" id="t-h">
          <DataTable head={["Name", "Title", "Department"]} empty="No teachers on Skilient yet." rows={home.teachers.map((t) => [t.name, t.title, t.department])} />
        </Section>
      ) : null}
      {home.jobs ? (
        <Section title="Open jobs and internships" id="j-h">
          {home.jobs.length === 0 ? <p className="text-body text-text-secondary">No open roles right now.</p> : (
            <ul className="flex flex-col gap-1">{home.jobs.map((j) => <li key={j.id}><Link className="underline" href={`/opportunities/jobs/${j.id}` as Route}>{j.title}</Link> · {j.company}</li>)}</ul>
          )}
        </Section>
      ) : null}
    </EcosphereFrame>
  );
}
