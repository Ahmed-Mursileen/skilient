"use client";

import { useState } from "react";
import { Checkbox, Switch } from "@/components/ui";
import { LOOKING_FOR, type LookingFor } from "@/lib/profile/options";

/** PRD 5.27 step 5: what you're looking for, plus recruiter visibility. */
export function LookingForFields({
  defaultValues,
  defaultRecruiterVisible,
}: {
  defaultValues: LookingFor[];
  defaultRecruiterVisible: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues));
  const [recruiters, setRecruiters] = useState(defaultRecruiterVisible);
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label text-text-secondary uppercase">I&apos;m looking for</legend>
        {LOOKING_FOR.map((o) => (
          <div key={o.value} className="flex items-center gap-3">
            <Checkbox
              id={`looking-${o.value}`}
              name="lookingFor"
              value={o.value}
              checked={selected.has(o.value)}
              onCheckedChange={(checked) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (checked === true) next.add(o.value);
                  else next.delete(o.value);
                  return next;
                })
              }
            />
            <label htmlFor={`looking-${o.value}`} className="text-body">
              {o.label}
            </label>
          </div>
        ))}
      </fieldset>
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border-default p-4">
        <div>
          <label htmlFor="recruiterVisible" className="text-body font-semibold">
            Let recruiters find me
          </label>
          <p id="recruiterVisible-help" className="mt-1 text-body-sm text-text-secondary">
            Verified recruiters can see your verified skills and contact you with a reason. You can turn this off any time.
          </p>
        </div>
        <Switch
          id="recruiterVisible"
          name="recruiterVisible"
          value="on"
          checked={recruiters}
          onCheckedChange={setRecruiters}
          aria-describedby="recruiterVisible-help"
        />
      </div>
    </div>
  );
}
