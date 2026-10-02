import type { Metadata, Route } from "next";
import Link from "next/link";
import { ConfigTabs } from "@/components/ops/config-tabs";
import { Badge } from "@/components/ui";
import { getConfigKeys } from "@/lib/data/ops-config";

export const metadata: Metadata = { title: "Config" };

/**
 * /ops/config (PRD 5.26, screen spec 3.11): every platform setting, its current version and when a
 * change applies. Any staff role reads; super admins save new versions on the key's page.
 */
export default async function OpsConfigPage() {
  const keys = await getConfigKeys();
  const areas = [...new Set(keys.map((k) => k.area))];
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Config</h1>
      <ConfigTabs current="/ops/config" />
      {areas.map((area) => (
        <section key={area} aria-labelledby={`area-${area}`} className="flex flex-col gap-2">
          <h2 id={`area-${area}`} className="text-h3 capitalize">
            {area.replaceAll("_", " ")}
          </h2>
          <ul className="flex flex-col divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface">
            {keys
              .filter((k) => k.area === area)
              .map((k) => (
                <li key={k.key} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2" data-testid="config-key">
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/ops/config/${k.key}` as Route} className="font-mono text-body-sm font-semibold underline underline-offset-4">
                      {k.key}
                    </Link>
                    <span className="text-caption text-text-secondary">{k.description}</span>
                  </div>
                  <div className="flex items-center gap-2 text-caption text-text-secondary">
                    {k.applies === "next_nightly" ? <Badge>Next nightly run</Badge> : null}
                    <span>
                      v{k.version ?? 0}
                      {k.effective ? `, ${k.effective}` : ""}
                      {k.staffName ? ` by ${k.staffName}` : ""}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
