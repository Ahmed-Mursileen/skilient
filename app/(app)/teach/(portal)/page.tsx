import { Lightbulb } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/teach/action-button";
import { Badge, EmptyState } from "@/components/ui";
import { respondSupervision } from "@/lib/actions/teach";
import { getTeacherHome, getTeacherVentures } from "@/lib/data/teach";

export const metadata: Metadata = { title: "Home" };

function Stat({ label, value, href, hint }: { label: string; value: string; href?: string; hint?: string }) {
  const body = (
    <>
      <p className="text-caption font-semibold text-text-secondary uppercase">{label}</p>
      <p className="mt-1 font-display text-h2">{value}</p>
      {hint ? <p className="text-caption text-text-secondary">{hint}</p> : null}
    </>
  );
  const cls = "rounded-lg border border-border-default bg-bg-surface p-4";
  return href ? (
    <Link href={href as Route} className={`${cls} hover:bg-bg-subtle`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const RELATION: Record<string, string> = { supervising: "Supervising", invited: "Asked you to supervise", reviewed: "Reviewed", ended: "Past supervision" };

/** /teach (PRD 5.21 "Build"): to-do counts, my ideas, supervised ventures and endorsements used this month. */
export default async function TeachHomePage() {
  const [home, ventures] = await Promise.all([getTeacherHome(), getTeacherVentures()]);
  const invites = ventures.filter((v) => v.relation === "invited");
  const active = ventures.filter((v) => v.relation === "supervising");
  const past = ventures.filter((v) => v.relation === "reviewed" || v.relation === "ended");
  return (
    <main className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-h1">Welcome</h1>
        <p className="mt-1 text-body text-text-secondary">{home.title}, {home.department}</p>
      </div>
      <section aria-labelledby="todo-h" className="flex flex-col gap-3">
        <h2 id="todo-h" className="text-h3">To do</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="teach-todo">
          <Stat label="Review requests" value={String(home.reviewRequests)} href="/teach/reviews" hint="Due in 14 days" />
          <Stat label="Supervision invites" value={String(home.invites)} hint={`${home.supervising} of ${home.superviseCap} ventures supervised`} />
          <Stat
            label="Code checks to grade"
            value={home.gradingOptIn ? String(home.checksAvailable + home.checksMine) : "Off"}
            href={home.gradingOptIn ? "/teach/code-checks" : "/teach/settings"}
            hint={home.gradingOptIn ? `${home.gradingUsed} of ${home.gradingCap} this week` : "Turn on in settings"}
          />
          <Stat label="Endorsements this month" value={`${home.endorsementsMonth} of ${home.endorsementsLimit}`} hint="Weight 1.5" />
        </div>
      </section>

      {invites.length ? (
        <section aria-labelledby="invites-h" className="flex flex-col gap-3">
          <h2 id="invites-h" className="text-h3">Asked you to supervise</h2>
          <ul className="flex flex-col gap-2" data-testid="supervision-invites">
            {invites.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
                <div>
                  <Link href={`/teach/ventures/${v.id}` as Route} className="text-body font-semibold underline underline-offset-4">{v.title}</Link>
                  <p className="text-body-sm text-text-secondary">{v.members} member{v.members === 1 ? "" : "s"}</p>
                </div>
                <div className="flex gap-2">
                  <ActionButton action={respondSupervision.bind(null, v.id, true)} variant="primary" testId="accept-supervision">Accept</ActionButton>
                  <ActionButton action={respondSupervision.bind(null, v.id, false)}>Decline</ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="sup-h" className="flex flex-col gap-3">
        <h2 id="sup-h" className="text-h3">Ventures I supervise</h2>
        {active.length === 0 ? (
          <EmptyState
            icon={<Lightbulb aria-hidden className="size-8" />}
            title="No supervised ventures yet"
            description="Post a project idea and students can start ventures from it, or a venture owner can invite you."
            action={<Link href="/teach/ideas/new" className="text-body font-semibold underline underline-offset-4">Post an idea</Link>}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="supervised-ventures">
            {active.map((v) => (
              <li key={v.id}>
                <Link href={`/teach/ventures/${v.id}` as Route} className="flex h-full flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4 hover:bg-bg-subtle">
                  <span className="text-body font-semibold">{v.title}</span>
                  <span className="text-body-sm text-text-secondary">{v.members} members · since {v.sinceLabel}</span>
                  <Badge className="mt-1 self-start">{v.status.replace("_", " ")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ideas-h" className="flex flex-col gap-2">
        <h2 id="ideas-h" className="text-h3">My ideas</h2>
        <p className="text-body">
          {home.ideasOpen} open idea{home.ideasOpen === 1 ? "" : "s"}.{" "}
          <Link href="/teach/ideas" className="font-semibold underline underline-offset-4">See all ideas</Link>
        </p>
      </section>

      {past.length ? (
        <section aria-labelledby="past-h" className="flex flex-col gap-2">
          <h2 id="past-h" className="text-h3">Earlier</h2>
          <ul className="flex flex-col gap-1 text-body-sm">
            {past.map((v) => (
              <li key={`${v.id}-${v.relation}`}>
                <Link href={`/teach/ventures/${v.id}` as Route} className="underline underline-offset-4">{v.title}</Link>{" "}
                <span className="text-text-secondary">· {RELATION[v.relation]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
