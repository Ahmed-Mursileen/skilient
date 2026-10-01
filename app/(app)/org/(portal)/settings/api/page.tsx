import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteWebhookButton, RevokeTokenButton, TokenForm, WebhookForm } from "@/components/recruit/api-forms";
import { Badge, EmptyState } from "@/components/ui";
import { getApiSettings, getMyOrg } from "@/lib/data/recruit";
import { ageLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "API tokens" };

/** /org/settings/api (PRD 5.20): tokens (hashed, 60 requests a minute) and signed webhooks. */
export default async function ApiSettingsPage() {
  const org = await getMyOrg();
  if (org?.role !== "admin") notFound();
  const api = await getApiSettings();
  if (!api.entitled) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="font-display text-h1">API tokens</h1>
        <EmptyState title="The API isn't part of your plan yet" description="The API and ATS export come with the Growth plan and above. They return signed CVs only for students your organisation has contacted, shortlisted or received applications from: never the talent pool." />
      </main>
    );
  }
  return (
    <main className="flex flex-col gap-8">
      <h1 className="font-display text-h1">API tokens</h1>
      <section aria-labelledby="tok-h" className="flex flex-col gap-4">
        <h2 id="tok-h" className="text-h3">Tokens</h2>
        <p className="text-body-sm text-text-secondary">
          Send <code className="font-mono text-code-sm">Authorization: Bearer &lt;token&gt;</code> to <code className="font-mono text-code-sm">/api/v1/candidates/&#123;id&#125;</code>, <code className="font-mono text-code-sm">/api/v1/shortlists</code>, <code className="font-mono text-code-sm">/api/v1/shortlists/&#123;id&#125;/candidates</code> and <code className="font-mono text-code-sm">/api/v1/jobs/&#123;id&#125;/applications</code>. 60 requests a minute per token.
        </p>
        <TokenForm />
        <ul className="flex flex-col gap-2" data-testid="tokens">
          {api.tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2">
              <span>
                <strong className="font-semibold">{t.name}</strong>{" "}
                <span className="text-body-sm text-text-secondary">created {ageLabel(t.created_at)}{t.last_used_at ? `, last used ${ageLabel(t.last_used_at)}` : ", never used"}</span>
              </span>
              {t.revoked_at ? <Badge>Revoked</Badge> : <RevokeTokenButton id={t.id} />}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="hook-h" className="flex flex-col gap-4">
        <h2 id="hook-h" className="text-h3">Webhooks</h2>
        <WebhookForm />
        <ul className="flex flex-col gap-2" data-testid="webhooks">
          {api.webhooks.map((w) => (
            <li key={w.id} className="flex flex-col gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-code-sm break-all">{w.url}</span>
                <DeleteWebhookButton id={w.id} />
              </div>
              <p className="text-body-sm text-text-secondary">
                {w.events.join(", ")} {w.active ? "" : "· paused after repeated failures"}{w.failures > 0 ? ` · ${w.failures} failed attempts in a row` : ""}
              </p>
              {w.recent.length > 0 ? (
                <p className="text-body-sm text-text-muted">Recent: {w.recent.map((d) => `${d.event} ${d.status}${d.http ? ` (${d.http})` : ""}`).join(", ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
