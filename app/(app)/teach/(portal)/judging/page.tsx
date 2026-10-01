import type { Metadata, Route } from "next";
import Link from "next/link";
import { DataTable, PageTitle } from "@/components/uni/page-parts";
import { getMyJudging } from "@/lib/data/uni";
import { eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "Judging" };

/** /teach/judging (PRD 5.23): university hackathons you judge; score entries after the deadline. */
export default async function JudgingPage() {
  const items = await getMyJudging();
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title="Judging">Your university asked you to judge these hackathons. Each entry&apos;s score is the average of its judges.</PageTitle>
      <DataTable head={["Hackathon", "Closes", "Status"]} empty="Nothing to judge."
        rows={items.map((h) => [<Link key="t" className="font-semibold underline" href={`/teach/judging/${h.id}` as Route}>{h.title}</Link>, eventTime(h.ends_at), h.status])} />
    </main>
  );
}
