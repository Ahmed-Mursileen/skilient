import type { Metadata } from "next";
import { Card, DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { requestFinalYear } from "@/lib/actions/uni";
import { getMyUni, getSponsorship } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";
import { PLAN_LABELS, countLabel } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Sponsored Pro" };

/** /uni/sponsorship (PRD 5.23, 4b.7): eligible counts and the students sponsored now (nightly sponsorship-sync). */
export default async function SponsorshipPage() {
  const [uni, s] = await Promise.all([getMyUni(), getSponsorship()]);
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Sponsored Pro">Growth sponsors Student Pro for final-year students, Campus for everyone. Sponsorship is updated every night; a student who stops qualifying keeps Pro to the end of the first month at least 30 days away and is told at once.</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-caption text-text-secondary">Your licence</p><p className="text-h3">{PLAN_LABELS[s.plan] ?? s.plan}</p></Card>
        <Card><p className="text-caption text-text-secondary">Final year (class of {s.final_year})</p><p className="text-h3">{countLabel(s.eligible_final_year)}</p></Card>
        <Card><p className="text-caption text-text-secondary">All active students</p><p className="text-h3">{countLabel(s.eligible_all)}</p></Card>
        <Card testId="sponsored-now"><p className="text-caption text-text-secondary">Sponsored now</p><p className="text-h3">{countLabel(s.active_grants)}</p></Card>
      </div>
      <Section title="Final-year batch" id="f-h">
        <p className="text-body-sm text-text-secondary">Skilient graduates every batch on 1 September. If your final year differs, ask Skilient to set an exception: it also changes when your students become graduates.</p>
        {uni?.is_owner ? (
          <RpcForm action={requestFinalYear as FormAction} after="reset" submitLabel="Send request" fields={[
            { name: "year", label: "Final-year graduating year (empty to clear the exception)", type: "number" },
            { name: "reason", label: "Reason", type: "text", required: true },
          ]} />
        ) : <p className="text-body-sm">Only the owner can ask.</p>}
        <DataTable head={["Year", "Status", "Asked", "Note"]} empty="No requests." rows={s.requests.map((r) => [r.batch_year ?? "Clear", r.status, dayLabel(r.created_at), r.review_reason ?? ""])} />
      </Section>
    </main>
  );
}
