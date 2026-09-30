import { Buildings, GithubLogo, LinkSimple, LockSimple } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FirstVisitTip } from "@/components/learn/first-visit-tip";
import { ReportButton } from "@/components/reports/report-button";
import { VentureActions } from "@/components/ventures/venture-actions";
import { VentureStatusBadge } from "@/components/ventures/status-badge";
import { VentureTabs } from "@/components/ventures/venture-tabs";
import { getVenture } from "@/lib/data/ventures";
import { STAGE_OPTIONS, TYPE_LABELS, VISIBILITY_OPTIONS } from "@/lib/ventures/labels";

export async function generateMetadata({ params }: LayoutProps<"/ventures/[id]">): Promise<Metadata> {
  const { id } = await params;
  const v = await getVenture(id);
  return { title: v?.title ?? "Venture", robots: { index: false, follow: false } };
}

/** /ventures/[id] (screen spec 3.4, 3.13): header, the viewer's actions, and tabs. */
export default async function VentureLayout({ params, children }: LayoutProps<"/ventures/[id]">) {
  const { id } = await params;
  const v = await getVenture(id);
  if (!v) notFound();
  const owner = v.team.find((m) => m.isOwner);
  const stage = STAGE_OPTIONS.find((s) => s.value === v.stage)?.label;
  const visibility = VISIBILITY_OPTIONS.find((o) => o.value === v.visibility)!;
  const openSlots = v.roles.reduce((n, r) => n + Math.max(0, r.slots - r.filled), 0);

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <FirstVisitTip id="venture" />
      <div>
        <Link href={(v.type === "startup" ? "/ventures?type=startup" : "/ventures") as Route} className="text-body-sm text-text-secondary underline underline-offset-4">
          {TYPE_LABELS[v.type].many}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
          <span className="font-semibold uppercase">{TYPE_LABELS[v.type].one}</span>
          {stage ? <span>· {stage}</span> : null}
          <VentureStatusBadge status={v.status} />
          <span className="inline-flex items-center gap-1">
            {v.visibility === "public" ? null : v.visibility === "unlisted" ? (
              <LinkSimple aria-hidden weight="bold" className="size-3.5" />
            ) : (
              <LockSimple aria-hidden weight="bold" className="size-3.5" />
            )}
            {visibility.label}
          </span>
        </div>
        <h1 className="mt-2 font-display text-h1 break-words">{v.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
          {owner ? (
            <span>
              Started by{" "}
              {owner.username ? (
                <Link href={`/profile/${owner.username}` as Route} className="font-semibold text-text-primary underline underline-offset-4">
                  {owner.fullName}
                </Link>
              ) : (
                owner.fullName
              )}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Buildings aria-hidden weight="bold" className="size-4" />
            {v.counts.members} of {v.teamSize} members
          </span>
          {v.repoFullName ? (
            <a
              href={`https://github.com/${v.repoFullName}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              <GithubLogo aria-hidden weight="bold" className="size-4" />
              <span className="font-mono">{v.repoFullName}</span>
              <span className="sr-only">{" (opens GitHub)"}</span>
            </a>
          ) : null}
        </p>
      </div>

      <VentureActions
        ventureId={v.id}
        title={v.title}
        status={v.status}
        visibility={v.visibility}
        viewer={v.viewer}
        roles={v.roles.filter((r) => r.filled < r.slots).map((r) => ({ id: r.id, title: r.title }))}
        questions={v.questions}
        teamFull={v.counts.members >= 6}
        openSlots={openSlots}
      />
      {!v.viewer.isOwner ? <ReportButton targetType="venture" targetId={v.id} className="self-start" /> : null}

      {v.viewer.byLinkOnly ? (
        <p className="rounded-md border border-border-default bg-bg-surface px-4 py-3 text-body-sm text-text-secondary">
          You opened this venture by its link. It takes new members by invite only.
        </p>
      ) : (
        <>
          <VentureTabs id={v.id} isOwner={v.viewer.isOwner} isMember={v.viewer.isMember} />
          <div>{children}</div>
        </>
      )}
    </main>
  );
}
