/**
 * Field-level before/after for audit rows and config versions (PRD 5.26). Pure and client-safe.
 * Objects are compared key by key (one level, nested values as JSON); anything else is one row.
 */
export interface DiffRow {
  key: string;
  before: string | null;
  after: string | null;
  changed: boolean;
}

function show(v: unknown): string | null {
  if (v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function diffJson(before: unknown, after: unknown): DiffRow[] {
  if (isObject(before) || isObject(after)) {
    const b = isObject(before) ? before : {};
    const a = isObject(after) ? after : {};
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
    return keys.map((key) => {
      const bv = show(b[key]);
      const av = show(a[key]);
      return { key, before: bv, after: av, changed: bv !== av };
    });
  }
  if (before == null && after == null) return [];
  const bv = show(before ?? undefined);
  const av = show(after ?? undefined);
  return [{ key: "value", before: bv, after: av, changed: bv !== av }];
}

/** Karachi day boundaries for a yyyy-mm-dd filter: [from, to). */
export function pktDayRange(from?: string, to?: string): { from?: string; to?: string } {
  const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00+05:00`)) ? d : undefined);
  const f = ok(from);
  const t = ok(to);
  let end: string | undefined;
  if (t) {
    const next = new Date(Date.parse(`${t}T00:00:00+05:00`) + 86_400_000);
    end = next.toISOString();
  }
  return { from: f ? new Date(Date.parse(`${f}T00:00:00+05:00`)).toISOString() : undefined, to: end };
}
