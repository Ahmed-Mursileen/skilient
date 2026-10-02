import type { Metadata } from "next";
import { ConfigTabs } from "@/components/ops/config-tabs";
import { AddSkillForm, SkillAction } from "@/components/ops/config-forms";
import { getSkills } from "@/lib/data/ops-config";
import { staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: "Skills" };

/** /ops/config/skills (PRD 5.26, decisions 2026-09-25): the skill dictionary; trust reviewers add, rename, retire and restore. */
export default async function OpsSkillsPage() {
  const [skills, roles] = await Promise.all([getSkills(), staffRoles()]);
  const trust = roles.has("trust_reviewer");
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Skills</h1>
      <ConfigTabs current="/ops/config/skills" />
      {trust ? <AddSkillForm /> : null}
      <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
        <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="skills-table">
          <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Skill</th>
              <th scope="col" className="px-3 py-2 font-semibold">Category</th>
              <th scope="col" className="px-3 py-2 font-semibold">GitHub detectors</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Students</th>
              <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {skills.map((s) => (
              <tr key={s.id} data-testid="skill-row">
                <td className="px-3 py-2">
                  <span className="font-semibold">{s.name}</span> <span className="font-mono text-caption text-text-secondary">{s.id}</span>
                  {s.retired ? <span className="ml-1 text-caption text-text-secondary">retired {s.retired}</span> : null}
                </td>
                <td className="px-3 py-2">{s.category}</td>
                <td className="px-3 py-2">{s.detectors ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.holders}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {trust ? (
                    <>
                      <SkillAction id={s.id} name={s.name} action="rename" />
                      <SkillAction id={s.id} name={s.name} action={s.retired ? "restore" : "retire"} />
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
