import { Prohibit } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import type { Restriction } from "@/lib/data/sanctions";

/** Shown on every signed-in page while the account is suspended (PRD 5.26): read, appeal or delete only. */
export function RestrictionBanner({ restriction }: { restriction: Restriction }) {
  return (
    <div role="status" className="border-b border-border-strong bg-bg-subtle px-[var(--page-gutter)] py-3" data-testid="restriction-banner">
      <p className="mx-auto flex max-w-page flex-wrap items-center gap-2 text-body-sm">
        <Prohibit aria-hidden weight="bold" className="size-4 shrink-0 text-text-error" />
        <span className="font-semibold">
          Your account is {restriction.kind === "ban" ? "banned" : "suspended"}
          {restriction.untilLabel ? ` until ${restriction.untilLabel}` : ""}.
        </span>
        <span>You can read, appeal the decision or delete your account, but not post, message or apply.</span>
        <Link href={"/appeals" as Route} className="font-semibold underline underline-offset-4">
          Appeal
        </Link>
      </p>
    </div>
  );
}
