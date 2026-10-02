import type { Metadata } from "next";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { SettingsTabs } from "@/components/uni/settings-tabs";
import { requestDomain } from "@/lib/actions/uni";
import { getDomains } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Email domains" };

const KIND = { student: "Students", faculty: "Staff and faculty", both: "Everyone" } as Record<string, string>;

/** /uni/settings/domains (PRD 5.23): domains that sign people up; extra ones are approved by Skilient. */
export default async function DomainsPage() {
  const d = await getDomains();
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Email domains">People sign up with an email on these domains. Public email providers (Gmail, Outlook and the like) can never be added.</PageTitle>
      <SettingsTabs current="/uni/settings/domains" />
      <DataTable head={["Domain", "Who signs up with it"]} rows={d.domains.map((x) => [<span key="d" className="font-mono text-code-sm">{x.domain}</span>, KIND[x.kind] ?? x.kind])} />
      <Section title="Ask for another domain" id="r-h">
        <RpcForm testId="domain-request" action={requestDomain as FormAction} after="reset" submitLabel="Send to Skilient" fields={[
          { name: "domain", label: "Domain", type: "text", required: true, placeholder: "students.example.edu.pk" },
          { name: "kind", label: "Who uses it", type: "select", options: [{ value: "both", label: "Everyone" }, { value: "student", label: "Students" }, { value: "faculty", label: "Staff and faculty" }] },
          { name: "reason", label: "Reason", type: "text", required: true },
        ]} />
        <DataTable head={["Domain", "Status", "Asked", "Note"]} empty="No requests."
          rows={d.requests.map((r) => [r.domain, r.status, dayLabel(r.created_at), r.review_reason ?? ""])} />
      </Section>
    </main>
  );
}
