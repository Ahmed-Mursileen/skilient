import { FacebookLogo, InstagramLogo, LinkedinLogo, XLogo } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { footer, isBuilt } from "@/content/marketing";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Wordmark } from "./wordmark";

const SOCIAL_ICONS = { linkedin: LinkedinLogo, instagram: InstagramLogo, x: XLogo, facebook: FacebookLogo } as const;

/** Marketing footer (PRD 5.1 section 15): links, contact, socials, the theme toggle, ©. */
export function MarketingFooter() {
  const columns = footer.columns.map((c) => ({ ...c, links: c.links.filter((l) => isBuilt(l.href)) })).filter((c) => c.links.length);
  return (
    <footer className="border-t border-border-default bg-bg-surface">
      <div className="mx-auto grid max-w-page gap-12 px-[var(--page-gutter)] pt-16 pb-10 md:grid-cols-12 md:gap-6">
        <div className="flex flex-col gap-4 md:col-span-4">
          <Wordmark className="h-9 w-auto self-start" />
          <p className="max-w-[30ch] text-body text-text-secondary">Prove it. Don&apos;t claim it.</p>
          {footer.contactEmail ? (
            <a href={`mailto:${footer.contactEmail}`} className="self-start text-body font-semibold underline underline-offset-4">
              {footer.contactEmail}
            </a>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-8">
          {columns.map((col) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <h2 className="text-h4">{col.heading}</h2>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-body text-text-secondary hover:text-text-primary hover:underline hover:underline-offset-4">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 border-t border-border-muted px-[var(--page-gutter)] py-6">
        <p className="text-body-sm text-text-muted">{footer.copyright}</p>
        <div className="flex items-center gap-4">
          {footer.social.length ? (
            <ul className="flex items-center gap-1">
              {footer.social.map((s) => {
                const Icon = SOCIAL_ICONS[s.network];
                return (
                  <li key={s.href}>
                    <a href={s.href} rel="noopener" aria-label={s.label} className="inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:text-text-primary">
                      <Icon aria-hidden weight="bold" className="size-5" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
