import { Megaphone } from "@phosphor-icons/react/dist/ssr";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { UpdateComposer } from "@/components/ventures/update-composer";
import { EmptyState } from "@/components/ui";
import { deleteVentureUpdate } from "@/lib/actions/ventures";
import { getVenture, getVentureUpdates } from "@/lib/data/ventures";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });

/** Updates tab (PRD 5.28): the team's progress notes, newest first. Members post. */
export default async function VentureUpdatesPage({ params }: PageProps<"/ventures/[id]/updates">) {
  const { id } = await params;
  const v = await getVenture(id);
  if (!v || v.viewer.byLinkOnly) return null;
  const updates = await getVentureUpdates(id);
  const names = new Map(v.team.map((m) => [m.userId, m.fullName]));
  const canPost = v.viewer.isMember && v.status !== "abandoned";

  return (
    <div className="flex flex-col gap-6">
      {canPost ? <UpdateComposer ventureId={v.id} /> : null}
      {updates.length ? (
        <ol className="flex flex-col gap-4">
          {updates.map((u) => (
            <li key={u.id} className="rounded-lg border border-border-default p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-body-sm">
                  <span className="font-semibold">{names.get(u.authorId) ?? "A former member"}</span>
                  <span className="text-text-secondary"> · {when(u.createdAt)}</span>
                </p>
                {u.authorId === v.viewer.userId || v.viewer.isOwner ? (
                  <ConfirmAction
                    action={deleteVentureUpdate.bind(null, v.id, u.id)}
                    label="Delete"
                    danger
                    confirm={{ title: "Delete this update?", description: "It's removed for everyone. This can't be undone." }}
                  />
                ) : null}
              </div>
              <p className="mt-2 text-body whitespace-pre-line break-words">{u.body}</p>
              {u.images.length ? (
                <div className={u.images.length > 1 ? "mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-md" : "mt-3 overflow-hidden rounded-md"}>
                  {u.images.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element -- user image from our public bucket, already sized
                    <img key={img.url} src={img.url} alt="" width={img.width} height={img.height} loading="lazy" className="size-full max-h-[480px] bg-bg-subtle object-cover" />
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={<Megaphone aria-hidden className="size-8" />}
          title="No updates yet"
          description={v.viewer.isMember ? "Share what the team is working on. Followers see it here." : "The team hasn't posted an update yet."}
        />
      )}
    </div>
  );
}
