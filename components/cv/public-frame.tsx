import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui";

/** Signed-out pages around a CV (share links, verify): logo, theme, a wide column. */
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-[var(--page-gutter)] pt-6 pb-12">
      <header className="flex w-full max-w-3xl items-center justify-between">
        <Link href="/" aria-label="Skilient home" className="rounded-sm">
          <Image src="/brand/skilient-logo.svg" alt="Skilient" width={141} height={32} priority className="h-8 w-auto dark:hidden" />
          <Image src="/brand/skilient-logo-reversed.svg" alt="Skilient" width={141} height={32} priority className="hidden h-8 w-auto dark:block" />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mt-8 flex w-full max-w-3xl flex-col gap-6">{children}</main>
    </div>
  );
}
