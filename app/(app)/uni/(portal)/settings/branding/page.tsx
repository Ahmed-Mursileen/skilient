import type { Metadata } from "next";
import { BrandingForm, ImageUpload } from "@/components/uni/branding-form";
import { PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { SettingsTabs } from "@/components/uni/settings-tabs";
import { changeSlug } from "@/lib/actions/uni";
import { getEcosphere } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Branding" };

/** /uni/settings/branding (PRD 5.23): logo, cover, contrast-checked colours, welcome, slug. */
export default async function BrandingPage() {
  const eco = await getEcosphere();
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Branding" />
      <SettingsTabs current="/uni/settings/branding" />
      <Section title="Colours and welcome" id="c-h">
        <BrandingForm primary={eco.branding.primary} accent={eco.branding.accent} welcome={eco.welcome} />
      </Section>
      <Section title="Images" id="i-h">
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUpload kind="logo" current={eco.branding.logo_path ?? null} />
          <ImageUpload kind="cover" current={eco.branding.cover_path ?? null} />
        </div>
      </Section>
      <Section title="Address" id="s-h">
        <p className="text-body-sm text-text-secondary">
          Your ecosphere lives at /u/{eco.slug}. You can change it once every 30 days; the old address is kept for nobody else for 90 days and doesn&apos;t redirect.
          {eco.slug_changed_at ? ` Last changed ${dayLabel(eco.slug_changed_at)}.` : ""}
        </p>
        <RpcForm action={changeSlugFromForm as FormAction} submitLabel="Change address" fields={[{ name: "slug", label: "New address", type: "text", defaultValue: eco.slug }]} />
      </Section>
    </main>
  );
}

async function changeSlugFromForm(values: Record<string, unknown>) {
  "use server";
  return changeSlug(String(values.slug ?? ""));
}
