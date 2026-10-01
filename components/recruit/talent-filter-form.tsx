"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import type { TalentFacets } from "@/lib/data/recruit";
import {
  ACTIVE_DAYS,
  AVAILABILITY,
  AVAILABILITY_LABELS,
  filtersToParams,
  TIER_LABELS,
  TIERS,
  type Availability,
  type TalentFilters,
  type TierKey,
} from "@/lib/recruit/constants";

const ANY = "any";

/**
 * The talent filters (PRD 5.20): skill with a minimum level, code check, university, department,
 * batch, tier, activity, availability, city and remote. There is nothing here to filter or sort by
 * gender, age, religion, ethnicity or photo, and the database refuses those keys too.
 */
export function TalentFilterForm({ facets, initial }: { facets: TalentFacets; initial: TalentFilters }) {
  const router = useRouter();
  const [skills, setSkills] = useState<{ skill: string; min_level: number }[]>(initial.skills ?? []);
  const [pick, setPick] = useState("");
  const [pickLevel, setPickLevel] = useState("2");
  const [codeCheck, setCodeCheck] = useState(initial.code_check === true);
  const [uni, setUni] = useState(initial.universities?.[0] ?? ANY);
  const [dept, setDept] = useState(initial.departments?.[0] ?? ANY);
  const [from, setFrom] = useState(initial.batch_from?.toString() ?? "");
  const [to, setTo] = useState(initial.batch_to?.toString() ?? "");
  const [tier, setTier] = useState<string>(initial.min_tier ?? ANY);
  const [active, setActive] = useState(initial.active_days?.toString() ?? ANY);
  const [avail, setAvail] = useState<Availability[]>(initial.availability ?? []);
  const [city, setCity] = useState(initial.city ?? "");
  const [remote, setRemote] = useState(initial.remote === true);
  const names = new Map(facets.skills.map((s) => [s.id, s.name]));

  function addSkill() {
    if (!pick || skills.some((s) => s.skill === pick) || skills.length >= 10) return;
    setSkills([...skills, { skill: pick, min_level: Number(pickLevel) }]);
    setPick("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const f: TalentFilters = {};
    if (skills.length) f.skills = skills;
    if (codeCheck) f.code_check = true;
    if (uni !== ANY) f.universities = [uni];
    if (dept !== ANY) f.departments = [dept];
    if (from) f.batch_from = Number(from);
    if (to) f.batch_to = Number(to);
    if (tier !== ANY) f.min_tier = tier as TierKey;
    if (active !== ANY) f.active_days = Number(active) as (typeof ACTIVE_DAYS)[number];
    if (avail.length) f.availability = avail;
    if (city.trim().length >= 2) f.city = city.trim();
    if (remote) f.remote = true;
    const q = filtersToParams(f).toString();
    router.push((q ? `/recruit/search?${q}` : "/recruit/search") as Route);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Talent filters" data-testid="talent-filters">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-text-secondary uppercase">Skills</legend>
        <div className="flex flex-wrap gap-2" data-testid="picked-skills">
          {skills.map((s) => (
            <button
              key={s.skill}
              type="button"
              onClick={() => setSkills(skills.filter((x) => x.skill !== s.skill))}
              className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-default bg-bg-surface px-2 text-body-sm hover:border-border-strong"
              aria-label={`Remove ${names.get(s.skill) ?? s.skill} L${s.min_level}+`}
            >
              {names.get(s.skill) ?? s.skill} <span className="font-mono text-code-sm">L{s.min_level}+</span>
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger aria-label="Skill" data-testid="skill-select">
              <SelectValue placeholder="Add a skill" />
            </SelectTrigger>
            <SelectContent>
              {facets.skills.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pickLevel} onValueChange={setPickLevel}>
            <SelectTrigger aria-label="Minimum level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((l) => (
                <SelectItem key={l} value={String(l)}>
                  L{l}+
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="secondary" onClick={addSkill} data-testid="add-skill">Add</Button>
        </div>
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" className="size-4" checked={codeCheck} onChange={(e) => setCodeCheck(e.target.checked)} />
          Has passed a code check
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <FilterSelect label="University" value={uni} onChange={setUni} options={facets.universities.map((u) => ({ value: u.id, label: u.name }))} />
        <FilterSelect label="Department" value={dept} onChange={setDept} options={facets.departments.map((d) => ({ value: d, label: d }))} />
        <div className="grid grid-cols-2 gap-2">
          <Field id="from" label="Graduates from">
            <Input id="from" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2026" />
          </Field>
          <Field id="to" label="Graduates to">
            <Input id="to" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2028" />
          </Field>
        </div>
        <FilterSelect label="Minimum tier" value={tier} onChange={setTier} options={TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))} />
        <FilterSelect label="Active in the last" value={active} onChange={setActive} options={ACTIVE_DAYS.map((d) => ({ value: String(d), label: `${d} days` }))} />
        <Field id="city" label="City">
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-text-secondary uppercase">Available for</legend>
        {AVAILABILITY.map((a) => (
          <label key={a} className="flex items-center gap-2 text-body-sm">
            <input type="checkbox" className="size-4" checked={avail.includes(a)} onChange={(e) => setAvail((cur) => (e.target.checked ? [...cur, a] : cur.filter((x) => x !== a)))} />
            {AVAILABILITY_LABELS[a]}
          </label>
        ))}
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" className="size-4" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          Open to remote
        </label>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" data-testid="apply-filters">Search</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/recruit/search" as Route)}>Clear</Button>
      </div>
    </form>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = `f-${label.replace(/\W/g, "").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2">
      <label id={id} className="block text-label text-text-secondary uppercase">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
