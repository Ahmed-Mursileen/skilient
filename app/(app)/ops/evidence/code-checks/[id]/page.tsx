import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnippetView } from "@/components/code-checks/snippet-view";
import { CodeCheckGradeForm } from "@/components/ops/code-check-grade-form";
import { TrustClaimButton } from "@/components/ops/trust-forms";
import { QUESTIONS, RUBRIC, STATUS_LABELS } from "@/lib/code-checks/constants";
import { getCodeCheckCase, getSnippet } from "@/lib/data/code-checks";
import { staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: "Code check" };

/**
 * One code check for its grader (PRD 5.5, 5.21): the code (only once claimed, read from GitHub
 * now), the requirement, the student's answers, and the 4-part rubric.
 */
export default async function OpsCodeCheckPage({ params }: PageProps<"/ops/evidence/code-checks/[id]">) {
  const { id } = await params;
  if (!(await staffRoles()).has("trust_reviewer")) notFound();
  const c = await getCodeCheckCase(id);
  if (!c) notFound();
  const open = c.status === "submitted";
  const snippet = open && c.claimedByMe ? await getSnippet(id) : null;
  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-caption font-semibold text-text-secondary uppercase">
            Code check · {STATUS_LABELS[c.status]} · waiting {c.age}
            {c.overdue ? " · overdue" : ""}
          </p>
          <h1 className="font-display text-h1">{c.skill}</h1>
          <p className="mt-1 text-body text-text-secondary">{c.student}</p>
        </div>
        {snippet?.ok ? (
          <SnippetView snippet={snippet.snippet} />
        ) : open && c.claimedByMe ? (
          <p role="alert" className="rounded-md border border-border-default bg-bg-subtle px-4 py-3 text-body-sm">
            {snippet?.reason === "gone"
              ? "GitHub no longer shows this code. Grade from the answers, or release the check."
              : "Couldn't load the code from GitHub just now. Reload to try again."}
          </p>
        ) : open ? (
          <p className="rounded-md border border-border-default bg-bg-subtle px-4 py-3 text-body-sm text-text-secondary">
            The code shows once you claim the check.
          </p>
        ) : null}
        {c.prompt ? (
          <section aria-labelledby="req-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="req-h" className="text-label text-text-secondary uppercase">
              The requirement they were given
            </h2>
            <p className="mt-1 text-body">{c.prompt}</p>
          </section>
        ) : null}
        <section aria-labelledby="answers-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="answers-h" className="text-h4">
            Answers
          </h2>
          <dl className="flex flex-col gap-3">
            {QUESTIONS.map((q) => (
              <div key={q.key}>
                <dt className="text-body-sm font-semibold">{q.label}</dt>
                <dd className="mt-1 text-body whitespace-pre-line">{c.answers[q.key]?.trim() || "No answer"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        {open ? (
          <section aria-labelledby="grade-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="grade-h" className="text-h4">
              Grade
            </h2>
            {c.conflict ? (
              <p className="text-body-sm">You know this student (a friend or teammate), so someone else grades this check.</p>
            ) : (
              <>
                <p className="text-body-sm text-text-secondary">
                  {c.claimedByMe ? "You're grading this." : c.claimedBy ? `${c.claimedBy} is grading this.` : "Claim it to grade."}
                </p>
                {!c.claimedBy || c.claimedByMe ? <TrustClaimButton kind="code_check" id={c.id} claimed={c.claimedByMe} /> : null}
                {c.claimedByMe ? <CodeCheckGradeForm id={c.id} /> : null}
              </>
            )}
          </section>
        ) : (
          <section aria-labelledby="graded-h" className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="graded-h" className="text-h4">
              {STATUS_LABELS[c.status]}
            </h2>
            <ul className="flex flex-col gap-1 text-body-sm">
              {RUBRIC.map((r) => (
                <li key={r.key}>
                  {r.label}: {c.rubric?.[r.key]?.pass ? "met" : "not met"}
                </li>
              ))}
            </ul>
            {c.feedback ? <p className="text-body-sm">{c.feedback}</p> : null}
          </section>
        )}
      </aside>
    </main>
  );
}
