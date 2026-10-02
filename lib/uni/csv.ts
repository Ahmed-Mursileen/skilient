/**
 * CSV for dashboard exports (PRD 5.23). Every cell is quoted; a cell that starts with = + - or @
 * gets a leading apostrophe so a spreadsheet never runs it as a formula (decisions.md 2026-10-04).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
