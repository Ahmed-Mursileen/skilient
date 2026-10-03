import type { Icon } from "@phosphor-icons/react";
import { CheckCircle, Code, FolderSimple, LockSimple, Robot, SealCheck, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

export type SkillLevel = 0 | 1 | 2 | 3 | 4;

/**
 * One icon per evidence level (PRD 5.5), so a level never rests on colour alone:
 * L0 private, L1 found in repos, L2 written, L3 accepted by others, L4 vouched for.
 */
const LEVEL_ICONS: Record<SkillLevel, Icon> = {
  0: LockSimple,
  1: FolderSimple,
  2: Code,
  3: UsersThree,
  4: SealCheck,
};

export function SkillLevelIcon({ level, className }: { level: SkillLevel; className?: string }) {
  const LevelIcon = LEVEL_ICONS[level];
  return (
    <LevelIcon
      aria-hidden
      weight={level >= 3 ? "fill" : "bold"}
      className={cn("size-4 shrink-0", level >= 3 ? "text-verified" : "text-text-secondary", className)}
    />
  );
}

/**
 * Skill tag with its evidence level (L0–L4, PRD 5.5). L3 and up, confirmed by other people,
 * use the verified proof colour. `verified` forces that style without a level (tags on posts).
 * `peerVerified` adds a check for a skill endorsed by 2+ different teammates (PRD 5.16).
 * `aiAssisted` marks a skill mostly written with an AI coding agent (decisions 2026-10-03).
 */
export function SkillChip({
  name,
  level,
  verified = false,
  peerVerified = false,
  aiAssisted = false,
  className,
}: {
  name: string;
  level?: SkillLevel;
  verified?: boolean;
  peerVerified?: boolean;
  aiAssisted?: boolean;
  className?: string;
}) {
  const proof = verified || (level !== undefined && level >= 3);
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-body-sm",
        proof ? "border-verified bg-verified-subtle text-text-primary" : "border-border-default bg-bg-surface text-text-primary",
        className,
      )}
    >
      {level !== undefined ? (
        <SkillLevelIcon level={level} />
      ) : verified ? (
        <SealCheck aria-label="Verified" weight="fill" className="size-4 text-verified" />
      ) : null}
      <span>{name}</span>
      {level !== undefined ? (
        <span className="font-mono text-code-sm text-text-secondary" aria-label={`Level ${level}`}>
          L{level}
        </span>
      ) : null}
      {aiAssisted ? (
        <span className="inline-flex items-center text-text-secondary" title="AI-assisted">
          <Robot aria-hidden weight="bold" className="size-4" />
          <span className="sr-only">AI-assisted</span>
        </span>
      ) : null}
      {peerVerified ? <CheckCircle aria-label="Peer-verified" role="img" weight="fill" className="size-4 text-verified" /> : null}
    </span>
  );
}
