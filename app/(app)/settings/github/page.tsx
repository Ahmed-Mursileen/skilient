import { GithubLogo, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { AccountActions } from "@/components/github/account-actions";
import { ConnectGithubButton } from "@/components/github/connect-button";
import { RepoList } from "@/components/github/repo-list";
import { SyncStatus } from "@/components/github/sync-status";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getGithubOverview, GITHUB_OUTCOMES } from "@/lib/data/github";
import { githubApp } from "@/lib/github/config";

export const metadata: Metadata = { title: "GitHub" };

const since = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Karachi" });

/** Settings → GitHub (PRD 5.5): connection, sync progress, repositories, disconnect. */
export default async function GithubSettingsPage({ searchParams }: PageProps<"/settings/github">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) notFound();
  const configured = githubApp() !== null;
  const { account, sync, repos } = await getGithubOverview(user.id);
  const outcome = typeof params.github === "string" ? GITHUB_OUTCOMES[params.github] : undefined;
  const syncing = sync?.status === "queued" || sync?.status === "running";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-[var(--page-gutter)] py-8">
      <div>
        <Link href="/settings" className="text-body-sm text-text-secondary underline underline-offset-4">
          Settings
        </Link>
        <h1 className="mt-1 font-display text-h1">GitHub</h1>
      </div>

      {outcome ? <FormAlert tone={outcome.tone}>{outcome.message}</FormAlert> : null}

      {!account ? (
        <section aria-labelledby="connect" className="rounded-lg border border-border-default bg-bg-surface p-5 sm:p-6">
          <h2 id="connect" className="text-h3">
            Connect GitHub
          </h2>
          <WhatWeRead />
          <div className="mt-6">
            {configured ? (
              <ConnectGithubButton returnTo="settings" />
            ) : (
              <EmptyState
                icon={<GithubLogo aria-hidden className="size-8" />}
                title="Not available yet"
                description="Connecting GitHub isn't switched on for this deployment yet."
              />
            )}
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="connection" className="rounded-lg border border-border-default bg-bg-surface p-5 sm:p-6">
            <h2 id="connection" className="text-h3">
              Connected as <span className="font-mono">@{account.login}</span>
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">Since {since.format(new Date(account.connectedAt))}</p>
            {account.revoked ? (
              <div className="mt-5 flex flex-col gap-4">
                <FormAlert>
                  Skilient&apos;s access was revoked on GitHub, so your skills aren&apos;t being updated. Reconnect to pick
                  up where you left off.
                </FormAlert>
                {configured ? <ConnectGithubButton returnTo="settings" label="Reconnect GitHub" size="md" /> : null}
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-5">
                <SyncStatus sync={sync} />
                <AccountActions syncing={syncing} />
              </div>
            )}
          </section>

          <section aria-labelledby="repositories" className="flex flex-col gap-3">
            <h2 id="repositories" className="text-h3">
              Repositories
            </h2>
            <RepoList repos={repos} />
          </section>
        </>
      )}
    </main>
  );
}

function WhatWeRead() {
  return (
    <div className="mt-3 flex flex-col gap-4 text-body">
      <p className="flex items-start gap-3">
        <GithubLogo aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-text-muted" />
        <span>
          You choose which repositories the Skilient GitHub App can read, private ones included. We read the languages,
          frameworks and tools your own commits use, and your merged pull requests. That&apos;s how your skills get
          verified levels.
        </span>
      </p>
      <p className="flex items-start gap-3">
        <ShieldCheck aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-text-muted" />
        <span>
          We never write to your repositories, never store your code, and never show a private repository&apos;s name to
          anyone but you. You can disconnect at any time.
        </span>
      </p>
    </div>
  );
}
