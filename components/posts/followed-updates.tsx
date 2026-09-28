import type { Route } from "next";
import Link from "next/link";
import type { FollowedUpdate } from "@/lib/data/posts";

/** Venture updates for followers: unscored, after the ranked posts (decisions.md 2026-09-28). */
export function FollowedUpdates({ updates }: { updates: FollowedUpdate[] }) {
  if (!updates.length) return null;
  return (
    <section aria-labelledby="followed-updates" className="flex flex-col gap-3" data-testid="followed-updates">
      <h2 id="followed-updates" className="text-h4">
        From ventures you follow
      </h2>
      <ul className="flex flex-col gap-3">
        {updates.map((u) => (
          <li key={u.id} className="rounded-lg border border-border-default bg-bg-surface p-4">
            <p className="text-body-sm">
              <Link href={`/ventures/${u.ventureId}/updates` as Route} className="font-semibold underline-offset-4 hover:underline">
                {u.ventureTitle}
              </Link>
              <span className="text-text-secondary"> · update by {u.authorName}</span>
            </p>
            <p className="mt-2 text-body break-words whitespace-pre-line">{u.body}</p>
            {u.images.length ? (
              <div className={u.images.length > 1 ? "mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-md" : "mt-3 overflow-hidden rounded-md"}>
                {u.images.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element -- user image from our public bucket, already sized
                  <img key={img.url} src={img.url} alt="" width={img.width} height={img.height} loading="lazy" className="size-full max-h-[420px] bg-bg-subtle object-cover" />
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
