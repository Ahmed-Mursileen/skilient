import { EmptyState } from "@/components/ui";
import { getProfile } from "@/lib/data/profiles";
import { LOOKING_FOR, VISIBILITY } from "@/lib/profile/options";

/** Overview tab: about, studies and what they're open to. */
export default async function ProfileOverviewPage({ params }: PageProps<"/profile/[username]">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  const p = lookup.profile;
  const openTo = LOOKING_FOR.filter((o) => p.lookingFor.includes(o.value)).map((o) => o.label);
  const details = [
    { label: "Programme", value: p.programme },
    { label: "Campus", value: p.campus },
  ].filter((d) => d.value);

  if (!p.bio && !details.length && !openTo.length) {
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
