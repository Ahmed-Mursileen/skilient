import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ApplyForm } from "@/components/teach/apply-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTeacherState } from "@/lib/data/teach";

export const metadata: Metadata = { title: "Teacher role", robots: { index: false, follow: false } };

/**
 * /teach/apply (PRD 5.21 "Verification"): faculty ask for the teacher role. Until a university
 * admin, a faculty list or Skilient staff approves them they have student permissions only.
 */
export default async function ApplyPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "faculty") notFound();
  const state = await getTeacherState();
  if (state?.status === "approved") redirect("/teach");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-10">
      <div>
        <h1 className="font-display text-h1">Teacher role</h1>
        <p className="mt-1 text-body text-text-secondary">
          Teachers post project ideas, supervise and review ventures, endorse students and grade code checks. They are never ranked and never appear in recruiter search.
        </p>
      </div>
      {state?.status === "pending" ? (
        <section aria-labelledby="pending-h" className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-5" data-testid="teacher-pending">
          <h2 id="pending-h" className="text-h3">Waiting for approval</h2>
          <p className="text-body">
            Your request as {state.title}, {state.department} at {state.university} is with your university&apos;s admin. Where a university has no admin, a Skilient reviewer checks its public faculty page. We&apos;ll tell you when it is decided.
          </p>
          <p className="text-body-sm text-text-secondary">Need to fix something? Send it again below.</p>
        </section>
      ) : null}
      {state?.status === "revoked" ? (
        <section className="rounded-lg border border-border-default bg-bg-surface p-5" data-testid="teacher-revoked">
          <h2 className="text-h3">Your teacher role was removed</h2>
          <p className="mt-1 text-body">Your university removed it. Past reviews and endorsements stay on Skilient, marked as from former faculty. Ask your university admin to approve you again.</p>
        </section>
      ) : (
        <ApplyForm defaultDepartment={state?.department} defaultTitle={state?.title} update={state?.status === "pending"} />
      )}
    </main>
  );
}
