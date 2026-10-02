import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GrantRoleForm, RevokeRoleButton } from "@/components/ops/staff-forms";
import { Badge, EmptyState } from "@/components/ui";
import { getStaff } from "@/lib/data/ops-shell";
import { staffRoles } from "@/lib/data/ops-trust";
import { ROLE_LABELS } from "@/lib/ops/nav";

export const metadata: Metadata = { title: "Staff" };

/** /ops/staff (PRD 5.26): super admins grant and remove staff roles, each with a reason and audited. */
export default async function OpsStaffPage() {
  const roles = await staffRoles();
  if (!roles.has("super_admin")) notFound();
  const staff = await getStaff();
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Staff</h1>
      <GrantRoleForm />
      {staff.length ? (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="staff-table">
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Person</th>
                <th scope="col" className="px-3 py-2 font-semibold">Two-factor</th>
                <th scope="col" className="px-3 py-2 font-semibold">Roles</th>
                <th scope="col" className="px-3 py-2 font-semibold">Staff since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {staff.map((s) => (
                <tr key={s.userId} data-testid="staff-row">
                  <td className="px-3 py-2 align-top">
                    <span className="font-semibold">{s.name}</span>
                    {s.isMe ? <span className="ml-1 text-text-secondary">(you)</span> : null}
                    <span className="block text-caption text-text-secondary">{s.email}</span>
                  </td>
                  <td className="px-3 py-2 align-top">{s.twoFactor ? <Badge tone="success">On</Badge> : <Badge tone="error">Off</Badge>}</td>
                  <td className="px-3 py-2 align-top">
                    <ul className="flex flex-col gap-1">
                      {s.roles.map((r) => (
                        <li key={r} className="flex items-center gap-2">
                          <span>{ROLE_LABELS[r]}</span>
                          {s.isMe && r === "super_admin" ? null : <RevokeRoleButton userId={s.userId} name={s.name} role={r} />}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{s.since}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No staff yet" description="Grant the first roles above." />
      )}
    </main>
  );
}
