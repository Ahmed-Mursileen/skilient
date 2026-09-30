import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CancelDeletionButton, RequestDeletionForm } from "@/components/account/delete-account-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Delete account" };

const long = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });

/**
 * /settings/account/delete (PRD 5.25, screen spec "Delete account"): what deleting removes,
 * the 14-day cooling-off, and while it runs the only page the account can reach, with the
 * button that cancels it.
 */
export default async function DeleteAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/settings/account/delete");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("status, delete_after").eq("user_id", user.id).maybeSingle();
  const pending = profile?.status === "deleting" && profile.delete_after;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">Delete account</h1>
      {pending ? (
        <section aria-labelledby="pending-h" className="flex flex-col gap-4 rounded-lg border border-border-strong bg-bg-surface p-5" data-testid="deletion-pending">
          <h2 id="pending-h" className="text-h3">
            Your account is scheduled for deletion
          </h2>
          <p className="text-body">
            It will be permanently deleted on <strong>{long.format(new Date(profile.delete_after!))}</strong>. Until then it can&apos;t be used, and
            nobody else is told. Changed your mind? Keep it and everything is back as it was.
          </p>
          <CancelDeletionButton />
          <div className="border-t border-border-muted pt-4">
            <SignOutButton variant="secondary" />
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="what-h" className="flex flex-col gap-3">
            <h2 id="what-h" className="text-h3">
              What happens
            </h2>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
              <li>You get 14 days. During them your account can&apos;t be used, and you can cancel from this page.</li>
              <li>After that your profile, posts, messages, endorsements you gave, credentials and score are permanently deleted.</li>
              <li>Ventures you own pass to your longest-standing teammate; ventures with no one else on the team are deleted.</li>
              <li>Your signed CVs are revoked, so anyone who verifies one sees that it no longer holds.</li>
              <li>Records that mention you in other people&apos;s history keep no name or link back to you.</li>
            </ul>
            <p className="text-body-sm text-text-secondary">There is no data export at launch.</p>
          </section>
          <RequestDeletionForm username={user.username ?? ""} />
        </>
      )}
    </main>
  );
}
