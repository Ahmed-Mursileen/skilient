import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, DataTable, Locked, PageTitle, Section } from "@/components/uni/page-parts";
import { Badge } from "@/components/ui";
import { isRefusal } from "@/lib/data/rpc-json";
import { getMyUni, getStudentRecord, type StudentRecord } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";
import { TIER_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Student record" };
export const dynamic = "force-dynamic";

const tier = (t: string | null | undefined) => (t ? (TIER_LABELS[t as keyof typeof TIER_LABELS] ?? t) : "Not ranked");

/**
 * /uni/students/[id] (PRD 5.23): one student's Skilient record. The database writes an access-log
 * row for every load; chat, L0 skills, recruiter notes, contacts and CV views are never here.
 */
export default async function StudentRecordPage({ params }: PageProps<"/uni/students/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const uni = await getMyUni();
  if (!uni?.entitlements["uni.student_records"]) return <Locked what="Individual student records" plans="Growth or Campus" />;
  let r: StudentRecord;
  try {
    r = await getStudentRecord(id);
  } catch (err) {
    if (isRefusal(err, "P0002", "42501")) notFound();
    if (isRefusal(err, "54000")) {
      return <Card><p className="text-body">You&apos;ve opened 100 records in the last hour. Try again later.</p></Card>;
    }
    throw err;
  }
  return (
    <main className="flex flex-col gap-6" data-testid="student-record">
      <PageTitle title={r.profile.name}>
        {[r.profile.department, r.profile.programme, r.profile.batch ? `Class of ${r.profile.batch}` : null].filter(Boolean).join(" · ")}
        {r.profile.status === "graduate" ? " · Graduate" : ""}. This view was logged.
      </PageTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="text-caption text-text-secondary">Tier</p><p className="text-h3">{tier(r.ranking?.tier)}</p></Card>
        <Card><p className="text-caption text-text-secondary">Platform standing</p><p className="text-h3">{r.ranking?.top_percent ? `Top ${r.ranking.top_percent}%` : "Not ranked"}</p></Card>
        <Card><p className="text-caption text-text-secondary">Verified CV</p><p className="text-h3 font-mono">{r.cv ? `${r.cv.code} (v${r.cv.version})` : "None yet"}</p></Card>
      </div>
      <Section title="Verified skills" id="sk-h">
        <ul className="flex flex-wrap gap-2">{r.skills.map((s) => <li key={s.name}><Badge>{s.name} · L{s.level}</Badge></li>)}</ul>
        {r.skills.length === 0 ? <p className="text-body text-text-secondary">No verified skills yet.</p> : null}
      </Section>
      <Section title="Ventures and contributions" id="v-h">
        <DataTable head={["Venture", "Type", "Status", "Role", "Entries", "Faculty review"]} empty="No ventures."
          rows={r.ventures.map((v) => [v.title, v.type, v.status, v.role, v.entries, v.faculty_reviewed ? "Reviewed" : ""])} />
      </Section>
      <Section title="Endorsements" id="e-h">
        <DataTable head={["Skill", "By", "When"]} empty="No endorsements."
          rows={r.endorsements.map((e) => [e.skill, `${e.by}${e.kind === "teacher" ? " (faculty)" : ""}`, dayLabel(e.at)])} />
      </Section>
      <Section title="Credentials" id="c-h">
        <DataTable head={["Credential", "Issuer", "Issued"]} empty="No checked credentials."
          rows={r.credentials.map((c) => [c.title, c.issuer, c.issued_on])} />
      </Section>
      <Section title="Tier history (weekly)" id="t-h">
        <p className="text-body">{r.ranking_history.length ? r.ranking_history.map((h) => `${h.week}: ${tier(h.tier)}`).join(" · ") : "No history yet."}</p>
      </Section>
      <Section title="Events at your university" id="ev-h">
        <DataTable head={["Event", "Date", "Attended"]} empty="No events."
          rows={r.events.map((e) => [e.title, dayLabel(e.starts_at), e.checked_in ? "Checked in" : "Registered"])} />
      </Section>
      <Section title="Your job fairs" id="f-h">
        <DataTable head={["Fair", "Company", "Talked", "Interview", "Hired (90 days)"]} empty="No job-fair activity."
          rows={r.fair_outcomes.map((f) => [f.fair, f.company, f.talked ? "Yes" : "", f.interview ? "Yes" : "", f.hired ? "Yes" : ""])} />
      </Section>
      <Section title="Your awards" id="a-h">
        <p className="text-body">{r.awards.length ? r.awards.map((a) => a.name).join(", ") : "None."}</p>
      </Section>
    </main>
  );
}
