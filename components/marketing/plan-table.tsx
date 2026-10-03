import { Check } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { pricingPage as copy } from "@/content/marketing";
import { cn } from "@/lib/cn";
import type { PublicPlan } from "@/lib/data/marketing";
import { planLines, pkr } from "@/lib/marketing/plan-lines";

/**
 * Plans for one audience as columns (PRD 4a), prices and lines straight from `plans`. When a tier
 * has a monthly and a yearly price, a radio pair switches them with CSS only (`:has()`), so the
 * toggle works with JavaScript off. A free column, written in content, can lead the row.
 */

export interface FreeColumn {
  label: string;
  items: readonly string[];
  note?: string;
}

interface Tier {
  tier: string;
  label: string;
  month: PublicPlan | null;
  year: PublicPlan | null;
}

function tiers(plans: PublicPlan[]): Tier[] {
  const out = new Map<string, Tier>();
  for (const p of [...plans].sort((a, b) => a.position - b.position)) {
    const t = out.get(p.tier) ?? { tier: p.tier, label: p.label, month: null, year: null };
    t[p.interval] = p;
    out.set(p.tier, t);
  }
  return [...out.values()];
}

function Price({ plan, per, className }: { plan: PublicPlan | null; per: string; className?: string }) {
  if (!plan) return null;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="font-display text-h2 tabular-nums">{plan.price_pkr === null ? copy.custom : pkr(plan.price_pkr)}</span>
      {plan.price_pkr === null ? null : <span className="text-body text-text-secondary">{per}</span>}
    </p>
  );
}

function Column({ title, price, items, note, extra, testId }: { title: string; price: ReactNode; items: string[]; note?: ReactNode; extra?: ReactNode; testId?: string }) {
  return (
    <li className="flex flex-col gap-4 border-t border-border-default pt-6" data-testid={testId}>
      <h3 className="text-h3">{title}</h3>
      {price}
      {note}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-body">
            <Check aria-hidden weight="bold" className="mt-1 size-4 shrink-0 text-text-secondary" />
            {item}
          </li>
        ))}
      </ul>
      {extra}
    </li>
  );
}

export function PlanTable({
  id,
  plans,
  free,
  notes = {},
  extra,
}: {
  id: string;
  plans: PublicPlan[];
  free?: FreeColumn;
  /** A line under a tier's price, keyed by tier (a trial, a sponsorship). */
  notes?: Record<string, string>;
  /** After the lines, keyed by tier (a CTA). */
  extra?: Record<string, ReactNode>;
}) {
  const rows = tiers(plans);
  const toggles = rows.some((t) => t.month && t.year);
  const cols = (free ? 1 : 0) + rows.length;
  return (
    <div className="plan-table flex flex-col gap-8" data-testid={`plans-${id}`}>
      {toggles ? (
        <fieldset className="period-toggle self-start">
          <legend className="sr-only">{copy.billing}</legend>
          <label>
            <input type="radio" name={`period-${id}`} value="month" defaultChecked className="period-month" />
            <span>{copy.monthly}</span>
          </label>
          <label>
            <input type="radio" name={`period-${id}`} value="year" className="period-year" />
            <span>{copy.yearly}</span>
          </label>
        </fieldset>
      ) : null}
      <ul className={cn("grid gap-x-6 gap-y-10 sm:grid-cols-2", cols >= 4 ? "lg:grid-cols-4" : cols === 3 ? "lg:grid-cols-3" : "")}>
        {free ? (
          <Column
            title={free.label}
            price={<p className="font-display text-h2">{copy.free}</p>}
            items={[...free.items]}
            note={free.note ? <p className="text-body-sm text-text-secondary">{free.note}</p> : null}
            testId={`plan-${id}-free`}
          />
        ) : null}
        {rows.map((t) => {
          const both = t.month && t.year;
          const price = both ? (
            <>
              <Price plan={t.month} per={copy.perMonth} className="when-month" />
              <Price plan={t.year} per={copy.perYear} className="when-year" />
            </>
          ) : (
            <Price plan={t.month ?? t.year} per={t.month ? copy.perMonth : copy.perYear} />
          );
          return (
            <Column
              key={t.tier}
              title={t.label}
              price={price}
              items={planLines((t.month ?? t.year)!.grants)}
              note={notes[t.tier] ? <p className="text-body-sm text-text-secondary">{notes[t.tier]}</p> : null}
              extra={extra?.[t.tier]}
              testId={`plan-${id}-${t.tier}`}
            />
          );
        })}
      </ul>
    </div>
  );
}
