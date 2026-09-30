import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveTeacherButton, FacultyCsvForm, RevokeTeacherForm, TeacherFlagForm } from "@/components/ops/teacher-forms";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { staffRoles } from "@/lib/data/ops-trust";
import { getOpsUniversities, getTeacherFlags, getTeacherRequests } from "@/lib/data/teach";

export const metadata: Metadata = { title: "Teachers" };

/**
 * /ops/teachers (PRD 5.21, 5.26): accounts staff approve teacher requests (until university
 * admins can, phase 9), import faculty lists and remove teachers; trust reviewers decide the
 * endorsement-concentration flags.
 */
export default async function OpsTeachersPage({ searchParams }: PageProps<"/ops/teachers">) {
  const roles = await staffRoles();
  const accounts = roles.has("accounts");
  const trust = roles.has("trust_reviewer");
  if (!accounts && !trust) notFound();
  const sp = await searchParams;
  const tab = sp.tab === "decided" ? "decided" : "pending";
  const [requests, universities, flags] = await Promise.all([
    accounts ? getTeacherRequests(tab) : Promise.resolve([]),
    accounts ? getOpsUniversities() : Promise.resolve([]),
    trust ? getTeacherFlags("open") : Promise.resolve([]),
  ]);
  return (
    <main className="flex flex-col gap-8">
      <h1 className="font-display text-h1">Teachers</h1>
      {accounts ? (
        <section aria-labelledby="req-h" className="flex flex-col gap-4">
          <h2 id="req-h" className="text-h3">Requests</h2>
          <nav aria-label="Request status" className="border-b border-border-default">
            <ul className="-mb-px flex gap-1">
              {(["pending", "decided"] as const).map((t) => (
                <li key={t}>
                  <Link
                    href={t === "pending" ? "/ops/teachers" : "/ops/teachers?tab=decided"}
                    aria-current={tab === t ? "page" : undefined}
                    className={cn("inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold", tab === t ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}
                  >
                    {t === "pending" ? "Waiting" : "Decided"}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {requests.length === 0 ? (
            <EmptyState title={tab === "pending" ? "No requests waiting" : "No decisions yet"} description="Faculty ask for the teacher role from their portal. Check the university's public faculty page before approving." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
              <table className="w-full min-w-[760px] text-left text-body-sm" data-testid="teacher-requests">
                <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                    <th scope="col" className="px-3 py-2 font-semibold">University</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Department and title</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{tab === "pending" ? "Asked" : "Status"}</th>
                    <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {requests.map((r) => (
                    <tr key={r.userId} data-testid="teacher-request">
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-code-sm">{r.email}</td>
                      <td className="px-3 py-2">{r.university}</td>
                      <td className="px-3 py-2">{r.title}, {r.department}</td>
                      <td className="px-3 py-2">
                        {tab === "pending" ? r.requestedLabel : (
                          <>
                            <Badge tone={r.status === "approved" ? "success" : "neutral"}>{r.status === "approved" ? "Approved" : "Removed"}</Badge>
                            <span className="ml-1 text-text-secondary">{r.decidedLabel}{r.source ? ` · ${r.source}` : ""}</span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "pending" ? <ApproveTeacherButton userId={r.userId} /> : r.status === "approved" ? <RevokeTeacherForm userId={r.userId} /> : <ApproveTeacherButton userId={r.userId} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <FacultyCsvForm universities={universities} />
        </section>
      ) : null}
      {trust ? (
        <section aria-labelledby="flags-h" className="flex flex-col gap-3">
          <h2 id="flags-h" className="text-h3">Endorsement concentration</h2>
          <p className="text-body-sm text-text-secondary">A teacher gave more than 30% of their last 90 days of endorsements to one student. Nothing is removed automatically.</p>
          {flags.length === 0 ? (
            <EmptyState title="No open flags" />
          ) : (
            <ul className="flex flex-col gap-3" data-testid="teacher-flags">
              {flags.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
                  <p className="text-body">{f.teacher} gave {f.given} of {f.total} endorsements to {f.student}. <span className="text-text-secondary">Flagged {f.age} ago.</span></p>
                  <TeacherFlagForm id={f.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
