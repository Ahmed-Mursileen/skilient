import { countLabel } from "@/lib/uni/constants";

/**
 * One series of counts as horizontal bars (magnitude, one hue). Each row carries its label and value
 * in text, so the list doubles as the table view; hidden groups read "fewer than 5" with no bar.
 */
export function BarList({ items, label, testId }: { items: { label: string; count: number | null }[]; label: string; testId?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count ?? 0));
  if (items.length === 0) return <p className="text-body text-text-secondary">No data yet.</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-2" data-testid={testId}>
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-3 text-body-sm" title={`${i.label}: ${countLabel(i.count)}`}>
          <span className="truncate">{i.label}</span>
          <span aria-hidden className="h-3 rounded-r-[4px] bg-bg-subtle">
            {i.count !== null ? <span className="block h-3 rounded-r-[4px] bg-primary" style={{ width: `${(100 * i.count) / max}%` }} /> : null}
          </span>
          <span className="text-text-secondary tabular-nums">{countLabel(i.count)}</span>
        </li>
      ))}
    </ul>
  );
}
