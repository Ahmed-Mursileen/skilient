import { cn } from "@/lib/cn";

export const TIERS = ["raw", "spark", "flare", "shine", "radiant", "luminary"] as const;
export type Tier = (typeof TIERS)[number];

export const tierLabel: Record<Tier, string> = {
  raw: "Raw",
  spark: "Spark",
  flare: "Flare",
  shine: "Shine",
  radiant: "Radiant",
  luminary: "Luminary",
};

// Full class names so Tailwind can see them.
const tierClass: Record<Tier, { dot: string; chip: string }> = {
  raw: { dot: "bg-tier-raw", chip: "border-tier-raw text-tier-raw-text" },
  spark: { dot: "bg-tier-spark", chip: "border-tier-spark text-tier-spark-text" },
  flare: { dot: "bg-tier-flare", chip: "border-tier-flare text-tier-flare-text" },
  shine: { dot: "bg-tier-shine", chip: "border-tier-shine text-tier-shine-text" },
  radiant: { dot: "bg-tier-radiant", chip: "border-tier-radiant text-tier-radiant-text" },
  luminary: { dot: "bg-tier-luminary", chip: "border-tier-luminary text-tier-luminary-text" },
};

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const c = tierClass[tier];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-bg-surface px-2.5 text-caption font-semibold",
        c.chip,
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", c.dot)} />
      {tierLabel[tier]}
    </span>
  );
}
