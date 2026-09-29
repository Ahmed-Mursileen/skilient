import { ArrowSquareOut, SealCheck } from "@phosphor-icons/react/dist/ssr";
import type { ProfileCredential } from "@/lib/data/credentials";

/** Approved, unexpired credentials on a profile (PRD 5.19). The files are never shown here. */
export function ProfileCredentials({ items }: { items: ProfileCredential[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border-muted rounded-lg border border-border-default">
      {items.map((c) => (
        <li key={c.id} className="flex flex-col gap-1 px-4 py-3">
          <p className="text-body font-semibold break-words">{c.title}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-text-secondary">
            <span>{c.issuer}</span>
            {c.recognised ? (
              <span className="inline-flex items-center gap-1 text-text-primary">
                <SealCheck aria-hidden weight="fill" className="size-4 text-verified" />
                Recognised issuer
              </span>
            ) : null}
            <span>
              · issued {c.issuedLabel}
              {c.expiresLabel ? ` · valid until ${c.expiresLabel}` : ""}
            </span>
          </p>
          {c.verifyUrl ? (
            <a href={c.verifyUrl} target="_blank" rel="noreferrer noopener nofollow" className="inline-flex items-center gap-1 text-body-sm underline underline-offset-4">
              Issuer&apos;s verification page
              <ArrowSquareOut aria-hidden className="size-4" />
              <span className="sr-only">{" (opens in a new tab)"}</span>
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
