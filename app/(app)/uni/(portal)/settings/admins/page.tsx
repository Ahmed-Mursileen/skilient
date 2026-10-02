import type { Metadata } from "next";
import { ActionButton } from "@/components/teach/action-button";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { SettingsTabs } from "@/components/uni/settings-tabs";
import { inviteAdmin, removeAdmin, revokeAdminInvite, setAdminRole, transferOwnership } from "@/lib/actions/uni";
import { getAdmins, getAuditLog, getMyUni, getStructure } from "@/lib/data/uni";
import { ageLabel, futureTime } from "@/lib/format/time";
import { ADMIN_ROLE_LABELS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Admins" };

const ROLE_OPTIONS = (["admin", "career", "coordinator", "comms"] as const).map((r) => ({ value: r, label: ADMIN_ROLE_LABELS[r] }));

/** /uni/settings/admins (PRD 5.23): seats by licence (free 1, Basic 2, Growth 5, Campus 10), roles, invites, history. */
export default async function AdminsPage() {
  const [uni, data, structure, log] = await Promise.all([getMyUni(), getAdmins(), getStructure(), getAuditLog()]);
  const depts = [{ value: "", label: "None" }, ...structure.departments.map((d) => ({ value: d.id, label: d.name }))];
  const free = data.seats_limit !== null && data.seats_used < data.seats_limit;
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Admins">
        <span data-testid="seats">{data.seats_used} of {data.seats_limit ?? 0} seats used, counting invites not yet accepted.</span> Everyone needs two-factor sign-in.
      </PageTitle>
      <SettingsTabs current="/uni/settings/admins" />
      <DataTable testId="admins" head={["Name", "Email", "Role", "Change role", ""]}
        rows={data.admins.map((a) => [
          a.name, <span key="e" className="font-mono text-code-sm">{a.email}</span>,
          `${ADMIN_ROLE_LABELS[a.role]}${a.department ? ` (${a.department})` : ""}`,
          a.role === "owner" ? "" : (
            <RpcForm key="r" action={setAdminRole as FormAction} extra={{ userId: a.user_id }} submitLabel="Save" fields={[
              { name: "role", label: "Role", type: "select", options: ROLE_OPTIONS, defaultValue: a.role },
              { name: "departmentId", label: "Department (coordinators)", type: "select", options: depts, defaultValue: a.department_id ?? "" },
            ]} />
          ),
          a.role === "owner" ? "" : (
            <span key="x" className="flex flex-col gap-2">
              <ActionButton size="sm" variant="ghost" action={removeAdmin.bind(null, a.user_id)}>Remove</ActionButton>
              {uni?.is_owner && a.role === "admin" ? <ActionButton size="sm" variant="ghost" action={transferOwnership.bind(null, a.user_id)}>Make owner</ActionButton> : null}
            </span>
          ),
        ])} />
      <Section title="Invite" id="inv-h">
        {free ? (
          <RpcForm testId="invite-admin" action={inviteAdmin as FormAction} after="reset" submitLabel="Send invite" fields={[
            { name: "email", label: "Official email", type: "email", required: true },
            { name: "role", label: "Role", type: "select", options: ROLE_OPTIONS },
            { name: "departmentId", label: "Department (coordinators only)", type: "select", options: depts },
          ]} />
        ) : (
          <p className="text-body text-text-secondary">Every seat in your licence is in use. Remove someone or upgrade the licence to invite more.</p>
        )}
        <ul className="flex flex-col gap-2" data-testid="admin-invites">
          {data.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 text-body-sm">
              <span className="font-mono">{i.email}</span> · {ADMIN_ROLE_LABELS[i.role]} · {i.state === "pending" ? `expires ${futureTime(i.expires_at)}` : i.state}
              {i.state === "pending" ? <ActionButton size="sm" variant="ghost" action={revokeAdminInvite.bind(null, i.id)}>Revoke</ActionButton> : null}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="History" id="h-h">
        <DataTable head={["When", "Who", "What"]} empty="Nothing yet." rows={log.slice(0, 50).map((l) => [ageLabel(l.at), l.actor ?? "Someone", l.action])} />
      </Section>
    </main>
  );
}
