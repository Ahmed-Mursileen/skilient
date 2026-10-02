import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageTitle, Section } from "@/components/uni/page-parts";
import { getMyUni, getUniHome } from "@/lib/data/uni";
import { countLabel } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Home" };

const TODOS: { key: string; label: (n: number) => string; href: string }[] = [
  { key: "teacher_requests", label: (n) => `${n} teacher request${n === 1 ? "" : "s"} to review`, href: "/uni/people" },
  { key: "open_cases", label: (n) => `${n} hidden post${n === 1 ? "" : "s"} waiting for Skilient`, href: "/uni/moderation" },
  { key: "pending_invites", label: (n) => `${n} admin invite${n === 1 ? "" : "s"} not accepted yet`, href: "/uni/settings/admins" },
  { key: "upcoming_events", label: (n) => `${n} upcoming event${n === 1 ? "" : "s"}`, href: "/uni/events" },
  { key: "live_fairs", label: (n) => `${n} job fair${n === 1 ? "" : "s"} live now`, href: "/uni/fairs" },
];

/** /uni (PRD 5.23): key numbers (groups of 5+) and to-dos for the admin's role. */
export default async function UniHomePage() {
  const uni = await getMyUni();
  if (!uni) redirect("/uni/claim");
  const home = await getUniHome();
  const todos = TODOS.filter((t) => typeof home.todos[t.key] === "number" && (home.todos[t.key] as number) > 0);
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title={uni?.name ?? "Your university"}>Your university&apos;s ecosphere on Skilient. Numbers refresh every night.</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card testId="home-students">
          <p className="text-caption text-text-secondary">Students on Skilient</p>
          <p className="font-display text-h2">{countLabel(home.numbers.students)}</p>
        </Card>
        <Card>
          <p className="text-caption text-text-secondary">Active in the last 30 days</p>
          <p className="font-display text-h2">{countLabel(home.numbers.active_30d)}</p>
        </Card>
      </div>
      <Section title="To do" id="todo-h">
        {home.todos.no_departments ? (
          <Card>
            <p className="text-body">
              Add your departments so students pick from your own list and coordinators can be assigned.{" "}
              <Link className="font-semibold underline underline-offset-4" href={"/uni/people" as Route}>Add departments</Link>
            </p>
          </Card>
        ) : null}
        {todos.length === 0 && !home.todos.no_departments ? <p className="text-body text-text-secondary">All caught up.</p> : null}
        <ul className="flex flex-col gap-2" data-testid="todos">
          {todos.map((t) => (
            <li key={t.key}>
              <Link className="font-semibold underline underline-offset-4" href={t.href as Route}>
                {t.label(home.todos[t.key] as number)}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      {uni ? (
        <p className="text-body-sm text-text-secondary">
          Your students&apos; view of the ecosphere:{" "}
          <Link className="font-semibold underline underline-offset-4" href={`/u/${uni.slug}` as Route}>/u/{uni.slug}</Link>
        </p>
      ) : null}
    </main>
  );
}
