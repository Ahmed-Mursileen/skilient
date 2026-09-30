import { Binoculars, Briefcase, CalendarBlank, EnvelopeSimple, Lightbulb, ListChecks, Trophy } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { FirstVisitTip } from "@/components/learn/first-visit-tip";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getOpportunities, OPPORTUNITY_TABS, type OpportunityTab } from "@/lib/data/portal";
import { eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "Opportunities" };

/**
 * What each tab says while it is empty: what belongs there and one thing to do about it.
 * The data arrives with recruiters (jobs, contact requests, applications), universities
 * (competitions, job fairs) and teachers (project ideas); the tabs and the reads exist now.
 */
const EMPTY: Record<OpportunityTab, { icon: ReactNode; title: string; description: string; action: { label: string; href: string } }> = {
  for_you: {
    icon: <Binoculars aria-hidden className="size-8" />,
    title: "Nothing matched yet",
    description: "Roles, competitions and ideas appear here when they match your L2+ skills and your looking-for line. Levelling up a skill or updating what you're looking for gets you more.",
    action: { label: "See your skills", href: "/me/skills" },
  },
  jobs: {
    icon: <Briefcase aria-hidden className="size-8" />,
    title: "No open roles yet",
    description: "Every open role at recruiters on Skilient will be listed here with its salary range. Sponsored roles are labelled here and only here.",
    action: { label: "Build your CV meanwhile", href: "/me/cv" },
  },
  contact_requests: {
    icon: <EnvelopeSimple aria-hidden className="size-8" />,
    title: "No requests from recruiters",
    description: "When a recruiter wants to talk to you, the request lands here and you accept or decline. Recruiters only see what your privacy settings allow.",
    action: { label: "Review who can find you", href: "/settings/privacy" },
  },
  applications: {
    icon: <ListChecks aria-hidden className="size-8" />,
    title: "You haven't applied to anything",
    description: "Each application you send is tracked here: applied, screening, interview, offer, with the dates.",
    action: { label: "Browse jobs", href: "/opportunities/jobs" },
  },
  competitions: {
    icon: <Trophy aria-hidden className="size-8" />,
    title: "No competitions or hackathons open",
    description: "Open, registered and past competitions and hackathons will be listed here with your results.",
    action: { label: "Start a venture in the meantime", href: "/ventures/new" },
  },
  job_fairs: {
    icon: <CalendarBlank aria-hidden className="size-8" />,
    title: "No job fairs coming up",
    description: "Fairs at your university appear here with the booths and the live queue.",
    action: { label: "Explore your university", href: "/explore" },
  },
  ideas: {
    icon: <Lightbulb aria-hidden className="size-8" />,
    title: "No project ideas from teachers yet",
    description: "Ideas from faculty that you can start a venture from will be listed here.",
    action: { label: "Start your own venture", href: "/ventures/new" },
  },
};

/** /opportunities/[tab] (PRD 5.25, screen spec 3.10): seven tabs, each with its own teaching empty state. */
export default async function OpportunitiesPage({ params }: PageProps<"/opportunities/[tab]">) {
  const { tab } = await params;
  const current = OPPORTUNITY_TABS.find((t) => t.key === tab);
  if (!current) notFound();
  const items = await getOpportunities(current.key);
  const empty = EMPTY[current.key];
  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">Opportunities</h1>
      <FirstVisitTip id="opportunities" />
      <nav aria-label="Opportunity types" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-2 px-1 pb-1">
          {OPPORTUNITY_TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={`/opportunities/${t.key}` as Route}
                aria-current={t.key === current.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-body-sm font-semibold whitespace-nowrap",
                  t.key === current.key ? "border-primary bg-primary-subtle text-text-primary" : "border-border-default text-text-secondary hover:border-border-strong",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {items.length === 0 ? (
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          action={
            <Button asChild variant="secondary">
              <Link href={empty.action.href as Route}>{empty.action.label}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="opportunity-list">
          {items.map((o) => (
            <li key={o.id} className="rounded-lg border border-border-default bg-bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={o.href as Route} className="text-h4 underline-offset-4 hover:underline">
                  {o.title}
                </Link>
                {/* Sponsored roles are labelled on the Jobs tab only, and never on For you. */}
                {o.sponsored && current.key === "jobs" ? <Badge tone="neutral">Sponsored</Badge> : null}
              </div>
              <p className="text-body-sm text-text-secondary">
                {[o.orgName, o.detail, o.startsAt ? eventTime(o.startsAt) : null].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
