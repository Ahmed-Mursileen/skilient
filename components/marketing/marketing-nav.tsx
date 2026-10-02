import { List, X } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { isBuilt, nav } from "@/content/marketing";
import { Wordmark } from "./wordmark";

const linkClass =
  "inline-flex h-10 items-center rounded-md px-2.5 text-body font-medium text-text-secondary transition-colors duration-[120ms] ease-standard hover:text-text-primary";
const joinClass =
  "inline-flex h-10 items-center rounded-md bg-primary px-4 text-body font-semibold text-text-on-primary transition-[background-color,transform] duration-[120ms] ease-standard hover:bg-primary-hover active:scale-[0.98] active:bg-primary-active";

/**
 * Marketing top navigation (PRD 5.1): wordmark, organisation pages, Pricing, Verify a CV,
 * Sign in and Join. Below 1024 px the links move into a menu sheet built on the Popover API,
 * so it opens without JavaScript; Join stays in the bar. Signed in: "Open Skilient".
 */
export function MarketingNav({ home }: { home: string | null }) {
  const links = nav.links.filter((l) => isBuilt(l.href));
  const primary = home ? (
    <Link href={home as Route} className={joinClass} data-testid="nav-open">
      {nav.open}
    </Link>
  ) : (
    <Link href={nav.join.href} className={joinClass} data-testid="nav-join">
      {nav.join.label}
    </Link>
  );
  return (
    <header className="relative z-20 border-b border-border-muted bg-bg-page">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-page items-center gap-4 px-[var(--page-gutter)]">
        <Link href="/" aria-label="Skilient home" className="mr-auto shrink-0 rounded-sm">
          <Wordmark className="h-7 w-auto" />
        </Link>
        <ul className="hidden items-center gap-0.5 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={linkClass}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          {home ? null : (
            <Link href={nav.signIn.href} className={`${linkClass} hidden sm:inline-flex`}>
              {nav.signIn.label}
            </Link>
          )}
          {primary}
          <button
            type="button"
            popoverTarget="site-menu"
            className="inline-flex size-10 items-center justify-center rounded-md text-text-primary hover:bg-bg-subtle lg:hidden"
            aria-label="Menu"
          >
            <List aria-hidden weight="bold" className="size-5" />
          </button>
        </div>
      </nav>
      <div
        id="site-menu"
        popover="auto"
        className="site-menu m-0 ml-auto h-dvh max-h-none w-[min(22rem,100vw)] border-l border-border-default bg-bg-elevated p-0 text-text-primary shadow-4"
      >
        <div className="flex h-16 items-center justify-between px-[var(--page-gutter)]">
          <span className="text-h4">Menu</span>
          <button
            type="button"
            popoverTarget="site-menu"
            popoverTargetAction="hide"
            className="inline-flex size-10 items-center justify-center rounded-md hover:bg-bg-subtle"
            aria-label="Close menu"
          >
            <X aria-hidden weight="bold" className="size-5" />
          </button>
        </div>
        <ul className="flex flex-col gap-1 px-[var(--page-gutter)] pb-8">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex h-12 items-center border-b border-border-muted text-h4">
                {l.label}
              </Link>
            </li>
          ))}
          {home ? null : (
            <li>
              <Link href={nav.signIn.href} className="flex h-12 items-center text-h4">
                {nav.signIn.label}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </header>
  );
}
