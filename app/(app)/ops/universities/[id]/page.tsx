import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/uni/page-parts";
import { RpcForm } from "@/components/uni/rpc-form";
import { Badge } from "@/components/ui";
import { addUniDomain, assignUniOwner } from "@/lib/actions/ops/universities";
import { cn } from "@/lib/cn";
import { getUniRecord } from "@/lib/data/ops-unis";
import { staffRoles } from "@/lib/data/ops-trust";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "University" };

const TABS = [
  { id: "overview", label: "Admins and domains" },
  { id: "ecosphere", label: "Ecosphere" },
  { id: "exams", label: "Exam calendar" },
  { id: "invoices", label: "Invoices" },
] as const;

/**
 * /ops/universities/[id] (PRD 5.26, screen spec 3.11): one university from the HEC list. Accounts
 * staff see admins, plan, ecosphere config, exam calendar and invoices, and onboard it: assign an
 * owner (a partner without a claim letter) and add email domains. Plans and licences are issued at
 * /ops/billing.
 */
export default async function OpsUniversityPage({ params, searchParams }: PageProps<"/ops/universities/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const [u, sp] = await Promise.all([getUniRecord(id), searchParams]);
  if (!u) notFound();
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "overview";
  return (
    <main className="flex flex-col gap-5">
      <p>
        <Link href={"/ops/universities" as Route} className="text-body-sm underline underline-offset-4">
          Universities
        </Link>
      </p>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1">{u.name}</h1>
        {u.owner ? <Badge tone="success">Onboarded</Badge> : <Badge data-testid="uni-not-onboarded">Not onboarded</Badge>}
        <Badge>Plan: {u.plan ?? "free"}</Badge>
      </header>
      <p className="text-body-sm text-text-secondary">
        {u.city ?? "—"} · {u.students} students
        {u.slug ? (
          <>
            {" "}
            ·{" "}
            <Link href={`/u/${u.slug}` as Route} className="underline underline-offset-4">
              Ecosphere page
            </Link>
          </>
        ) : null}{" "}
        ·{" "}
        <Link href={`/ops/billing/university/${u.id}` as Route} className="underline underline-offset-4">
          Plan, licence and grants
        </Link>
      </p>
      <nav aria-label="University sections" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={(t.id === "overview" ? `/ops/universities/${id}` : `/ops/universities/${id}?tab=${t.id}`) as Route}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap",
                  tab === t.id ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" ? (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="admins-h" className="flex flex-col gap-2">
            <h2 id="admins-h" className="text-h3">
              Admins
            </h2>
            <DataTable
              testId="uni-admins"
              head={["Person", "Email", "Role", "Since"]}
              empty="No admins yet."
              rows={u.admins.map((a) => [a.name ?? "—", <span key="e" className="font-mono text-code-sm">{a.email}</span>, a.department ? `${a.role} (${a.department})` : a.role, dayLabel(a.since)])}
            />
            {u.invites ? <p className="text-caption text-text-secondary">{u.invites} invite(s) waiting.</p> : null}
          </section>
          {!u.owner ? (
            <section aria-labelledby="owner-h" className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
              <h2 id="owner-h" className="text-h3">
                Assign an owner
              </h2>
              <p className="text-body-sm text-text-secondary">
                For a partner that signed with Skilient, without a claim letter. The person must already have a university staff account at this university, with two-factor on.
              </p>
              <RpcForm
                testId="assign-owner"
                action={assignUniOwner}
                extra={{ university: u.id }}
                submitLabel="Make owner"
                fields={[
                  { name: "email", label: "Official's email", type: "email", required: true },
                  { name: "reason", label: "Reason (the agreement it rests on)", type: "textarea", required: true, rows: 2 },
                ]}
              />
            </section>
          ) : (
            <p className="text-body-sm">Owner: {u.owner.name}</p>
          )}
          <section aria-labelledby="domains-h" className="flex flex-col gap-2">
            <h2 id="domains-h" className="text-h3">
              Email domains
            </h2>
            <DataTable
              testId="uni-domains"
              head={["Domain", "For", "Added by"]}
              empty="No domains."
              rows={u.domains.map((d) => [<span key="d" className="font-mono text-code-sm">{d.domain}</span>, d.kind, d.source === "ops" ? "Skilient staff" : "HEC list"])}
            />
            <div className="rounded-lg border border-border-default bg-bg-surface p-4">
              <RpcForm
                testId="add-domain"
                action={addUniDomain}
                extra={{ university: u.id }}
                submitLabel="Add domain"
                fields={[
                  { name: "domain", label: "Domain", type: "text", required: true, placeholder: "students.example.edu.pk" },
                  {
                    name: "kind",
                    label: "For",
                    type: "select",
                    options: [
                      { value: "both", label: "Students and staff" },
                      { value: "student", label: "Students" },
                      { value: "faculty", label: "Faculty and staff" },
                    ],
                  },
                  { name: "reason", label: "Reason", type: "text", required: true },
                ]}
              />
            </div>
          </section>
        </div>
      ) : null}

      {tab === "ecosphere" ? (
        u.ecosphere ? (
          <dl className="grid gap-3 rounded-lg border border-border-default bg-bg-surface p-4 sm:grid-cols-2" data-testid="uni-ecosphere">
            <div>
              <dt className="text-caption text-text-secondary">Modules on</dt>
              <dd className="text-body-sm">
                {Object.entries(u.ecosphere.modules)
                  .filter(([, on]) => on)
                  .map(([m]) => m.replaceAll("_", " "))
                  .join(", ") || "none"}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Branding</dt>
              <dd className="text-body-sm">{Object.keys(u.ecosphere.branding).length ? "Custom colours and images" : "Skilient defaults"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-caption text-text-secondary">Welcome</dt>
              <dd className="text-body-sm break-words">{u.ecosphere.welcome ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Last changed</dt>
              <dd className="text-body-sm">{dayLabel(u.ecosphere.updated_at)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-body-sm text-text-secondary">Not set up yet; the owner configures it at /uni/settings/ecosphere.</p>
        )
      ) : null}

      {tab === "exams" ? (
        <DataTable
          testId="uni-exams"
          head={["From", "To", "Reason"]}
          empty="No exam periods. Add them at /ops/exam-periods or the university adds its own."
          rows={u.exam_periods.map((x) => [x.starts_on, x.ends_on, x.reason])}
        />
      ) : null}

      {tab === "invoices" ? (
        <DataTable
          testId="uni-invoices"
          head={["Invoice", "Total", "Status", "Issued"]}
          empty="No invoices yet."
          rows={u.invoices.map((i) => [
            <Link key="i" href={`/api/billing/invoice/${i.id}` as Route} className="font-mono underline underline-offset-4">
              {i.number}
            </Link>,
            `${i.currency} ${Number(i.total).toLocaleString("en-PK")}`,
            i.status,
            dayLabel(i.issued_at),
          ])}
        />
      ) : null}
    </main>
  );
}
