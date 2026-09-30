import type { Metadata } from "next";
import { TeacherSettingsForm } from "@/components/teach/settings-form";
import { listTaxonomy } from "@/lib/data/skills";
import { getTeacherSettings } from "@/lib/data/teach";

export const metadata: Metadata = { title: "Settings" };

export default async function TeachSettingsPage() {
  const [settings, skills] = await Promise.all([getTeacherSettings(), listTaxonomy()]);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <h1 className="font-display text-h1">Settings</h1>
      <TeacherSettingsForm settings={settings} skills={skills.map((s) => ({ id: s.id, name: s.name }))} />
    </main>
  );
}
