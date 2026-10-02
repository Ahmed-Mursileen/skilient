import type { Metadata, Route } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/teach/action-button";
import { DataTable, Locked, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { finishHackathon, saveHackathon } from "@/lib/actions/uni";
import { getHackathons } from "@/lib/data/uni";
import { eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "Hackathons" };

/**
 * /uni/hackathons (PRD 5.23, Growth 2 and Campus 4 a year): the competition engine, judged by your
 * approved teachers (average of their scores). Teams submit a GitHub repository URL.
 */
export default async function HackathonsPage() {
  const h = await getHackathons();
  if (!h.limit) return <Locked what="University hackathons" plans="Growth or Campus" />;
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Hackathons">{h.used} of {h.limit} used in the last 12 months. Participants earn L3 evidence in the hackathon&apos;s skills; the winning team gets a winner badge.</PageTitle>
      {h.used < h.limit ? (
        <Section title="New hackathon" id="n-h">
          <RpcForm testId="hackathon-form" action={saveHackathonFromForm as FormAction} after="reset" submitLabel="Publish hackathon" fields={[
            { name: "title", label: "Title", type: "text", required: true },
            { name: "brief", label: "Brief (at least 100 characters)", type: "textarea", rows: 5, required: true },
            { name: "startsAt", label: "Starts", type: "datetime-local", required: true },
            { name: "endsAt", label: "Submissions close (1 to 22 days later)", type: "datetime-local", required: true },
            { name: "teamSize", label: "Team size (1 to 3)", type: "number", defaultValue: 3 },
            { name: "skills", label: "Skill ids, comma separated (e.g. react, python)", type: "list" },
            { name: "prize", label: "Prize", type: "text", defaultValue: "Winner badge" },
            { name: "rubric", label: "Rubric: criterion=weight per line, weights add up to 100", type: "textarea", rows: 3, defaultValue: "Working product=50\nCode quality=30\nPresentation=20" },
            { name: "openToAll", label: "Open to students of every university", type: "checkbox" },
            { name: "judges", label: "Judges (1 to 5 of your teachers)", type: "checks", options: h.teachers.map((t) => ({ value: t.id, label: `${t.name}, ${t.department}` })) },
          ]} />
        </Section>
      ) : null}
      <DataTable head={["Hackathon", "Runs", "Status", "Teams", "Judges", ""]} empty="No hackathons yet."
        rows={h.items.map((c) => [
          <Link key="t" className="font-semibold underline underline-offset-4" href={`/competitions/${c.id}` as Route}>{c.title}</Link>,
          `${eventTime(c.starts_at)} to ${eventTime(c.ends_at)}`, c.status, c.teams, (c.judges ?? []).join(", "),
          c.status === "frozen" ? <ActionButton key="f" size="sm" action={finishHackathon.bind(null, c.id)}>Finish and award</ActionButton> : "",
        ])} />
    </main>
  );
}

async function saveHackathonFromForm(values: Record<string, unknown>) {
  "use server";
  const rubric = String(values.rubric ?? "").split(/\r?\n/).map((l) => l.split("=")).filter((p) => p.length === 2)
    .map(([criterion, weight]) => ({ criterion: criterion.trim(), weight: Number(weight) }));
  return saveHackathon({ ...(values as Record<string, never>), rubric } as Parameters<typeof saveHackathon>[0]);
}
