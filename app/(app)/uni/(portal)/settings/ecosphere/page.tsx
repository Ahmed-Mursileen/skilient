import type { Metadata } from "next";
import { ActionButton } from "@/components/teach/action-button";
import { Card, PageTitle, Section } from "@/components/uni/page-parts";
import { PageEditor } from "@/components/uni/page-editor";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { SettingsTabs } from "@/components/uni/settings-tabs";
import { Badge } from "@/components/ui";
import { deletePage, removeQuestion, saveModules, saveQuestion, saveStructure } from "@/lib/actions/uni";
import { getEcosphere, getFeatureOptions, getUniQuestions } from "@/lib/data/uni";
import { MODULES, countLabel } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Ecosphere settings" };

/** /uni/settings/ecosphere (PRD 5.23): modules, structure labels, onboarding questions and custom pages. */
export default async function EcospherePage() {
  const [eco, questions, options] = await Promise.all([getEcosphere(), getUniQuestions(), getFeatureOptions()]);
  const active = questions.filter((q) => !q.removed);
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Ecosphere">What your students see in your university&apos;s space. Verification, skill levels, ranking, CV format, privacy and moderation are the same everywhere and can&apos;t be changed.</PageTitle>
      <SettingsTabs current="/uni/settings/ecosphere" />
      <Section title="Modules" id="mod-h">
        <RpcForm testId="modules" action={saveModules as FormAction} submitLabel="Save modules" successText="Saved."
          fields={MODULES.map((m) => ({ name: m.key, label: m.label, type: "checkbox" as const, help: m.help, defaultValue: eco.modules[m.key] }))} />
      </Section>
      <Section title="Batch labels and announcement categories" id="str-h">
        <StructureForm labels={eco.batch_labels} categories={eco.announcement_categories} />
      </Section>
      <Section title="Onboarding questions" id="q-h">
        <p className="text-body-sm text-text-secondary">Up to 3 optional multiple-choice questions (2 to 6 answers). Not allowed: religion, ethnicity, health, politics or income. You see counts of 5 or more only.</p>
        {active.map((q) => (
          <Card key={q.id} className="flex flex-col gap-2">
            <p className="font-semibold">{q.prompt}</p>
            <ul className="text-body-sm">{q.options.map((o, i) => <li key={o}>{o}: {countLabel(q.counts[i])}</li>)}</ul>
            <ActionButton size="sm" variant="ghost" action={removeQuestion.bind(null, q.id)}>Remove question</ActionButton>
          </Card>
        ))}
        {questions.filter((q) => q.removed_by_staff).map((q) => (
          <p key={q.id} className="text-body-sm"><Badge tone="warning">Removed by Skilient</Badge> {q.prompt}: {q.removed_reason}</p>
        ))}
        {active.length < 3 ? (
          <RpcForm testId="question-form" action={saveQuestion as FormAction} after="reset" submitLabel="Add question" fields={[
            { name: "prompt", label: "Question", type: "text", required: true, placeholder: "Which society are you part of?" },
            { name: "options", label: "Answers, separated by commas", type: "list", placeholder: "Robotics, Debating, None" },
          ]} />
        ) : null}
      </Section>
      <Section title="Pages" id="p-h">
        <p className="text-body-sm text-text-secondary">Up to 10 pages built from blocks. Only signed-in Skilient users can open them.</p>
        {eco.pages.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3">
            <p className="font-semibold">{p.title} <span className="font-mono text-code-sm text-text-secondary">/u/{eco.slug}/{p.slug}</span> {p.published ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}</p>
            <PageEditor page={p} options={options} />
            <ActionButton size="sm" variant="ghost" action={deletePage.bind(null, p.id)}>Delete page</ActionButton>
          </Card>
        ))}
        {eco.pages.length < 10 ? <Card><p className="mb-3 font-semibold">New page</p><PageEditor page={null} options={options} /></Card> : null}
      </Section>
    </main>
  );
}

function StructureForm({ labels, categories }: { labels: Record<string, string>; categories: string[] }) {
  return (
    <RpcForm action={saveStructureFromText as FormAction} submitLabel="Save" successText="Saved." fields={[
      { name: "labels", label: "Batch labels (year=label, one per line)", type: "textarea", rows: 3, defaultValue: Object.entries(labels).map(([y, l]) => `${y}=${l}`).join("\n") },
      { name: "categories", label: "Announcement categories, separated by commas", type: "list", defaultValue: categories.join(", ") },
    ]} />
  );
}

async function saveStructureFromText(values: Record<string, unknown>) {
  "use server";
  const labels = Object.fromEntries(
    String(values.labels ?? "").split(/\r?\n/).map((l) => l.split("=").map((s) => s.trim())).filter((p) => p.length === 2 && p[0] && p[1]),
  );
  return saveStructure({ labels, categories: (values.categories as string[]) ?? [] });
}
