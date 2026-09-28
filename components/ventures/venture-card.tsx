import { Buildings, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { VentureStatusBadge } from "@/components/ventures/status-badge";
import { SkillChip } from "@/components/ui";
import type { VentureRow } from "@/lib/data/ventures";
import { STAGE_OPTIONS, TYPE_LABELS } from "@/lib/ventures/labels";

/** Venture row (screen spec "Venture row"): title, type, status, needed skills, team x/y, owner. */
export function VentureCard({ venture }: { venture: VentureRow }) {
  const stage = STAGE_OPTIONS.find((s) => s.value === venture.stage)?.label;
  return (
    <article className="relative rounded-lg border border-border-default bg-bg-surface p-5 transition-colors duration-[120ms] hover:border-border-strong">
      <div className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        <span className="font-semibold uppercase">{TYPE_LABELS[venture.type].one}</span>
        {stage ? <span>· {stage}</span> : null}
        <VentureStatusBadge status={venture.status} />
      </div>
      <h3 className="mt-2 text-h4">
        {/* The whole card is the link target; the title carries the accessible name. */}
        <Link href={`/ventures/${venture.id}` as Route} className="after:absolute after:inset-0 after:content-['']">
          {venture.title}
        </Link>
      </h3>
      {venture.summary ? <p className="mt-1 line-clamp-2 text-body-sm text-text-secondary">{venture.summary}</p> : null}
      {venture.skills.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Skills">
          {venture.skills.slice(0, 5).map((s) => (
            <li key={s.id}>
              <SkillChip name={s.name} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <UsersThree aria-hidden weight="bold" className="size-4" />
          {venture.members} of {venture.teamSize} {venture.teamSize === 1 ? "member" : "members"}
          {venture.openSlots ? ` · ${venture.openSlots} open ${venture.openSlots === 1 ? "role" : "roles"}` : ""}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Buildings aria-hidden weight="bold" className="size-4" />
          {venture.universityName}
        </span>
        <span>by {venture.owner.name}</span>
      </div>
    </article>
  );
}
