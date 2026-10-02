import { cn } from "@/lib/cn";
import { diffJson } from "@/lib/ops/diff";

/** Before/after table for one audit row or config version; changed fields are marked, not only coloured. */
export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const rows = diffJson(before, after);
  if (!rows.length) return <p className="text-caption text-text-secondary">No before or after recorded.</p>;
  return (
    <table className="w-full text-left font-mono text-caption" data-testid="audit-diff">
      <thead className="text-text-secondary">
        <tr>
          <th scope="col" className="py-1 pr-3 font-semibold">Field</th>
          <th scope="col" className="py-1 pr-3 font-semibold">Before</th>
          <th scope="col" className="py-1 font-semibold">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={cn("align-top", r.changed && "bg-bg-subtle")}>
            <th scope="row" className="py-1 pr-3 font-semibold">
              {r.key}
              {r.changed ? <span className="ml-1 font-sans font-normal text-text-secondary">(changed)</span> : null}
            </th>
            <td className="max-w-[320px] py-1 pr-3 break-all">{r.before ?? "—"}</td>
            <td className="max-w-[320px] py-1 break-all">{r.after ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
