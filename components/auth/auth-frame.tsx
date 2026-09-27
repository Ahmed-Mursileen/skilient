import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui";

/** Centred card for signup, sign-in and account pages (screen spec 3.12). */
export function AuthFrame({
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-[var(--page-gutter)] pt-6 pb-12">
      <header className={`flex w-full items-center justify-between ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <Link href="/" aria-label="Skilient home" className="rounded-sm">
          <Image src="/brand/skilient-logo.svg" alt="Skilient" width={141} height={32} priority className="h-8 w-auto dark:hidden" />
          <Image
            src="/brand/skilient-logo-reversed.svg"
            alt="Skilient"
            width={141}
            height={32}
            priority
            className="hidden h-8 w-auto dark:block"
          />
        </Link>
        <ThemeToggle />
      </header>
      <main className={`mt-10 w-full sm:mt-16 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="rounded-lg border border-border-default bg-bg-surface p-6 shadow-1 sm:p-8">
          <h1 className="font-display text-h2 text-text-primary">{title}</h1>
          {description ? <div className="mt-2 text-body text-text-secondary">{description}</div> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-body-sm text-text-secondary">{footer}</div> : null}
      </main>
    </div>
  );
}
