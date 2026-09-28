"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui";

export interface SkillOption {
  id: string;
  name: string;
}

/**
 * Pick skills from the taxonomy: type to filter, choose from the matches, remove a chip.
 * Keyboard: the matches are buttons in tab order; each chip has a remove button.
 */
export function SkillPicker({
  id,
  label,
  options,
  value,
  onChange,
  max,
}: {
  id: string;
  label: string;
  options: SkillOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  max: number;
}) {
  const [query, setQuery] = useState("");
  const hintId = useId();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter((o) => !value.includes(o.id) && o.name.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const full = value.length >= max;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="block text-label text-text-secondary uppercase">
        {label}
      </label>
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={`Chosen ${label.toLowerCase()}`}>
          {value.map((sid) => (
            <li key={sid}>
              <span className="inline-flex h-7 items-center gap-1 rounded-sm border border-border-default bg-bg-surface pr-1 pl-2 text-body-sm">
                {byId.get(sid)?.name ?? sid}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== sid))}
                  className="inline-flex size-5 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
                  aria-label={`Remove ${byId.get(sid)?.name ?? sid}`}
                >
                  <X aria-hidden weight="bold" className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={full}
        placeholder={full ? `Up to ${max}` : "Type a skill, e.g. React"}
        aria-describedby={hintId}
        autoComplete="off"
      />
      <p id={hintId} className="text-body-sm text-text-muted">
        {full ? `You've picked the most (${max}). Remove one to change.` : `Pick up to ${max}.`}
      </p>
      {matches.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Matching skills">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...value, m.id]);
                  setQuery("");
                }}
                className="inline-flex h-7 items-center rounded-sm border border-dashed border-border-strong px-2 text-body-sm text-text-primary hover:bg-bg-subtle"
              >
                Add {m.name}
              </button>
            </li>
          ))}
        </ul>
      ) : q ? (
        <p className="text-body-sm text-text-muted">No skill matches “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}
