"use client";

import { Lock } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Badge, EmptyState, Switch } from "@/components/ui";
import { setRepoExcluded } from "@/lib/actions/github";
import type { ActionError } from "@/lib/actions/result";
import type { GithubRepoRow } from "@/lib/data/github";

const KIND_LABEL = { owned: "Yours", collaborator: "Collaborator", fork: "Fork", template: "From a template" } as const;

/** The repositories the student shared, each with a switch to keep it out of their skills. */
export function RepoList({ repos }: { repos: GithubRepoRow[] }) {
  const [error, setError] = useState<ActionError | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [excluded, setExcluded] = useState(() => new Map(repos.map((r) => [r.repoId, r.excluded])));
  const [, startTransition] = useTransition();

  if (!repos.length) {
    return (
      <EmptyState
        title="No repositories yet"
        description="Repositories you share with the Skilient App appear here. To add more, change the App's repository access on GitHub, then resync."
      />
    );
  }

  function toggle(repoId: number, count: boolean) {
    setError(null);
    setPendingId(repoId);
    setExcluded((m) => new Map(m).set(repoId, !count));
    startTransition(async () => {
      const form = new FormData();
      form.set("repoId", String(repoId));
      form.set("excluded", String(!count));
      const result = await setRepoExcluded(form);
      if (!result.ok) {
        setError(result);
        setExcluded((m) => new Map(m).set(repoId, count));
      }
      setPendingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <ul className="divide-y divide-border-muted rounded-lg border border-border-default">
        {repos.map((repo) => {
          const counted = !excluded.get(repo.repoId);
          const labelId = `repo-${repo.repoId}`;
          return (
            <li key={repo.repoId} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span id={labelId} className="block truncate font-mono text-code">
                  {repo.fullName}
                </span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {repo.private ? (
                    <Badge>
                      <Lock aria-hidden weight="bold" className="size-3" />
                      Private
                    </Badge>
                  ) : null}
                  {repo.kind ? <Badge>{KIND_LABEL[repo.kind]}</Badge> : <Badge>Checking…</Badge>}
                  {!counted ? <Badge tone="warning">Excluded</Badge> : null}
                </span>
              </span>
              <Switch
                checked={counted}
                disabled={pendingId === repo.repoId}
                onCheckedChange={(value) => toggle(repo.repoId, value)}
                aria-labelledby={labelId}
                aria-describedby="repo-switch-help"
              />
            </li>
          );
        })}
      </ul>
      <p id="repo-switch-help" className="text-body-sm text-text-muted">
        Switch a repository off to keep it out of your skills. Private repository names are only ever shown to you.
      </p>
    </div>
  );
}
