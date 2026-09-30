import { badgeLabel } from "@/lib/nav";
import { cn } from "@/lib/cn";

/** The count on a nav item: text as well as colour. The link's own aria-label says "n unread". */
export function BadgePill({ count, className, testId }: { count: number; className?: string; testId?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn("rounded-full bg-primary px-1.5 text-caption font-semibold text-text-on-primary tabular-nums", className)}
      data-testid={testId}
    >
      {badgeLabel(count)}
    </span>
  );
}
