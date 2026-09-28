import { ArrowSquareOut, LockSimple, Package } from "@phosphor-icons/react/dist/ssr";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { DeliverableForm } from "@/components/ventures/deliverable-form";
import { EmptyState } from "@/components/ui";
import { removeVentureDeliverable } from "@/lib/actions/ventures";
import { getDeliverables, getVenture } from "@/lib/data/ventures";

/**
 * Deliverables tab (PRD 5.28): links to what the team made. Only members read them (RLS);
 * everyone else sees how many there are. Completing a venture needs at least one.
 */
export default async function VentureDeliverablesPage({ params }: PageProps<"/ventures/[id]/deliverables">) {
  const { id } = await params;
  const v = await getVenture(id);
  if (!v || v.viewer.byLinkOnly) return null;

  if (!v.viewer.isMember) {
    return (
      <EmptyState
        icon={<LockSimple aria-hidden className="size-8" />}
        title={v.counts.deliverables ? `${v.counts.deliverables} ${v.counts.deliverables === 1 ? "deliverable" : "deliverables"}` : "No deliverables yet"}
        description="Only the team sees its deliverables."
      />
    );
  }

  const items = await getDeliverables(id);
  const names = new Map(v.team.map((m) => [m.userId, m.fullName]));
  const canAdd = v.status === "recruiting" || v.status === "in_progress";

  return (
    <div className="flex flex-col gap-6">
      {items.length ? (
        <ul className="flex flex-col divide-y divide-border-default rounded-lg border border-border-default">
          {items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-body font-semibold underline underline-offset-4">
                  {d.label}
                  <ArrowSquareOut aria-hidden weight="bold" className="size-4" />
                  <span className="sr-only">{" (opens in a new tab)"}</span>
                </a>
                <p className="truncate text-body-sm text-text-secondary">
                  {d.addedBy ? `Added by ${names.get(d.addedBy) ?? "a former member"}` : "Added by a former member"}
                </p>
              </div>
              {canAdd && (v.viewer.isOwner || d.addedBy === v.viewer.userId) ? (
                <ConfirmAction
                  action={removeVentureDeliverable.bind(null, v.id, d.id)}
                  label="Remove"
                  danger
                  confirm={{ title: `Remove ${d.label}?`, description: "The link is removed for the whole team." }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Package aria-hidden className="size-8" />}
          title="No deliverables yet"
          description="Add links to what the team made. A venture needs at least one to be marked complete."
        />
      )}
      {canAdd ? <DeliverableForm ventureId={v.id} /> : null}
    </div>
  );
}
