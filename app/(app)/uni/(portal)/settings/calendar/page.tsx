import type { Metadata } from "next";
import { ActionButton } from "@/components/teach/action-button";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { SettingsTabs } from "@/components/uni/settings-tabs";
import { addExamPeriod, deleteSemester, removeExamPeriod, saveSemester } from "@/lib/actions/uni";
import { getCalendar } from "@/lib/data/uni";

export const metadata: Metadata = { title: "Calendar" };

/** /uni/settings/calendar (PRD 5.23): semesters and exam periods (exam days pause ranking decay; ≤ 45 days each, ≤ 90 a year). */
export default async function CalendarPage() {
  const cal = await getCalendar();
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Academic calendar">Exam periods pause the decay of students&apos; Momentum points. Each is at most 45 days, they can&apos;t overlap, and together they cover at most 90 days a year.</PageTitle>
      <SettingsTabs current="/uni/settings/calendar" />
      <Section title="Exam periods" id="e-h">
        <DataTable testId="exam-periods" head={["From", "To", "Reason", ""]} empty="No exam periods yet."
          rows={cal.exam_periods.map((e) => [e.starts_on, e.ends_on, e.reason,
            <RpcForm key="r" action={removeExamPeriod as FormAction} extra={{ id: e.id }} submitLabel="Remove" fields={[{ name: "reason", label: "Why remove it", type: "text" }]} />])} />
        <RpcForm testId="exam-form" action={addExamPeriod as FormAction} after="reset" submitLabel="Add exam period" fields={[
          { name: "starts", label: "From", type: "date", required: true },
          { name: "ends", label: "To", type: "date", required: true },
          { name: "reason", label: "Reason", type: "text", required: true, placeholder: "Fall final exams" },
        ]} />
      </Section>
      <Section title="Semesters" id="s-h">
        <DataTable head={["Semester", "From", "To", ""]} empty="No semesters yet."
          rows={cal.semesters.map((s) => [s.name, s.starts_on, s.ends_on, <ActionButton key="d" size="sm" variant="ghost" action={deleteSemester.bind(null, s.id)}>Delete</ActionButton>])} />
        <RpcForm action={saveSemester as FormAction} after="reset" submitLabel="Add semester" fields={[
          { name: "name", label: "Name", type: "text", required: true, placeholder: "Fall 2026" },
          { name: "starts", label: "From", type: "date", required: true },
          { name: "ends", label: "To", type: "date", required: true },
        ]} />
      </Section>
    </main>
  );
}
