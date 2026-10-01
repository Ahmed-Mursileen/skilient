import type { Metadata } from "next";
import { Card, Locked, PageTitle } from "@/components/uni/page-parts";
import { getMyUni } from "@/lib/data/uni";
import { DASHBOARD_AREAS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Reports" };

/** /uni/reports (PRD 5.23): CSV and PDF exports of each dashboard area (Growth+). Accreditation templates come later. */
export default async function ReportsPage() {
  const uni = await getMyUni();
  if (!uni?.entitlements["uni.exports"]) return <Locked what="Exports" plans="Growth or Campus" />;
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title="Reports">Aggregates only, with groups under 5 hidden. Individual student records are never exported.</PageTitle>
      <ul className="flex flex-col gap-2">
        {DASHBOARD_AREAS.map((a) => (
          <li key={a.key} className="flex gap-4 text-body">
            <span className="w-32 font-semibold">{a.label}</span>
            <a className="underline" href={`/api/uni/export?area=${a.key}`}>CSV</a>
            <a className="underline" href={`/api/uni/export?area=${a.key}&format=pdf`}>PDF</a>
          </li>
        ))}
      </ul>
      <Card><p className="text-body-sm text-text-secondary">Accreditation report templates (Campus) are being confirmed with partner universities and will appear here.</p></Card>
    </main>
  );
}
