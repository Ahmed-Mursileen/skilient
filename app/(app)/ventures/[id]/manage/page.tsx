import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { DetailsForm, InviteForm, QuestionsEditor, RepoForm, RolesEditor } from "@/components/ventures/manage-forms";
import { revokeInvite, transitionVenture } from "@/lib/actions/ventures";
import { getOwnerInvites, getOwnerRepos, getVenture } from "@/lib/data/ventures";
import { listTaxonomy } from "@/lib/data/skills";
import { MAX_MEMBERS } from "@/lib/ventures/labels";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-border-default pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 id={id} className="text-h3">
          {title}
        </h2>
        {description ? <p className="mt-1 text-body-sm text-text-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Manage tab (owner only): details, roles, questions, invites, repository, status. */
export default async function VentureManagePage({ params }: PageProps<"/ventures/[id]/manage">) {
  const { id } = await params;
  const v = await getVenture(id);
  if (!v || !v.viewer.isOwner) notFound();

  if (v.status === "completed" || v.status === "abandoned") {
    return (
      <p className="rounded-md border border-border-default bg-bg-surface px-4 py-3 text-body text-text-secondary">
        {v.status === "completed"
          ? "This venture is complete, so its details and team are locked. Updates stay open."
          : "This venture was abandoned. Its page stays up for the team's record."}
      </p>
    );
  }

  const [skills, invites, repos] = await Promise.all([listTaxonomy(), getOwnerInvites(id), getOwnerRepos(v.viewer.userId)]);
  const options = skills.map((s) => ({ id: s.id, name: s.name }));
  const canComplete = v.counts.members >= 2 && v.counts.deliverables >= 1;
  const teamFull = v.counts.members >= MAX_MEMBERS;

  return (
    <div className="flex flex-col gap-10">
      <Section id="status-heading" title="Status" description="Recruiting, then in progress, then complete. Completed ventures count most on members' profiles.">
        <div className="flex flex-wrap items-center gap-3">
          {v.status === "recruiting" ? (
            <ConfirmAction
              action={transitionVenture.bind(null, v.id, "in_progress")}
              label="Start building"
              variant="primary"
              size="md"
              confirm={{ title: "Mark this venture in progress?", description: "It stays open to applications while any role has places." }}
            />
          ) : (
            <ConfirmAction
              action={transitionVenture.bind(null, v.id, "completed")}
              label="Mark complete"
              variant="primary"
              size="md"
              confirm={{
                title: "Mark this venture complete?",
                description: "The team and details lock, and applications close. This can't be undone.",
              }}
            />
          )}
          <ConfirmAction
            action={transitionVenture.bind(null, v.id, "abandoned")}
            label="Abandon venture"
            size="md"
            danger
            confirm={{ title: "Abandon this venture?", description: "Applications and invites close. The page stays up as a record. This can't be undone." }}
            confirmLabel="Abandon"
          />
        </div>
        {v.status === "in_progress" && !canComplete ? (
          <p className="text-body-sm text-text-secondary">
            To complete it you need at least 2 members and at least 1{" "}
            <Link href={`/ventures/${v.id}/deliverables` as Route} className="underline underline-offset-4">
              deliverable
            </Link>
            . You have {v.counts.members} {v.counts.members === 1 ? "member" : "members"} and {v.counts.deliverables}{" "}
            {v.counts.deliverables === 1 ? "deliverable" : "deliverables"}.
          </p>
        ) : null}
      </Section>

      <Section id="invite-heading" title="Invite students" description={teamFull ? "The team is full." : "They get an invite in Requests and join when they accept."}>
        {teamFull ? null : <InviteForm ventureId={v.id} />}
        {invites.length ? (
          <ul className="flex flex-col divide-y divide-border-default rounded-lg border border-border-default" aria-label="Pending invites">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-body">
                  <span className="font-semibold">{i.name}</span>
                  {i.username ? <span className="text-text-secondary"> @{i.username}</span> : null}
                  <span className="text-body-sm text-text-secondary"> · invited</span>
                </p>
                <ConfirmAction action={revokeInvite.bind(null, i.id)} label="Cancel invite" />
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section id="roles-heading" title="Roles" description="Students apply to a role. A role closes when its places are filled.">
        <RolesEditor ventureId={v.id} roles={v.roles} skills={options} />
      </Section>

      <Section id="questions-heading" title="Questions for applicants" description="Up to 3. Changes apply to new applications.">
        <QuestionsEditor ventureId={v.id} questions={v.questions.map((q) => q.body)} />
      </Section>

      <Section id="repo-heading" title="Repository" description="Link a repository you share with Skilient so the team's work can be traced to it.">
        {repos.length ? (
          <RepoForm ventureId={v.id} repos={repos} current={v.repoFullName} />
        ) : (
          <p className="text-body text-text-secondary">
            No shared repositories yet.{" "}
            <Link href="/settings/github" className="underline underline-offset-4">
              Connect GitHub
            </Link>{" "}
            and share the repository first.
          </p>
        )}
      </Section>

      <Section id="details-heading" title="Details">
        <DetailsForm venture={v} skills={options} />
      </Section>
    </div>
  );
}
