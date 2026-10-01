import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InviteForm, MemberRow, RevokeInviteButton } from "@/components/recruit/org-forms";
import { Badge } from "@/components/ui";
import { getMyOrg, getOrgMembers } from "@/lib/data/recruit";
import { ageLabel, futureTime } from "@/lib/format/time";
import { ORG_ROLE_LABELS } from "@/lib/recruit/constants";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Team" };

/** /org/members (PRD 5.20): invite teammates on the company domain, change roles, see seat use. */
export default async function MembersPage() {
  const org = await getMyOrg();
  if (org?.role !== "admin") notFound();
  const [data, me] = await Promise.all([getOrgMembers(), getCurrentUser()]);
  const seatsFree = data.seats_limit !== null && data.seats_used < data.seats_limit;
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-h1">Team</h1>
        <p className="text-body text-text-secondary" data-testid="seats">
          {data.seats_used} of {data.seats_limit ?? 0} seats used, counting invites waiting to be accepted.
        </p>
      </div>
      <InviteForm seatsFree={seatsFree} />
      <section aria-labelledby="mem-h" className="flex flex-col gap-3">
        <h2 id="mem-h" className="text-h3">Members</h2>
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full min-w-[560px] text-left text-body-sm" data-testid="members">
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                <th scope="col" className="px-3 py-2 font-semibold">Joined</th>
                <th scope="col" className="px-3 py-2 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {data.members.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-3 py-2 font-semibold">{m.name}</td>
                  <td className="px-3 py-2 font-mono text-code-sm">{m.email}</td>
                  <td className="px-3 py-2">{ageLabel(m.joined_at)}</td>
                  <td className="px-3 py-2">
                    {m.status === "inactive" ? <Badge>Removed</Badge> : <MemberRow userId={m.user_id} role={m.role} isMe={m.user_id === me?.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {data.invites.length > 0 ? (
        <section aria-labelledby="inv-h" className="flex flex-col gap-3">
          <h2 id="inv-h" className="text-h3">Invites</h2>
          <ul className="flex flex-col gap-2" data-testid="invites">
            {data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2">
                <span>
                  <span className="font-mono text-code-sm">{i.email}</span> · {ORG_ROLE_LABELS[i.role]}{" "}
                  <span className="text-text-secondary">{i.state === "pending" ? `expires ${futureTime(i.expires_at)}` : i.state}</span>
                </span>
                {i.state === "pending" ? <RevokeInviteButton id={i.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
