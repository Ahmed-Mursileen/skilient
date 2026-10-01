/**
 * Dashboard export rows (PRD 5.23): the same aggregates the page shows, already suppressed in SQL.
 * Client-safe and pure, so the escaping and layout are unit-tested.
 */
import { toCsv } from "./csv";

type Data = Record<string, unknown>;

export function dashboardRows(area: string, d: Data): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [["area", "section", "label", "value"]];
  for (const [k, v] of Object.entries(d)) {
    if (["locked", "plan", "full", "exports", "computed_at"].includes(k)) continue;
    if (typeof v === "number" || v === null) rows.push([area, "total", k, v ?? "fewer than 5"]);
    else if (Array.isArray(v)) {
      for (const item of v as Record<string, unknown>[]) {
        const label = String(item.label ?? item.name ?? "");
        const value = item.count ?? item.demand ?? item.reviews ?? null;
        rows.push([area, k, label, value === null ? "fewer than 5" : (value as number)]);
      }
    }
  }
  return rows;
}

export function dashboardCsv(area: string, d: Data): string {
  return toCsv(dashboardRows(area, d));
}
