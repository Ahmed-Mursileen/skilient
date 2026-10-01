import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyPageForm } from "@/components/recruit/org-forms";
import { getMyOrg } from "@/lib/data/recruit";

export const metadata: Metadata = { title: "Company page" };

/** /org/settings (PRD 5.20): the page students read before answering a contact request. */
export default async function CompanySettingsPage() {
  const org = await getMyOrg();
  if (org?.role !== "admin") notFound();
  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-h1">Company page</h1>
        <p className="text-body text-text-secondary">
          Students see this before they answer your contact requests:{" "}
          <Link href={`/companies/${org.slug}`} className="font-semibold underline underline-offset-4">/companies/{org.slug}</Link>. Hiring and response statistics are never shown.
        </p>
      </div>
      <CompanyPageForm initial={{ about: org.about ?? "", locations: org.locations, industry: org.industry, size: org.size, linkedinUrl: org.linkedin_url ?? "" }} />
    </main>
  );
}
