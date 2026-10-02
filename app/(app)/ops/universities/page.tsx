import type { Metadata, Route } from "next";
import Link from "next/link";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { controlBase } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { getUniList } from "@/lib/data/ops-unis";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { decideDomain, decideFinalYear, opsRemoveQuestion } from "@/lib/actions/uni";
import { openAllUniversities } from "@/lib/actions/ops/universities";
import { getOpsHides, getOpsQuestions, getOpsUniQueue } from "@/lib/data/uni";
import { staffRoles } from "@/lib/data/ops-trust";
import { ageLabel } from "@/lib/format/time";
import { PLAN_LABELS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Universities" };

const decide = (action: FormAction, id: string) => (
  <RpcForm action={action} extra={{ id }} submitLabel="Decide" fields={[
    { name: "approve", label: "Approve", type: "checkbox" },
    { name: "reason", label: "Reason (the university reads it)", type: "text", required: true },
  ]} />
);

/**
 * /ops/universities (PRD 5.26 minimal, phase 9): claims, extra domains, final-year requests and
 * onboarding questions (accounts staff); every university hide and its outcome (moderators).
 */
export default async function OpsUniversitiesPage({ searchParams }: PageProps<"/ops/universities">) {
  const roles = await staffRoles();
  const accounts = roles.has("accounts") || roles.has("super_admin");
  const moderator = roles.has("moderator") || roles.has("super_admin");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const [unis, queue, questions, hides] = await Promise.all([
    accounts ? getUniList(q) : Promise.resolve([]),
    accounts ? getOpsUniQueue() : Promise.resolve(null),
    accounts ? getOpsQuestions() : Promise.resolve([]),
    moderator ? getOpsHides() : Promise.resolve([]),
  ]);
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Universities">Claims are checked against the university&apos;s public pages. Disputes are fixed by SQL (docs/university-claim-disputes.md).</PageTitle>
      {accounts ? (
        <Section title="All universities" id="all-h">
          <form method="get" action="/ops/universities" className="flex flex-wrap items-end gap-2" role="search">
            <div className="flex flex-col gap-2">
              <label htmlFor="uni-q" className="text-body-sm font-semibold">Name or email domain</label>
              <input id="uni-q" name="q" defaultValue={q} maxLength={100} className={cn(controlBase, "h-10 w-80")} />
            </div>
            <button type="submit" className="inline-flex h-10 items-center rounded-md border border-border-strong px-4 text-body-sm font-semibold">Search</button>
          </form>
          <DataTable testId="ops-unis" head={["University", "Owner", "Plan", "Admins", "Students"]} empty="No university matches."
            rows={unis.map((u) => [<Link key="u" className="font-semibold underline" href={`/ops/universities/${u.id}` as Route}>{u.name}</Link>, u.owner_name ?? "Not onboarded", u.plan ?? "free", String(u.admins), String(u.students)])} />
        </Section>
      ) : null}
      {accounts ? (
        <Section title="Public launch" id="launch-h">
          <p className="max-w-[70ch] text-body-sm text-text-secondary">
            Opens student and faculty signup at every university that has an email domain, in one audited step. Everyone who asked for a university gets
            the launch email. To open one university, use its page.
          </p>
          <RpcForm
            testId="uni-open-all"
            action={openAllUniversities as FormAction}
            submitLabel="Open every university"
            fields={[
              { name: "confirm", label: "I'm opening signup everywhere (public launch)", type: "checkbox" },
              { name: "reason", label: "Reason", type: "text", required: true },
            ]}
          />
        </Section>
      ) : null}
      {queue ? (
        <>
          <Section title="Claims" id="c-h">
            <DataTable testId="ops-claims" head={["University", "Requester", "Email", "Title", "Sent"]} empty="No claims waiting."
              rows={queue.claims.map((c) => [<Link key="u" className="font-semibold underline" href={`/ops/universities/claims/${c.id}` as Route}>{c.university}</Link>, c.requester, <span key="e" className="font-mono text-code-sm">{c.email}</span>, c.title, ageLabel(c.created_at)])} />
          </Section>
          <Section title="Extra domains" id="d-h">
            <DataTable head={["University", "Domain", "Who", "Reason", "Decide"]} empty="No domain requests."
              rows={queue.domains.map((d) => [d.university, d.domain, d.kind, d.reason, decide(decideDomain as FormAction, d.id)])} />
          </Section>
          <Section title="Final-year batch requests" id="b-h">
            <DataTable head={["University", "Asked", "Current", "Reason", "Decide"]} empty="No requests."
              rows={queue.batches.map((b) => [b.university, b.batch_year ?? "Clear", b.current ?? "Platform rule", b.reason, decide(decideFinalYear as FormAction, b.id)])} />
          </Section>
          <Section title="Onboarding questions" id="q-h">
            <DataTable head={["University", "Question", "Answers", "Remove"]} empty="No questions."
              rows={questions.map((q) => [q.university, q.prompt, q.options.join(", "),
                <RpcForm key="r" action={opsRemoveQuestion as FormAction} extra={{ id: q.id }} submitLabel="Remove" fields={[{ name: "reason", label: "Reason", type: "text", required: true }]} />])} />
          </Section>
          <Section title="Claimed universities" id="u-h">
            <DataTable head={["University", "Owner", "Licence", "Claimed"]} empty="None yet."
              rows={queue.claimed.map((u) => [u.name, u.owner ?? "", PLAN_LABELS[u.plan] ?? u.plan, ageLabel(u.claimed_at)])} />
          </Section>
        </>
      ) : null}
      {moderator ? (
        <Section title="Hidden by universities" id="h-h">
          <p className="text-body-sm text-text-secondary">Each hide opens a case in the moderation queue. Dismiss (or warn) restores the content; Remove keeps it gone.</p>
          <DataTable testId="ops-hides" head={["University", "Content", "Reason", "By", "When", "Status", "Case"]} empty="No hides."
            rows={hides.map((h) => [h.university, h.target_type, h.reason, h.hidden_by ?? "", ageLabel(h.created_at), h.status,
              h.case_id ? <Link key="c" className="underline" href={`/ops/reports/${h.case_id}` as Route}>Open case</Link> : ""])} />
        </Section>
      ) : null}
    </main>
  );
}
