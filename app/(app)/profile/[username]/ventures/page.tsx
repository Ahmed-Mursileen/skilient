import { Rocket } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { VentureStatusBadge } from "@/components/ventures/status-badge";
import { Button, EmptyState } from "@/components/ui";
import { getProfile } from "@/lib/data/profiles";
import { getProfileVentures } from "@/lib/data/ventures";
import { TEAM_ROLE_LABELS, TYPE_LABELS } from "@/lib/ventures/labels";

/** Ventures tab (PRD 5.28): the ventures this student is on, with their role. Only ones the viewer may see. */
export default async function ProfileVenturesPage({ params }: PageProps<"/profile/[username]/ventures">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  const p = lookup.profile;
  const ventures = await getProfileVentures(p.userId);

  if (!ventures.length) {
    return (
      <EmptyState
        icon={<Rocket aria-hidden className="size-8" />}
        title="No ventures yet"
        description={
          p.isOwner
            ? "Projects you build with others show here with your role. Finished ventures count most toward your rank."
            : `Ventures ${p.fullName} builds with others will show here.`
        }
        action={
          p.isOwner ? (
            <Button asChild variant="secondary">
              <Link href="/ventures">Find a venture</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border-default rounded-lg border border-border-default">
      {ventures.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <Link href={`/ventures/${v.id}` as Route} className="text-body font-semibold underline-offset-4 hover:underline">
              {v.title}
            </Link>
            <p className="text-body-sm text-text-secondary">
              {TYPE_LABELS[v.type].one} · {v.isOwner ? "Owner" : TEAM_ROLE_LABELS[v.teamRole]}
            </p>
          </div>
          <VentureStatusBadge status={v.status} />
        </li>
      ))}
    </ul>
  );
}
