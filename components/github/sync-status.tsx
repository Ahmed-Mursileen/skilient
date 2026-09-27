"use client";

import { ArrowsClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { GithubSync } from "@/lib/data/github";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Live progress (PRD 5.5: "14 repos · 212 commits analysed · 9 skills"). While a sync is
 * open the page refreshes itself every few seconds; the line is announced politely.
 */
export function SyncStatus({ sync }: { sync: GithubSync | null }) {
  const router = useRouter();
  const active = sync?.status === "queued" || sync?.status === "running";

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);

  let icon = <CheckCircle aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 text-success" />;
  let text = "Not synced yet.";
  if (sync && active) {
    icon = <ArrowsClockwise aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 animate-spin text-text-muted motion-reduce:animate-none" />;
    text =
      sync.reposTotal > 0
        ? `Reading your repositories: ${sync.reposDone} of ${plural(sync.reposTotal, "repo")} · ${plural(sync.commitsAnalysed, "commit")} analysed · ${plural(sync.skillsFound, "skill")}`
        : "Finding the repositories you shared…";
  } else if (sync?.status === "done") {
    text = `Up to date: ${plural(sync.reposTotal, "repo")} · ${plural(sync.commitsAnalysed, "commit")} analysed · ${plural(sync.skillsFound, "skill")}. Last synced ${when.format(new Date(sync.finishedAt ?? sync.createdAt))}.`;
  } else if (sync?.status === "failed") {
    icon = <WarningCircle aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 text-text-error" />;
    text = "The last sync didn't finish. Resync to try again; if it keeps failing, our team can see why.";
  } else if (sync?.status === "cancelled") {
    text = "The last sync was stopped. Resync when you're ready.";
  }

  return (
    <p aria-live="polite" className="flex items-start gap-2 text-body-sm text-text-secondary">
      {icon}
      <span>{text}</span>
    </p>
  );
}
