import { CheckCircle, Hourglass, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttemptForm } from "@/components/code-checks/attempt-form";
import { SnippetView } from "@/components/code-checks/snippet-view";
import { StartCodeCheck } from "@/components/code-checks/start-button";
import { EmptyState } from "@/components/ui";
import { QUESTIONS, RUBRIC, STATUS_LABELS } from "@/lib/code-checks/constants";
import { getMyCodeCheck, getSnippet, type MyCodeCheck } from "@/lib/data/code-checks";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Code check" };

/**
 * /me/code-checks/[id] (PRD 5.5 "Code check"): the student's attempt. Starting shows a piece of
 * their own code (read from GitHub now, never stored) and starts 10 minutes; they answer three
 * fixed questions; a Skilient reviewer grades it against a 4-part rubric.
 */
export default async function CodeCheckPage({ params }: PageProps<"/me/code-checks/[id]">) {
  const { id } = await params;
  let check = await getMyCodeCheck(id);
  if (!check) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle() : { data: null };
  const skillsHref = (me?.username ? `/profile/${me.username}/skills` : "/settings") as Route;

  let snippet: Awaited<ReturnType<typeof getSnippet>> | null = null;
  if (check.status === "in_progress") {
    snippet = await getSnippet(id);
    // The change request appears once the code has been shown.
    if (snippet.ok && !check.snippetServed) check = (await getMyCodeCheck(id)) ?? check;
  }

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <p className="text-caption font-semibold text-text-secondary uppercase">
          Code check · {STATUS_LABELS[check.status]} · requested {check.requestedLabel}
        </p>
        <h1 className="font-display text-h1">{check.skillName}</h1>
      </div>

      {check.status === "preparing" ? (
        <EmptyState
          icon={<Hourglass aria-hidden className="size-8" />}
          title="Picking a piece of your code"
          description="This usually takes a minute or two. We'll notify you when it's ready; you can leave this page."
          action={
            <Link href={`/me/code-checks/${id}` as Route} className="text-body-sm font-semibold underline underline-offset-4">
              Check again
            </Link>
          }
        />
      ) : check.status === "ready" ? (
        <section aria-labelledby="how" className="flex max-w-[680px] flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="how" className="text-h3">
            Before you start
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
            <li>We&apos;ll show 20 to 40 lines you wrote yourself, from one of your commits.</li>
            <li>You get 10 minutes, with the code in front of you, to answer three questions: what it does, why it&apos;s written this way, and how you&apos;d change it for a new requirement.</li>
            <li>A Skilient reviewer grades your answers within about 3 days. Passing makes {check.skillName} L4 on your profile.</li>
            <li>This counts as your attempt for the next 30 days from the moment the code is shown.</li>
          </ul>
          <StartCodeCheck id={id} />
        </section>
      ) : check.status === "in_progress" ? (
        <InProgress check={check} snippet={snippet!} skillsHref={skillsHref} />
      ) : check.status === "unavailable" || check.status === "expired" ? (
        <EmptyState
          title={check.status === "expired" ? "This check expired" : "This check couldn't go ahead"}
          description={`${check.unavailableReason ? `${check.unavailableReason[0].toUpperCase()}${check.unavailableReason.slice(1)}. ` : ""}It doesn't count as an attempt; you can request another from the skill.`}
          action={
            <Link href={skillsHref} className="text-body-sm font-semibold underline underline-offset-4">
              Your skills
            </Link>
          }
        />
      ) : (
        <Result check={check} />
      )}
    </main>
  );
}

function InProgress({ check, snippet, skillsHref }: { check: MyCodeCheck; snippet: NonNullable<Awaited<ReturnType<typeof getSnippet>>>; skillsHref: Route }) {
  if (!snippet.ok && !check.snippetServed) {
    return snippet.reason === "gone" ? (
      <EmptyState
        title="GitHub no longer shows this code"
        description="This check doesn't count as an attempt. Share the repository with Skilient again, or request a new check from the skill."
        action={
          <Link href={skillsHref} className="text-body-sm font-semibold underline underline-offset-4">
            Your skills
          </Link>
        }
      />
    ) : (
      <EmptyState title="We couldn't load your code" description="Reload the page in a moment. Your 10 minutes start only once the code is shown." />
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        {snippet.ok ? (
          <SnippetView snippet={snippet.snippet} />
        ) : (
          <p role="alert" className="rounded-md border border-border-default bg-bg-subtle px-4 py-3 text-body-sm">
            We couldn&apos;t reload your code just now; keep answering, your time is running. Reload the page to try again.
          </p>
        )}
        {check.prompt ? (
          <section aria-labelledby="requirement" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="requirement" className="text-label text-text-secondary uppercase">
              The new requirement
            </h2>
            <p className="mt-1 text-body">{check.prompt}</p>
          </section>
        ) : null}
      </div>
      <AttemptForm checkId={check.id} secondsLeft={check.secondsLeft ?? 0} initial={check.answers} />
    </div>
  );
}

function Result({ check }: { check: MyCodeCheck }) {
  const graded = check.status === "passed" || check.status === "failed";
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      {graded ? (
        <section aria-labelledby="result" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="result" className="flex items-center gap-2 text-h3">
            {check.status === "passed" ? (
              <CheckCircle aria-hidden weight="fill" className="size-6 text-verified" />
            ) : (
              <XCircle aria-hidden weight="fill" className="size-6 text-text-secondary" />
            )}
            {check.status === "passed" ? `Passed: ${check.skillName} is now L4` : "Not passed this time"}
          </h2>
          {check.feedback ? <p className="text-body whitespace-pre-line">{check.feedback}</p> : null}
          {check.rubric ? (
            <ul className="flex flex-col gap-2">
              {RUBRIC.map((r) => {
                const part = check.rubric?.[r.key];
                return (
                  <li key={r.key} className="text-body-sm">
                    <span className="font-semibold">{r.label}:</span> {part?.pass ? "met" : "not met"}
                    {part?.comment ? <span className="text-text-secondary"> · {part.comment}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {check.status === "failed" ? <p className="text-body-sm text-text-secondary">You can try this skill again 30 days after your attempt.</p> : null}
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-4 py-3 text-body">
          <Hourglass aria-hidden className="size-5" />
          Handed in{check.submittedLabel ? ` on ${check.submittedLabel}` : ""}. A Skilient reviewer grades it, usually within 3 days.
        </p>
      )}
      <section aria-labelledby="yours" className="flex flex-col gap-3">
        <h2 id="yours" className="text-h4">
          Your answers
        </h2>
        {check.prompt ? <p className="text-body-sm text-text-secondary">Requirement: {check.prompt}</p> : null}
        <dl className="flex flex-col gap-3">
          {QUESTIONS.map((q) => (
            <div key={q.key}>
              <dt className="text-body-sm font-semibold">{q.label}</dt>
              <dd className="mt-1 text-body whitespace-pre-line">{check.answers[q.key]?.trim() || "No answer"}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
