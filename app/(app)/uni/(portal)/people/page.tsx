import type { Metadata, Route } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/teach/action-button";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { Badge } from "@/components/ui";
import { approveTeacher, deleteDepartment, deleteProgramme, importFaculty, revokeTeacher, saveDepartment, saveProgramme, setTeacherDepartment } from "@/lib/actions/uni";
import { getMyUni, getStructure, getUniTeachers } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "People" };

/** /uni/people (PRD 5.23 "People and structure"): departments, programmes and teachers. Coordinators see their department. */
export default async function PeoplePage() {
  const uni = await getMyUni();
  const isAdmin = uni?.role === "owner" || uni?.role === "admin";
  const [structure, pending, approved] = await Promise.all([getStructure(), getUniTeachers("pending"), getUniTeachers("approved")]);
  const deptOptions = structure.departments.map((d) => ({ value: d.id, label: d.name }));
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="People and structure">
        Departments decide what students pick in their profile and who each coordinator looks after. <Link className="underline underline-offset-4" href={"/uni/people/awards" as Route}>Awards</Link>
      </PageTitle>

      <Section title="Departments" id="dept-h">
        {structure.unassigned > 0 ? <p className="text-body-sm text-text-secondary">{structure.unassigned} students haven&apos;t picked one of your departments yet; they see a prompt on Home.</p> : null}
        <DataTable
          testId="departments"
          head={["Department", "Students", "Programmes", ""]}
          empty="No departments yet. Students pick from Skilient's general list until you add yours."
          rows={structure.departments.map((d) => [
            <span key="n" className="font-semibold">{d.name}</span>,
            d.students,
            <span key="p" className="flex flex-wrap gap-1">
              {d.programmes.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1">
                  <Badge>{p.name}</Badge>
                  {isAdmin ? <ActionButton size="sm" variant="ghost" action={deleteProgramme.bind(null, p.id)}>Remove {p.name}</ActionButton> : null}
                </span>
              ))}
            </span>,
            isAdmin ? <ActionButton key="d" size="sm" variant="ghost" action={deleteDepartment.bind(null, d.id)}>Delete</ActionButton> : null,
          ])}
        />
        {isAdmin ? (
          <div className="grid gap-6 md:grid-cols-2">
            <RpcForm testId="add-department" action={saveDepartment as FormAction} after="reset" submitLabel="Add department" fields={[{ name: "name", label: "Department name", type: "text", required: true }]} />
            {deptOptions.length > 0 ? (
              <RpcForm action={saveProgramme as FormAction} after="reset" submitLabel="Add programme" fields={[
                { name: "departmentId", label: "Department", type: "select", options: deptOptions },
                { name: "name", label: "Programme name", type: "text", required: true, placeholder: "BS Computer Science" },
              ]} />
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="Teacher requests" id="req-h">
        <DataTable
          testId="teacher-requests"
          head={["Name", "Email", "Department", "Title", "Asked", ""]}
          empty="No teacher requests waiting."
          rows={pending.map((t) => [
            t.name, <span key="e" className="font-mono text-code-sm">{t.email}</span>, t.department, t.title, dayLabel(t.requested_at),
            <ActionButton key="a" size="sm" variant="primary" action={approveTeacher.bind(null, t.user_id)}>Approve</ActionButton>,
          ])}
        />
      </Section>

      <Section title="Teachers" id="tea-h">
        <DataTable
          head={["Name", "Department", "Title", "Change department", "Remove"]}
          empty="No approved teachers yet."
          rows={approved.map((t) => [
            t.name, t.department, t.title,
            deptOptions.length > 0 ? (
              <RpcForm key="d" action={setTeacherDepartment as FormAction} extra={{ userId: t.user_id }} submitLabel="Save" fields={[{ name: "departmentId", label: "Department", type: "select", options: deptOptions }]} />
            ) : "Add departments first",
            <RpcForm key="r" action={revokeTeacher as FormAction} extra={{ userId: t.user_id }} submitLabel="Remove teacher" fields={[{ name: "reason", label: "Reason", type: "text", required: true }]} />,
          ])}
        />
      </Section>

      {isAdmin ? (
        <Section title="Import faculty" id="csv-h">
          <RpcForm action={importFaculty as FormAction} after="reset" submitLabel="Import" successText="Imported. Matching requests were approved."
            fields={[{ name: "csv", label: "Rows: email, department, title", type: "textarea", rows: 6, help: "One teacher per line. Anyone on the list is approved the moment they ask for the teacher role." }]} />
        </Section>
      ) : null}
    </main>
  );
}
