import { SealCheck } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

export type SkillLevel = 0 | 1 | 2 | 3 | 4;

/** Skill tag with its evidence level (L0–L4, PRD 5.5); verified marks use the deep-teal proof colour. */
export function SkillChip({
  name,
  level,
  verified = false,
  className,
}: {
  name: string;
  level?: SkillLevel;
  verified?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-body-sm",
        verified ? "border-verified bg-verified-subtle text-text-primary" : "border-border-default bg-bg-surface text-text-primary",
        className,
      )}
    >
      {verified ? <SealCheck aria-label="Verified" weight="fill" className="size-4 text-verified" /> : null}
      <span>{name}</span>
      {level !== undefined ? (
        <span className="font-mono text-code-sm text-text-secondary" aria-label={`Level ${level}`}>
          L{level}
        </span>
      ) : null}
    </span>
  );
}
