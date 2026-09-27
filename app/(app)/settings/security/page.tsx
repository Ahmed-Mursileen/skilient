import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/auth/form-alert";
import { describeDevice } from "@/lib/security/request-meta";
import { createClient } from "@/lib/supabase/server";
import { SignOutEverywhere } from "./sign-out-everywhere";
import { TwoFactorPanel } from "./two-factor-panel";

export const metadata: Metadata = { title: "Security" };

const EVENT_LABELS: Record<string, string> = {
  signup: "Account created",
  sign_in: "Signed in",
  sign_in_failed: "Failed sign-in attempt",
  account_locked: "Sign-in locked for 15 minutes",
  new_device: "Signed in from a new device",
  not_me: "Signed out everywhere (\"This wasn't me\")",
  password_changed: "Password changed",
  mfa_enrolled: "Two-factor turned on",
  mfa_unenrolled: "Two-factor turned off",
  signed_out_everywhere: "Signed out of all devices",
};

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });

export default async function SecurityPage({ searchParams }: PageProps<"/settings/security">) {
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: factors }, { data: events, error: eventsError }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.from("security_events").select("id, kind, user_agent, created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const verified = factors?.totp.find((f) => f.status === "verified") ?? null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-[var(--page-gutter)] py-8">
      <div>
        <Link href="/settings" className="text-body-sm text-text-secondary underline underline-offset-4">
          Settings
        </Link>
        <h1 className="mt-1 font-display text-h1">Security</h1>
      </div>

      {params.required ? (
        <FormAlert>This area needs two-factor. Turn it on below, then open it again.</FormAlert>
      ) : null}

      <section aria-labelledby="two-factor" className="rounded-lg border border-border-default bg-bg-surface p-5 sm:p-6">
        <h2 id="two-factor" className="text-h3">
          Two-factor sign-in
        </h2>
        <p className="mt-1 text-body text-text-secondary">
          After your password, Skilient asks for a code from an authenticator app (Google Authenticator, Microsoft
          Authenticator, 1Password and similar). Optional for students.
        </p>
        <div className="mt-5">
          <TwoFactorPanel factorId={verified?.id ?? null} />
        </div>
      </section>

      <section aria-labelledby="devices" className="rounded-lg border border-border-default bg-bg-surface p-5 sm:p-6">
        <h2 id="devices" className="text-h3">
          Signed-in devices
        </h2>
        <p className="mt-1 text-body text-text-secondary">
          We email you whenever a new device signs in. If you don&apos;t recognise one, sign out everywhere and change your
          password.
        </p>
        <div className="mt-5">
          <SignOutEverywhere />
        </div>
      </section>

      <section aria-labelledby="activity" className="rounded-lg border border-border-default bg-bg-surface p-5 sm:p-6">
        <h2 id="activity" className="text-h3">
          Recent activity
        </h2>
        {eventsError ? (
          <FormAlert className="mt-4">We couldn&apos;t load your activity. Refresh to try again.</FormAlert>
        ) : !events?.length ? (
          <p className="mt-3 text-body text-text-secondary">No account activity yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border-muted">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="text-body">
                  {EVENT_LABELS[e.kind] ?? e.kind}
                  {e.user_agent ? <span className="text-text-secondary"> · {describeDevice(e.user_agent)}</span> : null}
                </span>
                <time dateTime={e.created_at} className="text-body-sm text-text-muted">
                  {when.format(new Date(e.created_at))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
