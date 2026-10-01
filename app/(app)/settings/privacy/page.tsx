import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FirstVisitTip } from "@/components/learn/first-visit-tip";
import { LeaderboardToggle } from "@/components/ranking/leaderboard-toggle";
import { RecruiterPrefsForm } from "@/components/recruit/student-controls";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { unblockCompany } from "@/lib/actions/opportunities";
import { unblockUser } from "@/lib/actions/friends";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCvViewsLast30Days } from "@/lib/data/cv";
import { getBlocks } from "@/lib/data/friends";
import { getBlockedCompanies, getProfileViewers, getRecruiterPrefs } from "@/lib/data/opportunities";
import { VISIBILITY } from "@/lib/profile/options";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Privacy" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface">
      <h2 id={id} className="px-5 pt-4 text-h3">
        {title}
      </h2>
      {children}
    </section>
  );
}

const CV_VISIBILITY = { private: "Only you", link: "Anyone with one of your share links", recruiters: "Recruiters and anyone with a share link" } as const;

/**
 * The privacy centre (PRD 5.25, screen spec "Privacy centre"): everything that decides who
 * sees you, in one place. Controls that already have a home (profile, CV) show their current
 * value and link there instead of a second copy; the leaderboard switch and blocked people
 * are here. Viewer names are a Pro feature (billing arrives in phase 10) and university
 * viewers need a Growth or Campus plan (phase 9), so those show what they will be.
 */
export default async function PrivacyCentrePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/settings/privacy");
  const supabase = await createClient();
  const [{ data: profile }, { data: cv }, { count: links }, views, blocks, companies, viewers, prefs] = await Promise.all([
    supabase.from("profiles").select("leaderboard_opt_out, visibility, recruiter_visible, looking_for").eq("user_id", user.id).maybeSingle(),
    supabase.from("cv_settings").select("visibility").eq("user_id", user.id).maybeSingle(),
    supabase.from("cv_share_links").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("revoked_at", null),
    getCvViewsLast30Days(user.id),
    getBlocks(),
    getBlockedCompanies(),
    getProfileViewers(),
    getRecruiterPrefs(),
  ]);
  const visibility = VISIBILITY.find((o) => o.value === profile?.visibility) ?? VISIBILITY[0];
  const looking = (profile?.looking_for ?? []) as string[];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">Privacy</h1>
      <FirstVisitTip id="privacy" />

      <Section id="profile-h" title="Profile visibility">
        <p className="px-5 text-body-sm text-text-secondary" data-testid="profile-visibility">
          <strong className="text-text-primary">{visibility.label}.</strong> {visibility.description}
        </p>
        <p className="px-5 pb-4 text-body-sm">
          <Link href="/settings/profile" className="font-semibold underline underline-offset-4">
            Change who sees your profile
          </Link>
        </p>
      </Section>

      <Section id="recruiter-h" title="Recruiter visibility">
        <p className="px-5 text-body-sm text-text-secondary" data-testid="recruiter-visibility">
          <strong className="text-text-primary">{profile?.recruiter_visible ? "On." : "Off."}</strong>{" "}
          {profile?.recruiter_visible
            ? "Recruiters can find you by verified skills and see your looking-for line."
            : "Recruiters can't find you in search. You can still apply to jobs."}
          {looking.length ? ` You're looking for: ${looking.join(", ")}.` : ""}
        </p>
        <p className="px-5 text-body-sm text-text-secondary">
          Turning it off removes you from every recruiter search within a day. Recruiters never see your gender, age, religion, ethnicity or photo, and you can hide from a single company below.
        </p>
        <p className="px-5 text-body-sm">
          <Link href="/settings/profile" className="font-semibold underline underline-offset-4">
            Change recruiter visibility and your looking-for line
          </Link>
        </p>
        <div className="px-5 pb-4">
          <RecruiterPrefsForm availability={prefs.availability} city={prefs.city ?? ""} remote={prefs.remote_ok} visible={prefs.recruiter_visible} />
        </div>
      </Section>

      <Section id="company-views-h" title="Which companies viewed my profile">
        <p className="px-5 text-body-sm text-text-secondary" data-testid="company-views">
          {viewers.companies_30d} {viewers.companies_30d === 1 ? "company" : "companies"} looked at your profile in the last 30 days ({viewers.views_30d} {viewers.views_30d === 1 ? "view" : "views"}).
          {viewers.names_visible ? "" : " Their names are a Pro feature."}
        </p>
        {viewers.companies && viewers.companies.length > 0 ? (
          <ul className="px-5 pb-4 text-body-sm">
            {viewers.companies.map((c) => (
              <li key={c.id}><Link href={`/companies/${c.slug}` as Route} className="font-semibold underline underline-offset-4">{c.name}</Link></li>
            ))}
          </ul>
        ) : (
          <p className="pb-4" />
        )}
      </Section>

      <Section id="company-blocks-h" title="Blocked companies">
        {companies.length ? (
          <ul className="divide-y divide-border-muted" data-testid="blocked-companies">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link href={`/companies/${c.slug}` as Route} className="min-w-0 truncate text-body font-semibold underline-offset-4 hover:underline">{c.name}</Link>
                <ConfirmAction action={unblockCompany.bind(null, c.id)} label="Unblock" ariaLabel={`Unblock ${c.name}`} variant="secondary" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-4 text-body-sm text-text-secondary">You haven&apos;t blocked a company. Open a company page and choose Block to hide yourself from everyone who works there.</p>
        )}
      </Section>

      <Section id="leaderboard-h" title="Leaderboards">
        <LeaderboardToggle initialOptOut={profile?.leaderboard_opt_out ?? false} />
      </Section>

      <Section id="cv-h" title="CV visibility and share links">
        <p className="px-5 text-body-sm text-text-secondary" data-testid="cv-visibility">
          <strong className="text-text-primary">{CV_VISIBILITY[cv?.visibility ?? "link"]}.</strong> {links ?? 0} active share{" "}
          {links === 1 ? "link" : "links"}.
        </p>
        <p className="px-5 pb-4 text-body-sm">
          <Link href="/me/cv" className="font-semibold underline underline-offset-4">
            Manage your CV settings and links
          </Link>
        </p>
      </Section>

      <Section id="viewers-h" title="Who viewed my CV">
        <p className="px-5 pb-4 text-body-sm text-text-secondary" data-testid="cv-views">
          {views ?? 0} {views === 1 ? "view" : "views"} in the last 30 days. Names of the people who viewed it are a Pro feature.
        </p>
      </Section>

      <Section id="record-h" title="Who at my university viewed my record">
        <p className="px-5 pb-4 text-body-sm text-text-secondary">
          Universities on a Growth or Campus plan can see individual student records, and every view is logged. When yours can, the
          list of who looked appears here with Pro. Nobody at your university can see your record today.
        </p>
      </Section>

      <Section id="blocked-h" title="Blocked people">
        {blocks.length ? (
          <ul className="divide-y divide-border-muted" data-testid="blocked-list">
            {blocks.map((b) => (
              <li key={b.username} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link href={`/profile/${b.username}` as Route} className="min-w-0 truncate text-body font-semibold underline-offset-4 hover:underline">
                  {b.fullName}
                </Link>
                <ConfirmAction action={unblockUser.bind(null, b.username)} label="Unblock" ariaLabel={`Unblock ${b.fullName}`} variant="secondary" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-4 text-body-sm text-text-secondary">You haven&apos;t blocked anyone. Blocking someone hides you from each other everywhere.</p>
        )}
      </Section>
    </main>
  );
}
