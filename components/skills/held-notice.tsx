import { Clock } from "@phosphor-icons/react/dist/ssr";

/**
 * PRD 5.5: "The student sees 'some activity is being reviewed', never an accusation."
 * Shown only to the owner.
 */
export function HeldNotice({ count }: { count: number }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md border border-border-default bg-bg-surface px-4 py-3 text-body-sm text-text-primary"
    >
      <Clock aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>
        Some of your activity is being reviewed ({count} {count === 1 ? "commit" : "commits"}). It counts toward your
        skills once a reviewer has looked at it, usually within 72 hours. You don&apos;t need to do anything.
      </span>
    </p>
  );
}
