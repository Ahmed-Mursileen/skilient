import { ChalkboardTeacher, Code, Lightbulb, Medal, NotePencil, SealCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { CtaLink, OrgHero } from "@/components/marketing/org-parts";
import { Section, SectionHeading } from "@/components/marketing/sections/section";
import { facultyPage as copy, nav } from "@/content/marketing";
import { getViewer } from "@/lib/data/marketing";

export const metadata: Metadata = { title: copy.title, description: copy.description, alternates: { canonical: "/faculty" } };

const ICONS = { ideas: Lightbulb, supervise: ChalkboardTeacher, confirm: SealCheck, review: NotePencil, endorse: Medal, grade: Code } as const;

/** /faculty (PRD 5.1, 5.21; docs/marketing-design-plan.md B7): what faculty do, free for faculty. */
export default async function FacultyPage() {
  const viewer = await getViewer();
  const cta = viewer ? (
    <CtaLink href={viewer.home} testId="org-cta" track="open_app">
      {nav.open}
    </CtaLink>
  ) : (
    <CtaLink href={copy.cta.href} testId="org-cta" track="faculty_signup">
      {copy.cta.label}
    </CtaLink>
  );
  return (
    <>
      <OrgHero
        headline={copy.headline}
        intro={copy.intro}
        art="faculty"
        cta={cta}
        aside={<span className="text-body font-semibold text-text-secondary">{copy.free}</span>}
      />

      <Section labelledBy="do-title" className="border-b border-border-muted">
        <SectionHeading id="do-title" className="sr-only">
          What faculty do on Skilient
        </SectionHeading>
        <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
          {copy.features.map((f) => {
            const Icon = ICONS[f.icon];
            return (
              <li key={f.title} className="grid grid-cols-[2rem_1fr] gap-x-4 border-t border-border-default pt-6">
                <Icon aria-hidden className="size-7 text-primary" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-h3">{f.title}</h3>
                  <p className="max-w-[52ch] text-body text-text-secondary">{f.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section labelledBy="join-title" className="bg-bg-surface">
        <div className="flex max-w-[62ch] flex-col gap-5">
          <SectionHeading id="join-title">{copy.join.heading}</SectionHeading>
          <p className="text-body-lg text-text-secondary">{copy.join.text}</p>
          <div>{cta}</div>
        </div>
      </Section>
    </>
  );
}
