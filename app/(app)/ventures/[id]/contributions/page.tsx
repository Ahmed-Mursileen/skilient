import { ArrowSquareOut, GithubLogo, ListChecks, LockSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { ContributionSheet } from "@/components/ventures/contribution-sheet";
import { Badge, Button, EmptyState, SkillChip } from "@/components/ui";
import { confirmContribution } from "@/lib/actions/ventures";
import { getContributions, getVenture, type Contribution } from "@/lib/data/ventures";
import { CONTRIBUTION_KINDS, CORRECTION_WINDOW_MS } from "@/lib/ventures/labels";

const KIND = Object.fromEntries(CONTRIBUTION_KINDS.map((k) => [k.value, k.label]));
const day = (d: Date) => d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });

/** Monday of the entry's week (PKT has no daylight saving; UTC days are close enough to group). */
function weekStart(iso: string): string {
  const d = new Date(iso);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

function Status({ c }: { c: Contribution }) {
  const verified = c.facultyConfirmed ? (
    <Badge tone="verified">Faculty-confirmed</Badge>
  ) : c.peerVerified ? (
    <Badge tone="verified">Peer-verified</Badge>
  ) : null;
  if (c.source === "github") {
    return (
      <>
        <Badge tone="neutral">
          <GithubLogo aria-hidden weight="bold" className="size-3.5" />
          {c.beforeVenture ? "From GitHub, before Skilient" : "From GitHub"}
        </Badge>
        {c.beforeVenture ? (verified ?? <Badge tone="neutral">Needs a teammate&apos;s confirmation</Badge>) : null}
      </>
    );
  }
  return verified ?? <Badge tone="neutral">Self-reported</Badge>;
}

/**
 * Contributions tab (PRD 5.14): the team's log, grouped by week. Members log work and confirm
 * each other's entries; the author can correct an entry for 24 hours. Completion locks it.
 */
export default async function VentureContributionsPage({ params }: PageProps<"/ventures/[id]/contributions">) {
  const { id } = await params;
  const v = await getVenture(id);
  if (!v || v.viewer.byLinkOnly) return null;
  const entries = await getContributions(id);
  const names = new Map(v.team.map((m) => [m.userId, m.fullName]));
  const skillNames = new Map(v.skills.map((s) => [s.id, s.name]));
  const open = v.status === "recruiting" || v.status === "in_progress";
  const canLog = v.viewer.isMember && open;
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is this request.
  const now = Date.now();

  const weeks = new Map<string, Contribution[]>();
  for (const c of entries) {
    const key = weekStart(c.createdAt);
    weeks.set(key, [...(weeks.get(key) ?? []), c]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-text-secondary">
          Peer-verified entries were confirmed by a teammate. GitHub entries come from commits in the linked repository; commits from before the venture started need a teammate&apos;s confirmation too.
        </p>
        {canLog ? (
          <ContributionSheet
            ventureId={v.id}
            skills={v.skills}
            trigger={
              <Button>
                <Plus aria-hidden weight="bold" className="size-4" />
                Log contribution
              </Button>
            }
          />
        ) : null}
      </div>
      {!open ? (
        <p className="flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-4 py-3 text-body-sm text-text-secondary">
          <LockSimple aria-hidden weight="bold" className="size-4 shrink-0" />
          This venture is {v.status === "completed" ? "complete" : "abandoned"}, so its log is locked.
        </p>
      ) : null}

      {entries.length ? (
        [...weeks.entries()].map(([week, list]) => (
          <section key={week} aria-labelledby={`week-${week}`} className="flex flex-col gap-3">
            <h2 id={`week-${week}`} className="text-label text-text-secondary uppercase">
              Week of {day(new Date(`${week}T00:00:00Z`))}
            </h2>
            <ol className="flex flex-col gap-3">
              {list.map((c) => {
                const author = names.get(c.userId) ?? (c.byMember ? "A team member" : "A former member");
                const mine = c.userId === v.viewer.userId;
                // Manual entries and pre-venture commits need a teammate; later commits are verified already.
                const confirmable = c.source === "manual" || c.beforeVenture;
                const canConfirm = open && v.viewer.isMember && !mine && confirmable && !c.confirmedByMe;
                const canCorrect = open && mine && v.viewer.isMember && c.source === "manual" && now - Date.parse(c.createdAt) < CORRECTION_WINDOW_MS;
                return (
                  <li key={c.id} className="rounded-lg border border-border-default bg-bg-surface p-4" aria-label={`${author}: ${KIND[c.kind]}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-sm">
                        <span className="font-semibold">{author}</span>
                        {mine ? <span className="text-text-secondary"> (you)</span> : null}
                        <span className="text-text-secondary">
                          {" "}
                          · {KIND[c.kind]} · {day(new Date(c.createdAt))}
                          {c.hours ? ` · ${c.hours} h` : ""}
                        </span>
                      </p>
                      <Status c={c} />
                      {c.correctedAt ? <span className="text-caption text-text-secondary">Corrected</span> : null}
                      {!c.byMember ? <span className="text-caption text-text-secondary">No longer on the team</span> : null}
                    </div>
                    <p className="mt-2 text-body whitespace-pre-line break-words">{c.description}</p>
                    {c.skillIds.length ? (
                      <ul aria-label="Skills it shows" className="mt-2 flex flex-wrap gap-2">
                        {c.skillIds.map((id) => (
                          <li key={id}>
                            <SkillChip name={skillNames.get(id) ?? id} verified={c.peerVerified} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {c.evidenceUrl ? (
                      <a
                        href={c.evidenceUrl}
                        target="_blank"
                        rel="noreferrer noopener nofollow"
                        className="mt-2 inline-flex max-w-full items-center gap-1 text-body-sm underline underline-offset-4"
                      >
                        <span className="truncate">{c.evidenceUrl.replace(/^https?:\/\//, "")}</span>
                        <ArrowSquareOut aria-hidden weight="bold" className="size-4 shrink-0" />
                        <span className="sr-only">{" (opens in a new tab)"}</span>
                      </a>
                    ) : null}
                    {canConfirm || canCorrect || (c.confirmedByMe && confirmable) ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {canConfirm ? (
                          <ConfirmAction
                            action={confirmContribution.bind(null, v.id, c.id)}
                            label="Confirm"
                            variant="secondary"
                            ariaLabel={`Confirm ${author}'s entry`}
                          />
                        ) : null}
                        {c.confirmedByMe && confirmable ? <span className="text-body-sm text-text-secondary">You confirmed this.</span> : null}
                        {canCorrect ? (
                          <ContributionSheet
                            ventureId={v.id}
                            skills={v.skills}
                            correcting={c}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Correct
                              </Button>
                            }
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      ) : (
        <EmptyState
          icon={<ListChecks aria-hidden className="size-8" />}
          title="No contributions yet"
          description={
            canLog
              ? "Log what you've done for the team. Teammates confirm entries, and completing the venture needs peer-verified work from at least 2 members."
              : "The team hasn't logged any work yet."
          }
        />
      )}
    </div>
  );
}
