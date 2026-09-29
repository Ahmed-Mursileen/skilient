import type { Route } from "next";
import Link from "next/link";
import { ProfileCredentials } from "@/components/credentials/profile-credentials";
import { EndorsementList } from "@/components/endorsements/endorsement-list";
import { SkillList } from "@/components/skills/skill-list";
import { EmptyState } from "@/components/ui";
import { getProfileCredentials } from "@/lib/data/credentials";
import { getEndorsements } from "@/lib/data/endorsements";
import { getProfile } from "@/lib/data/profiles";
import { getProfileSkills } from "@/lib/data/skills";
import { LOOKING_FOR, VISIBILITY } from "@/lib/profile/options";

/** Top skills on the overview; the Skills tab lists them all. */
const TOP_SKILLS = 8;

/** Overview tab: about, top skills, endorsements, credentials, studies and what they're open to. */
export default async function ProfileOverviewPage({ params }: PageProps<"/profile/[username]">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  const p = lookup.profile;
  const [skills, endorsements, credentials] = await Promise.all([
    getProfileSkills(p.userId, p.isOwner),
    getEndorsements(p.userId),
    getProfileCredentials(p.userId),
  ]);
  const openTo = LOOKING_FOR.filter((o) => p.lookingFor.includes(o.value)).map((o) => o.label);
  const details = [
    { label: "Programme", value: p.programme },
    { label: "Campus", value: p.campus },
  ].filter((d) => d.value);

  if (!p.bio && !details.length && !openTo.length && !skills.length && !endorsements.length && !credentials.length) {
    return (
      <EmptyState
        title={p.isOwner ? "Tell people about yourself" : "Nothing here yet"}
        description={p.isOwner ? "Add a one-line intro and your programme from Edit profile." : `${p.fullName} hasn't added an intro yet.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {p.bio ? (
        <section aria-labelledby="about">
          <h2 id="about" className="text-h4">
            About
          </h2>
          <p className="mt-2 text-body whitespace-pre-line text-text-primary">{p.bio}</p>
        </section>
      ) : null}
      {skills.length ? (
        <section aria-labelledby="top-skills">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="top-skills" className="text-h4">
              Top skills
            </h2>
            {skills.length > TOP_SKILLS ? (
              <Link
                href={`/profile/${p.username}/skills` as Route}
                className="text-body-sm font-semibold text-text-primary underline underline-offset-4"
              >
                All {skills.length} skills
              </Link>
            ) : null}
          </div>
          <SkillList
            skills={skills.slice(0, TOP_SKILLS)}
            isOwner={p.isOwner}
            ownerName={p.fullName.split(/\s+/)[0] ?? p.fullName}
            grouped={false}
          />
        </section>
      ) : null}
      {endorsements.length ? (
        <section aria-labelledby="endorsements" id="endorsements-section">
          <h2 id="endorsements" className="mb-3 text-h4">
            Endorsements
          </h2>
          <EndorsementList groups={endorsements} isOwner={p.isOwner} username={p.username} />
        </section>
      ) : p.isOwner && skills.length ? (
        <section aria-labelledby="endorsements" id="endorsements-section">
          <h2 id="endorsements" className="text-h4">
            Endorsements
          </h2>
          <p className="mt-2 text-body-sm text-text-secondary">
            None yet. Teammates endorse you from a venture&apos;s Team tab once it&apos;s in progress; two different teammates on a
            skill make it peer-verified.
          </p>
        </section>
      ) : null}
      {credentials.length || p.isOwner ? (
        <section aria-labelledby="credentials">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="credentials" className="text-h4">
              Credentials
            </h2>
            {p.isOwner ? (
              <Link href="/me/credentials" className="text-body-sm font-semibold text-text-primary underline underline-offset-4">
                {credentials.length ? "Manage" : "Add a credential"}
              </Link>
            ) : null}
          </div>
          {credentials.length ? (
            <ProfileCredentials items={credentials} />
          ) : (
            <p className="text-body-sm text-text-secondary">
              None approved yet. Certificates you add are checked by a Skilient reviewer before they show here.
            </p>
          )}
        </section>
      ) : null}
      {details.length ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-label text-text-secondary uppercase">{d.label}</dt>
              <dd className="mt-1 text-body">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {openTo.length ? (
        <section aria-labelledby="open-to">
          <h2 id="open-to" className="text-h4">
            Open to
          </h2>
          <p className="mt-2 text-body text-text-secondary">{openTo.join(", ")}</p>
        </section>
      ) : null}
      {p.isOwner ? (
        <p className="text-body-sm text-text-muted">
          Visible to: {VISIBILITY.find((v) => v.value === p.visibility)?.label.toLowerCase()}.
        </p>
      ) : null}
    </div>
  );
}
