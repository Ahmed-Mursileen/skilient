import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { SkillChip } from "@/components/ui";
import { getVenture } from "@/lib/data/ventures";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h4">{title}</h2>
      {children}
    </section>
  );
}

/** About tab (PRD 5.28): description, skills, open roles, startup details, applicant questions. */
export default async function VentureAboutPage({ params }: PageProps<"/ventures/[id]">) {
  const { id } = await params;
  const v = await getVenture(id);
  if (!v || v.viewer.byLinkOnly) return null;
  const open = v.status === "recruiting" || v.status === "in_progress";

  return (
    <div className="flex flex-col gap-8">
      <p className="text-body whitespace-pre-line break-words">{v.description}</p>

      {v.type === "startup" && (v.pitchUrl || v.affiliation) ? (
        <dl className="grid gap-3 rounded-lg border border-border-default p-4 sm:grid-cols-2">
          {v.pitchUrl ? (
            <div>
              <dt className="text-label text-text-secondary uppercase">Pitch deck</dt>
              <dd>
                <a href={v.pitchUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-body underline underline-offset-4">
                  Open pitch deck
                  <ArrowSquareOut aria-hidden weight="bold" className="size-4" />
                  <span className="sr-only">{" (opens in a new tab)"}</span>
                </a>
              </dd>
            </div>
          ) : null}
          {v.affiliation ? (
            <div>
              <dt className="text-label text-text-secondary uppercase">Programme</dt>
              <dd className="text-body">{v.affiliation}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {v.skills.length ? (
        <Section title="Skills it needs">
          <ul className="flex flex-wrap gap-2">
            {v.skills.map((s) => (
              <li key={s.id}>
                <SkillChip name={s.name} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Roles">
        {v.roles.length ? (
          <ul className="flex flex-col gap-3">
            {v.roles.map((r) => {
              const left = Math.max(0, r.slots - r.filled);
              return (
                <li key={r.id} className="rounded-lg border border-border-default p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-body font-semibold">{r.title}</h3>
                    <span className="text-body-sm text-text-secondary">
                      {left && open ? `${left} of ${r.slots} ${r.slots === 1 ? "place" : "places"} open` : "Filled"}
                    </span>
                  </div>
                  {r.skills.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Skills for ${r.title}`}>
                      {r.skills.map((s) => (
                        <li key={s.id}>
                          <SkillChip name={s.name} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-body text-text-secondary">No specific roles. Anyone with the skills above can apply.</p>
        )}
      </Section>

      {v.questions.length && open ? (
        <Section title="Questions for applicants">
          <ol className="list-decimal pl-5 text-body">
            {v.questions.map((q) => (
              <li key={q.position}>{q.body}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      <p className="text-body-sm text-text-secondary">
        Started {new Date(v.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
        {v.completedAt ? ` · completed ${new Date(v.completedAt).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}` : ""}
        {v.visibility === "public" ? ` · ${v.counts.followers} ${v.counts.followers === 1 ? "follower" : "followers"}` : ""}
      </p>
    </div>
  );
}
