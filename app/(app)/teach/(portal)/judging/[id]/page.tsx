import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { judgeScore } from "@/lib/actions/uni";
import { isRefusal } from "@/lib/data/rpc-json";
import { getJudgeHackathon } from "@/lib/data/uni";

export const metadata: Metadata = { title: "Judge" };

export default async function JudgePage({ params }: PageProps<"/teach/judging/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let h;
  try {
    h = await getJudgeHackathon(id);
  } catch (err) {
    if (isRefusal(err, "P0002", "42501")) notFound();
    throw err;
  }
  const rubric = h.competition.rubric;
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title={h.competition.title}>{h.competition.status === "frozen" ? "Score every criterion from 0 to 10." : "Entries open for scoring after the deadline."}</PageTitle>
      {h.teams.map((t) => (
        <Card key={t.id} className="flex flex-col gap-3">
          <p className="font-semibold">{t.name} · <a className="font-mono text-code-sm underline" href={t.repo_url} target="_blank" rel="noopener noreferrer">{t.repo_url}</a>{t.frozen_sha ? ` @ ${t.frozen_sha.slice(0, 7)}` : ""}</p>
          {h.competition.status === "frozen" ? (
            <RpcForm action={scoreFromForm as FormAction} extra={{ teamId: t.id, criteria: rubric.map((r) => r.criterion) }} submitLabel="Save score" successText="Saved."
              fields={[
                ...rubric.map((r, i) => ({ name: `c${i}`, label: `${r.criterion} (weight ${r.weight})`, type: "number" as const, defaultValue: t.my_scores?.[r.criterion] })),
                { name: "feedback", label: "Feedback for the team", type: "textarea" as const, rows: 2, defaultValue: t.my_feedback ?? "" },
              ]} />
          ) : null}
        </Card>
      ))}
    </main>
  );
}

async function scoreFromForm(values: Record<string, unknown>) {
  "use server";
  const criteria = (values.criteria as string[]) ?? [];
  const scores = Object.fromEntries(criteria.map((c, i) => [c, Number(values[`c${i}`])]));
  return judgeScore({ teamId: String(values.teamId), scores, feedback: String(values.feedback ?? "") });
}
