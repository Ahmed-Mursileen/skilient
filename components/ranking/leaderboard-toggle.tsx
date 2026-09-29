"use client";

import { useId, useState, useTransition } from "react";
import { FieldError, Switch } from "@/components/ui";
import { setLeaderboardOptOut } from "@/lib/actions/ranking";

/** "Show me on leaderboards": on by default (PRD 5.17). Saves on change. */
export function LeaderboardToggle({ initialOptOut }: { initialOptOut: boolean }) {
  const id = useId();
  const [shown, setShown] = useState(!initialOptOut);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 px-5 py-4" aria-busy={pending || undefined}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <label htmlFor={id} className="text-h4">
            Show me on leaderboards
          </label>
          <p className="text-body-sm text-text-secondary" id={`${id}-desc`}>
            Your university, department, batch and global boards show your rank, tier and weekly change, never your points.
            If you turn this off, you leave every board; your tier still shows on your profile and to recruiters, and your
            score keeps counting.
          </p>
        </div>
        <Switch
          id={id}
          aria-describedby={`${id}-desc`}
          checked={shown}
          disabled={pending}
          onCheckedChange={(next) => {
            setError(null);
            setSaved(false);
            startTransition(async () => {
              const result = await setLeaderboardOptOut(!next);
              if (result.ok) {
                setShown(next);
                setSaved(true);
              } else setError(result.message);
            });
          }}
        />
      </div>
      <p role="status" className="text-caption text-text-secondary">
        {saved ? "Saved." : ""}
      </p>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
