import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TeachNav } from "@/components/teach/teach-nav";
import { getTeacherState } from "@/lib/data/teach";

export const metadata: Metadata = { title: { template: "%s · Teach", default: "Teach" }, robots: { index: false, follow: false } };

/**
 * The teacher portal (PRD 5.21): approved teachers only. Faculty who haven't been approved go to
 * the application page; they keep student permissions and nothing else until then. Every SQL
 * function behind these pages re-checks the status itself.
 */
export default async function TeachLayout({ children }: LayoutProps<"/teach">) {
  const state = await getTeacherState();
  if (state?.status !== "approved") redirect("/teach/apply");
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-[var(--page-gutter)] py-6">
      <header className="flex flex-col gap-1">
        <p className="text-caption font-semibold text-text-secondary uppercase">Teacher portal · {state.university}</p>
        <TeachNav />
      </header>
      {children}
    </div>
  );
}
