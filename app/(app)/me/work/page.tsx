import { Certificate, ChatCentered, ClipboardText, Handshake, Rocket, SealCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EndorsementList } from "@/components/endorsements/endorsement-list";
import { ProfileCredentials } from "@/components/credentials/profile-credentials";
import { VentureStatusBadge } from "@/components/ventures/status-badge";
import { Badge, Button, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cn } from "@/lib/cn";
import { getProfileCredentials } from "@/lib/data/credentials";
import { getEndorsements } from "@/lib/data/endorsements";
import { getEndorsementsGiven, getMyContributions } from "@/lib/data/me";
import { getProfileVentures } from "@/lib/data/ventures";
import { TYPE_LABELS } from "@/lib/ventures/labels";

export const metadata: Metadata = { title: "My work" };

const TABS = [
  { key: "ventures", label: "Ventures" },
  { key: "contributions", label: "Contributions" },
  { key: "reviews", label: "Reviews" },
  { key: "endorsements", label: "Endorsements" },
  { key: "credentials", label: "Credentials" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** /me/work (PRD 5.25, screen spec "My work"): ventures, contributions, reviews, endorsements given and received, credentials. */
export default async function MyWorkPage({ searchParams }: PageProps<"/me/work">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/me/work");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "ventures";

  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">My work</h1>
      <nav aria-label="My work sections" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-2 px-1 pb-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={`/me/work?tab=${t.key}` as Route}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-body-sm font-semibold whitespace-nowrap",
                  t.key === tab ? "border-primary bg-primary-subtle text-text-primary" : "border-border-default text-text-secondary hover:border-border-strong",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "ventures" ? <Ventures userId={user.id} /> : null}
      {tab === "contributions" ? <Contributions userId={user.id} /> : null}
      {tab === "reviews" ? <Reviews /> : null}
      {tab === "endorsements" ? <Endorsements userId={user.id} username={user.username ?? ""} /> : null}
      {tab === "credentials" ? <Credentials userId={user.id} /> : null}
    </main>
  );
}

async function Ventures({ userId }: { userId: string }) {
  const ventures = await getProfileVentures(userId);
  if (!ventures.length) {
    return (
      <EmptyState
        icon={<Rocket aria-hidden className="size-8" />}
        title="No ventures yet"
        description="Ventures are the projects you build with a team. Finished ones count most toward your rank."
        action={
          <Button asChild>
            <Link href="/ventures">Find or start a venture</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {ventures.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border-default bg-bg-surface p-4">
          <Link href={`/ventures/${v.id}` as Route} className="min-w-0 flex-1 text-h4 break-words underline-offset-4 hover:underline">
            {v.title}
          </Link>
          <VentureStatusBadge status={v.status} />
          <span className="text-caption text-text-secondary">
            {TYPE_LABELS[v.type].one} · {v.isOwner ? "Owner" : v.teamRole}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function Contributions({ userId }: { userId: string }) {
  const rows = await getMyContributions(userId);
  if (!rows.length) {
    return (
      <EmptyState
        icon={<ClipboardText aria-hidden className="size-8" />}
        title="No contributions logged"
        description="Write what you did on a venture; a teammate's confirmation turns it into verified work."
        action={
          <Button asChild variant="secondary">
            <Link href="/ventures">Open a venture</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((c) => (
        <li key={c.id} className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/ventures/${c.ventureId}` as Route} className="text-body font-semibold underline-offset-4 hover:underline">
              {c.ventureTitle}
            </Link>
            {c.fromGithub ? (
              <Badge tone="verified">From GitHub</Badge>
            ) : c.peerVerified ? (
              <Badge tone="verified">
                <SealCheck aria-hidden weight="fill" className="size-3.5" /> Confirmed by a teammate
              </Badge>
            ) : (
              <Badge tone="neutral">Waiting for a teammate to confirm</Badge>
            )}
          </div>
          <p className="text-body-sm whitespace-pre-line">{c.description}</p>
          <p className="text-caption text-text-secondary">{c.dateLabel}</p>
        </li>
      ))}
    </ul>
  );
}

function Reviews() {
  return (
    <EmptyState
      icon={<ChatCentered aria-hidden className="size-8" />}
      title="No reviews yet"
      description="When a teacher reviews a venture you belong to, their review appears here and on your CV. You can invite a teacher from a venture's page."
      action={
        <Button asChild variant="secondary">
          <Link href="/ventures">Go to your ventures</Link>
        </Button>
      }
    />
  );
}

async function Endorsements({ userId, username }: { userId: string; username: string }) {
  const [received, given] = await Promise.all([getEndorsements(userId), getEndorsementsGiven(userId)]);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="rec-h" className="flex flex-col gap-3">
        <h2 id="rec-h" className="text-h3">
          Received
        </h2>
        {received.length ? (
          <EndorsementList groups={received} isOwner username={username} />
        ) : (
          <EmptyState
            icon={<Handshake aria-hidden className="size-8" />}
            title="No endorsements yet"
            description="Teammates can vouch for your skills once a venture is under way. Two different teammates on a skill make it peer-verified."
            action={
              <Button asChild variant="secondary">
                <Link href="/ventures">Go to your ventures</Link>
              </Button>
            }
          />
        )}
      </section>
      <section aria-labelledby="giv-h" className="flex flex-col gap-3">
        <h2 id="giv-h" className="text-h3">
          Given
        </h2>
        {given.length ? (
          <ul className="divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface">
            {given.map((g) => (
              <li key={g.id} className="px-4 py-3 text-body-sm">
                You endorsed{" "}
                {g.endorseeUsername ? (
                  <Link href={`/profile/${g.endorseeUsername}` as Route} className="font-semibold underline underline-offset-4">
                    {g.endorseeName}
                  </Link>
                ) : (
                  <strong>{g.endorseeName}</strong>
                )}{" "}
                for {g.skillName}
                {g.ventureTitle ? ` on ${g.ventureTitle}` : ""}
                <span className="text-text-secondary"> · {g.dateLabel}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-text-secondary">You haven&apos;t endorsed anyone yet. The Team tab of a venture has the button.</p>
        )}
      </section>
    </div>
  );
}

async function Credentials({ userId }: { userId: string }) {
  const items = await getProfileCredentials(userId);
  return (
    <div className="flex flex-col gap-4">
      {items.length ? (
        <ProfileCredentials items={items} />
      ) : (
        <EmptyState
          icon={<Certificate aria-hidden className="size-8" />}
          title="No approved credentials yet"
          description="Certificates you add are checked by a reviewer before they show on your profile and count toward your score."
        />
      )}
      <Button asChild variant="secondary" className="self-start">
        <Link href="/me/credentials">Add or manage credentials</Link>
      </Button>
    </div>
  );
}
