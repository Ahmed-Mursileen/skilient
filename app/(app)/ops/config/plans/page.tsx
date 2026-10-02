import type { Metadata } from "next";
import { ConfigTabs } from "@/components/ops/config-tabs";
import { PlanPriceForm } from "@/components/ops/config-forms";
import { getPlans } from "@/lib/data/ops-config";
import { staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: "Plan prices" };

const fmt = (n: number | null, cur: string) => (n === null ? "—" : `${cur} ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`);

/** /ops/config/plans (PRD 5.26): plan prices; super admins change them (audited), for new subscriptions and renewals. */
export default async function OpsPlansPage() {
  const [plans, roles] = await Promise.all([getPlans(), staffRoles()]);
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Plan prices</h1>
      <ConfigTabs current="/ops/config/plans" />
      <p className="text-body-sm text-text-secondary">A change applies to new subscriptions and to renewals from their next period. Every change is in the audit log.</p>
      <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
        <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="plans-table">
          <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Plan</th>
              <th scope="col" className="px-3 py-2 font-semibold">For</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">PKR</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">USD</th>
              <th scope="col" className="px-3 py-2 font-semibold">Changes</th>
              <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Change</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {plans.map((p) => (
              <tr key={p.id} data-testid="plan-row">
                <td className="px-3 py-2">
                  <span className="font-semibold">{p.label}</span> <span className="text-caption text-text-secondary">({p.interval})</span>
                  {!p.active ? <span className="ml-1 text-caption text-text-secondary">inactive</span> : null}
                </td>
                <td className="px-3 py-2">{p.audience}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(p.pricePkr, "PKR")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(p.priceUsd, "USD")}</td>
                <td className="px-3 py-2 tabular-nums">{p.changes}</td>
                <td className="px-3 py-2 text-right">
                  {roles.has("super_admin") && (p.pricePkr !== null || p.priceUsd !== null) ? <PlanPriceForm planId={p.id} label={p.label} pkr={p.pricePkr} usd={p.priceUsd} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
