"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError } from "@/components/ui";
import { reissueCv, revokeCvVersion } from "@/lib/actions/cv";
import type { CvVersion } from "@/lib/data/cv";
import { formatCode } from "@/supabase/functions/_shared/cv/sign.ts";

const REASONS: Record<string, string> = {
  owner: "revoked by you",
  staff: "revoked by Skilient",
  suspended: "revoked (account suspended)",
  deleted: "revoked",
};

/** Every version with its code and status; revoke any, and re-issue the newest after revoking it. */
export function CvVersions({ versions }: { versions: CvVersion[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const newest = versions[0];
  const canReissue = newest?.revokedReason === "owner";

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
      {canReissue ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-bg-subtle p-3">
          <p className="text-body-sm">
            Your newest version is revoked, so your share links say &ldquo;no longer available&rdquo;. Issue the same content under a new
            code to turn them back on.
          </p>
          <Button
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await reissueCv();
                if (!result.ok) setError(result.message);
              })
            }
          >
            Issue under a new code
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col divide-y divide-border-default rounded-md border border-border-default" aria-label="CV versions">
        {versions.map((v, i) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="cv-version">
            <div className="min-w-0">
              <p className="font-mono text-body-sm">{formatCode(v.code)}</p>
              <p className="text-caption text-text-secondary">
                Version {v.version} · issued {v.issuedLabel}
                {v.revokedLabel ? ` · ${REASONS[v.revokedReason ?? ""] ?? "revoked"} ${v.revokedLabel}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {v.revokedLabel ? <Badge tone="error">Revoked</Badge> : i === 0 ? <Badge tone="verified">Current</Badge> : <Badge>Superseded</Badge>}
              {!v.revokedLabel ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      Revoke
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    title={`Revoke ${formatCode(v.code)}?`}
                    description="Anyone who checks this code will see Revoked. This can't be undone."
                  >
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="ghost">Keep it</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          variant="danger"
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              const result = await revokeCvVersion(v.id);
                              if (!result.ok) setError(result.message);
                            })
                          }
                        >
                          Revoke this version
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
