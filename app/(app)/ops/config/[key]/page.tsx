import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditDiff } from "@/components/ops/audit-diff";
import { ConfigEditor } from "@/components/ops/config-forms";
import { Badge } from "@/components/ui";
import { getConfigDetail } from "@/lib/data/ops-config";
import { staffRoles } from "@/lib/data/ops-trust";
import { configDiff } from "@/lib/ops/diff";

export const metadata: Metadata = { title: "Setting" };

/** /ops/config/[key]: current value, the versioned editor (super admins) and every version with its diff and reason. */
export default async function OpsConfigKeyPage({ params }: PageProps<"/ops/config/[key]">) {
  const { key } = await params;
  if (!/^[a-z][a-z0-9_.]{1,80}$/.test(key)) notFound();
  const [d, roles] = await Promise.all([getConfigDetail(key), staffRoles()]);
  if (!d) notFound();
  const latest = d.versions[0];
  return (
    <main className="flex flex-col gap-5">
      <p>
        <Link href={"/ops/config" as Route} className="text-body-sm underline underline-offset-4">
          All settings
        </Link>
      </p>
      <header className="flex flex-col gap-1">
        <h1 className="font-mono text-h2 font-semibold">{d.key}</h1>
        <p className="text-body text-text-secondary">{d.description}</p>
        <p className="flex items-center gap-2 text-body-sm">
          Version {latest?.version ?? 0}
          {d.applies === "next_nightly" ? <Badge>Applies at the next nightly run</Badge> : <Badge>Applies straight away</Badge>}
        </p>
      </header>
      {roles.has("super_admin") ? (
        <ConfigEditor configKey={d.key} current={d.current} version={latest?.version ?? null} applies={d.applies} />
      ) : (
        <pre className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface p-4 font-mono text-caption" tabIndex={0} aria-label="Current value">
          {JSON.stringify(d.current, null, 2)}
        </pre>
      )}
      <section aria-labelledby="hist-h" className="flex flex-col gap-2">
        <h2 id="hist-h" className="text-h3">
          History
        </h2>
        <ol className="flex flex-col divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface" data-testid="config-history">
          {d.versions.map((v, i) => {
            const prev = d.versions[i + 1];
            const rows = prev ? configDiff(prev.value, v.value) : [];
            return (
              <li key={v.version} className="flex flex-col gap-1 px-4 py-3" data-testid="config-version">
                <p className="text-body-sm">
                  <span className="font-semibold">Version {v.version}</span> · {v.when} · {v.staffName ?? "migration"}
                </p>
                <p className="text-body-sm">{v.reason}</p>
                {prev ? (
                  <details className="text-body-sm">
                    <summary className="cursor-pointer text-text-secondary underline underline-offset-4">
                      {rows.length} change{rows.length === 1 ? "" : "s"} from version {prev.version}
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <AuditDiff before={Object.fromEntries(rows.map((r) => [r.key, r.before]))} after={Object.fromEntries(rows.map((r) => [r.key, r.after]))} />
                    </div>
                  </details>
                ) : (
                  <p className="text-caption text-text-secondary">First version</p>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
