import type { Metadata, Route } from "next";
import Link from "next/link";
import { DataTable, Locked, PageTitle } from "@/components/uni/page-parts";
import { Button, Input, Label } from "@/components/ui";
import { getMyUni, getStudents, getStructure } from "@/lib/data/uni";
import { TIER_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Students" };

/**
 * /uni/students (PRD 5.23, Growth and Campus): pick a student to open their record. The list is
 * one page at a time and can't be exported; opening a record is logged and shown to Pro students.
 */
export default async function StudentsPage({ searchParams }: PageProps<"/uni/students">) {
  const uni = await getMyUni();
  if (!uni?.entitlements["uni.student_records"]) {
    return (
      <main className="flex flex-col gap-6">
        <PageTitle title="Students" />
        <Locked what="Individual student records" plans="Growth or Campus" />
      </main>
    );
  }
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const dept = typeof sp.department === "string" && /^[0-9a-f-]{36}$/.test(sp.department) ? sp.department : null;
  const batch = typeof sp.batch === "string" && /^\d{4}$/.test(sp.batch) ? Number(sp.batch) : null;
  const page = typeof sp.page === "string" && /^\d{1,3}$/.test(sp.page) ? Number(sp.page) : 0;
  const [list, structure] = await Promise.all([getStudents(q || null, dept, batch, page * 50), getStructure()]);
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title="Students">
        Opening a record is logged with your name and the time. Students on Student Pro can see who viewed their record. There is no bulk export.
      </PageTitle>
      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="flex flex-col gap-1">
          <Label htmlFor="q">Name or username</Label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="department">Department</Label>
          <select id="department" name="department" defaultValue={dept ?? ""} className="h-10 rounded-md border border-border-default bg-bg-subtle px-3 text-body">
            <option value="">All</option>
            {structure.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="batch">Batch</Label>
          <Input id="batch" name="batch" inputMode="numeric" defaultValue={batch ?? ""} className="w-28" />
        </div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <DataTable
        testId="students"
        head={["Name", "Department", "Batch", "Tier", "Status"]}
        empty="No students match."
        rows={list.items.map((s) => [
          <Link key="n" className="font-semibold underline underline-offset-4" href={`/uni/students/${s.id}` as Route}>{s.name}</Link>,
          s.department ?? "Not set", s.batch ?? "", s.tier ? (TIER_LABELS[s.tier as keyof typeof TIER_LABELS] ?? s.tier) : "Not ranked", s.status === "graduate" ? "Graduate" : "Student",
        ])}
      />
      <nav aria-label="Pages" className="flex gap-3">
        {page > 0 ? <Link className="underline" href={`/uni/students?q=${encodeURIComponent(q)}&page=${page - 1}` as Route}>Previous</Link> : null}
        {list.items.length === 50 ? <Link className="underline" href={`/uni/students?q=${encodeURIComponent(q)}&page=${page + 1}` as Route}>Next</Link> : null}
      </nav>
    </main>
  );
}
