import "server-only";

import type { DomainDirectory, UniversityRef } from "@/lib/auth/email-domain";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Builds the public domain directory from `university_domains` + `personal_email_domains`.
 * Only domains that admit students are listed (faculty-only domains come with phase 7).
 */
export async function loadDomainDirectory(): Promise<DomainDirectory> {
  const supabase = createPublicClient();
  const [domains, personal] = await Promise.all([
    supabase
      .from("university_domains")
      .select("domain, kind, universities!inner(id, name)")
      .in("kind", ["student", "both"])
      .order("domain")
      .limit(5000),
    supabase.from("personal_email_domains").select("domain").order("domain").limit(1000),
  ]);
  if (domains.error) throw new Error(`university_domains: ${domains.error.message}`);
  if (personal.error) throw new Error(`personal_email_domains: ${personal.error.message}`);

  const byDomain: Record<string, UniversityRef[]> = {};
  for (const row of domains.data) {
    const university = row.universities;
    (byDomain[row.domain] ??= []).push({ id: university.id, name: university.name });
  }
  for (const list of Object.values(byDomain)) list.sort((a, b) => a.name.localeCompare(b.name));

  return { domains: byDomain, personal: personal.data.map((r) => r.domain) };
}
