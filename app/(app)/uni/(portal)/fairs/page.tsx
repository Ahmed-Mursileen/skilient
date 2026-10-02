import type { Metadata, Route } from "next";
import Link from "next/link";
import { DataTable, Locked, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { saveFair } from "@/lib/actions/uni";
import { getFairs } from "@/lib/data/uni";
import { eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "Job fairs" };

/** /uni/fairs (PRD 5.23, Growth 1 and Campus 2 a year). */
export default async function FairsPage() {
  const f = await getFairs();
  if (!f.limit) return <Locked what="Digital job fairs" plans="Growth or Campus" />;
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Job fairs">{f.used} of {f.limit} used in the last 12 months. Invite companies by email; fair access is free for them, and their booth opens once Skilient has verified the company.</PageTitle>
      {f.used < f.limit ? (
        <Section title="New fair" id="n-h">
          <RpcForm testId="fair-form" action={saveFair as FormAction} after="/uni/fairs/:id" submitLabel="Create draft" fields={[
            { name: "title", label: "Title", type: "text", required: true },
            { name: "startsAt", label: "Starts", type: "datetime-local", required: true },
            { name: "endsAt", label: "Ends (up to 7 days later)", type: "datetime-local", required: true },
            { name: "description", label: "Description", type: "textarea", rows: 3 },
          ]} />
        </Section>
      ) : null}
      <DataTable head={["Fair", "When", "Status", "Booths"]} empty="No fairs yet."
        rows={f.items.map((x) => [<Link key="t" className="font-semibold underline underline-offset-4" href={`/uni/fairs/${x.id}` as Route}>{x.title}</Link>, eventTime(x.starts_at), x.status, x.booths])} />
    </main>
  );
}
