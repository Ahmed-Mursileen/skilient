import { EnvelopeSimple, PaperPlaneTilt, Tray } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationCard } from "@/components/ventures/application-card";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { Button, EmptyState } from "@/components/ui";
import { respondInvite } from "@/lib/actions/ventures";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRequests, type ApplicationItem } from "@/lib/data/ventures";
import { cn } from "@/lib/cn";
import { TYPE_LABELS } from "@/lib/ventures/labels";

export const metadata: Metadata = { title: "Requests" };

const TABS = [
  { key: "received", label: "Received" },
  { key: "sent", label: "Sent" },
  { key: "invites", label: "Invites" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const pendingFirst = (a: ApplicationItem, b: ApplicationItem) => Number(b.status === "pending") - Number(a.status === "pending");

/** /requests (screen spec): applications to my ventures, my applications, and invites to me. */
export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "received";
  const { received, sent, invites } = await getRequests(user.id);
  const counts: Record<Tab, number> = {
    received: received.filter((r) => r.status === "pending").length,
    sent: sent.filter((r) => r.status === "pending").length,
    invites: invites.length,
  };

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Requests</h1>
        <p className="mt-1 text-body text-text-secondary">Applications to your ventures, the ones you sent, and invites to join a team.</p>
      </div>

      <nav aria-label="Requests" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={(t.key === "received" ? "/requests" : `/requests?tab=${t.key}`) as Route}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-2 border-b-2 px-3 text-body font-semibold whitespace-nowrap",
                  tab === t.key ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
                {counts[t.key] ? (
                  <span className="rounded-full bg-bg-subtle px-2 text-caption text-text-primary">
                    {counts[t.key]}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "invites" ? (
        invites.length ? (
          <ul className="flex flex-col gap-3">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-5">
                <p className="text-body">
                  You&apos;re invited to join{" "}
                  {i.venture ? (
                    <Link href={`/ventures/${i.venture.id}` as Route} className="font-semibold underline-offset-4 hover:underline">
                      {i.venture.title}
                    </Link>
                  ) : (
                    "a venture"
                  )}
                  {i.venture ? <span className="text-text-secondary"> · {TYPE_LABELS[i.venture.type].one}</span> : null}
                </p>
                <div className="flex gap-2">
                  <ConfirmAction action={respondInvite.bind(null, i.id, true)} label="Accept" variant="primary" />
                  <ConfirmAction action={respondInvite.bind(null, i.id, false)} label="Decline" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<EnvelopeSimple aria-hidden className="size-8" />} title="No invites" description="When a venture owner invites you to their team, it shows here." />
        )
      ) : null}

      {tab === "received" ? (
        received.length ? (
          <ul className="flex flex-col gap-4">
            {[...received].sort(pendingFirst).map((a) => (
              <li key={a.id}>
                <ApplicationCard item={a} side="received" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Tray aria-hidden className="size-8" />}
            title="No applications yet"
            description="When students apply to a venture you started, you'll accept or decline them here."
            action={
              <Button asChild variant="secondary">
                <Link href="/ventures/new">Start a venture</Link>
              </Button>
            }
          />
        )
      ) : null}

      {tab === "sent" ? (
        sent.length ? (
          <ul className="flex flex-col gap-4">
            {[...sent].sort(pendingFirst).map((a) => (
              <li key={a.id}>
                <ApplicationCard item={a} side="sent" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<PaperPlaneTilt aria-hidden className="size-8" />}
            title="You haven't applied anywhere"
            description="Find a project or startup that needs your skills and apply to a role."
            action={
              <Button asChild variant="secondary">
                <Link href="/ventures">Browse ventures</Link>
              </Button>
            }
          />
        )
      ) : null}
    </main>
  );
}
