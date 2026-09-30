"use client";

import { useId, useState, useTransition } from "react";
import { Badge, Button, FieldError, Input, Label } from "@/components/ui";
import { createShareLink, revokeShareLink } from "@/lib/actions/cv";
import type { CvShareLink } from "@/lib/data/cv";

const EXPIRY: { value: "7" | "30" | "90" | "none"; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "none", label: "No expiry" },
];

/**
 * Share links (PRD 5.18, Spark and above; decisions.md 2026-10-01): made with an expiry and an
 * optional label, shown once (only a hash is kept), revocable, with their view counts.
 */
export function ShareLinks({ links, canShare, paused }: { links: CvShareLink[]; canShare: boolean; paused: boolean }) {
  const id = useId();
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]["value"]>("30");
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = links.filter((l) => !l.revoked && !l.expired);

  return (
    <div className="flex flex-col gap-4" aria-busy={pending || undefined}>
      {!canShare ? (
        <p className="text-body-sm text-text-secondary" data-testid="share-locked">
          Share links open at Spark tier. You reach Spark with 100 points and one peer-verified contribution.
        </p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setMade(null);
            setCopied(false);
            startTransition(async () => {
              const result = await createShareLink({ label: label.trim() || undefined, days: expiry === "none" ? null : (Number(expiry) as 7 | 30 | 90) });
              if (result.ok) {
                setMade(result.data.url);
                setLabel("");
              } else setError(result.message);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-label`}>Label (optional)</Label>
            <Input id={`${id}-label`} value={label} maxLength={60} placeholder="For Systems Ltd" onChange={(e) => setLabel(e.target.value)} />
          </div>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
            <legend className="mb-1 text-body-sm font-semibold">Expires after</legend>
            {EXPIRY.map((x) => (
              <label key={x.value} className="flex items-center gap-2 text-body">
                <input type="radio" name={`${id}-expiry`} value={x.value} checked={expiry === x.value} onChange={() => setExpiry(x.value)} className="size-4" />
                {x.label}
              </label>
            ))}
          </fieldset>
          <Button type="submit" variant="secondary" loading={pending} disabled={active.length >= 10}>
            Make a share link
          </Button>
          {active.length >= 10 ? <p className="text-body-sm text-text-secondary">You have 10 active links. Revoke one to make another.</p> : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </form>
      )}

      {made ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-bg-subtle p-3" data-testid="new-link">
          <p className="text-body-sm font-semibold">Copy your link now: it won&rsquo;t be shown again.</p>
          <code className="font-mono text-caption break-all" data-testid="new-link-url">
            {made}
          </code>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(made).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : null}

      {paused ? <p className="text-body-sm font-semibold text-text-primary">Your CV is set to &ldquo;Only me&rdquo;, so these links are paused.</p> : null}

      {links.length ? (
        <ul className="flex flex-col divide-y divide-border-default rounded-md border border-border-default" aria-label="Your share links">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="share-link">
              <div className="min-w-0">
                <p className="text-body font-semibold">{l.label ?? "Share link"}</p>
                <p className="text-caption text-text-secondary">
                  Made {l.createdLabel} · {l.expiresLabel ? `${l.expired ? "expired" : "expires"} ${l.expiresLabel}` : "no expiry"} ·{" "}
                  {l.viewCount === 1 ? "1 view" : `${l.viewCount} views`}
                </p>
              </div>
              {l.revoked ? (
                <Badge>Revoked</Badge>
              ) : l.expired ? (
                <Badge>Expired</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await revokeShareLink(l.id);
                      if (!result.ok) setError(result.message);
                    })
                  }
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-text-secondary">No share links yet.</p>
      )}
    </div>
  );
}
