import { Paperclip, SealCheck } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { HideEndorsementButton } from "@/components/endorsements/hide-button";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SkillEndorsements } from "@/lib/data/endorsements";

/**
 * A profile's endorsements, grouped by skill (PRD 5.16). A skill endorsed by 2 or more
 * different teammates is peer-verified. The owner can hide one (it stops counting and others
 * stop seeing it) and show it again; nobody can edit one.
 */
export function EndorsementList({
  groups,
  isOwner,
  username,
  peerVerifiedMin = 2,
}: {
  groups: SkillEndorsements[];
  isOwner: boolean;
  username: string;
  peerVerifiedMin?: number;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {groups.map((g) => (
        <li key={g.skillId} className="rounded-lg border border-border-default">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-muted px-4 py-3">
            <h3 className="text-body font-semibold">{g.skillName}</h3>
            <p className="text-body-sm text-text-secondary">
              {g.endorsers} teammate{g.endorsers === 1 ? "" : "s"}
            </p>
            {g.endorsers >= peerVerifiedMin ? (
              <span className="inline-flex items-center gap-1 text-body-sm text-text-primary">
                <SealCheck aria-hidden weight="fill" className="size-4 text-verified" />
                Peer-verified
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-border-muted">
            {g.items.map((e) => (
              <li key={e.id} className={cn("flex gap-3 px-4 py-3", e.hidden && "bg-bg-subtle")}>
                <Avatar name={e.endorser.name} src={e.endorser.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm">
                    {e.endorser.username ? (
                      <Link href={`/profile/${e.endorser.username}` as Route} className="font-semibold underline-offset-4 hover:underline">
                        {e.endorser.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{e.endorser.name}</span>
                    )}
                    <span className="text-text-secondary">
                      {e.venture ? (
                        <>
                          {" "}
                          on{" "}
                          <Link href={`/ventures/${e.venture.id}` as Route} className="underline underline-offset-4">
                            {e.venture.title}
                          </Link>
                        </>
                      ) : null}{" "}
                      · {e.dateLabel}
                    </span>
                  </p>
                  {e.note ? <p className="mt-1 text-body whitespace-pre-line">{e.note}</p> : null}
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-text-secondary">
                    {e.hasEvidence ? (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip aria-hidden className="size-4" />
                        Tied to a contribution
                      </span>
                    ) : null}
                    {e.hidden ? <span>Hidden from others</span> : null}
                  </div>
                </div>
                {isOwner ? <HideEndorsementButton id={e.id} hidden={e.hidden} username={username} name={e.endorser.name} /> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
