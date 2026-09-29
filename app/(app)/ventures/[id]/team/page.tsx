import type { Route } from "next";
import Link from "next/link";
import { EndorseSheet } from "@/components/endorsements/endorse-sheet";
import { TeamControls } from "@/components/ventures/team-controls";
import { Avatar, TierBadge } from "@/components/ui";
import { getEndorseOptions } from "@/lib/data/endorsements";
import { getTiers } from "@/lib/data/tiers";
import { getVenture } from "@/lib/data/ventures";
import { TEAM_ROLE_LABELS } from "@/lib/ventures/labels";

/**
 * Team tab (PRD 5.28): members with their venture role; the owner manages roles and places.
 * Members of an in-progress or completed venture endorse each other from here (PRD 5.16);
 * the completion notification opens it with ?endorse=1.
 */
export default async function VentureTeamPage({ params, searchParams }: PageProps<"/ventures/[id]/team">) {
  const { id } = await params;
  const { endorse } = await searchParams;
  const v = await getVenture(id);
  if (!v || v.viewer.byLinkOnly) return null;
  const manage = v.viewer.isOwner && v.status !== "completed";
  const canEndorse = v.viewer.isMember && (v.status === "in_progress" || v.status === "completed");
  const [endorseOptions, tiers] = await Promise.all([
    canEndorse ? getEndorseOptions(v.id) : Promise.resolve(null),
    getTiers(v.team.map((m) => m.userId)),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-text-secondary">
          {v.counts.members} of {v.teamSize} members. A venture has at most 6.
        </p>
        {endorseOptions ? <EndorseSheet ventureId={v.id} options={endorseOptions} defaultOpen={endorse === "1"} /> : null}
      </div>
      <ul className="flex flex-col divide-y divide-border-default rounded-lg border border-border-default">
        {v.team.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 p-4">
            <Avatar name={m.fullName} src={m.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">
                {m.username ? (
                  <Link href={`/profile/${m.username}` as Route} className="underline-offset-4 hover:underline">
                    {m.fullName}
                  </Link>
                ) : (
                  m.fullName
                )}
                {m.userId === v.viewer.userId ? <span className="font-normal text-text-secondary"> (you)</span> : null}
              </p>
              {tiers.get(m.userId) ? <TierBadge tier={tiers.get(m.userId)!} className="mt-1" /> : null}
              <p className="text-body-sm text-text-secondary">
                {m.isOwner ? "Owner · " : ""}
                {TEAM_ROLE_LABELS[m.teamRole]}
              </p>
            </div>
            {manage && !m.isOwner ? (
              <TeamControls ventureId={v.id} memberId={m.userId} name={m.fullName} teamRole={m.teamRole} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
