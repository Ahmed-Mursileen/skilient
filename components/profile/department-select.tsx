"use client";

import { FieldError, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { DEPARTMENTS } from "@/lib/profile/options";

/** The university's own departments when it has a list (PRD 5.23), else the platform-wide list. */
export function DepartmentSelect({ defaultValue, error, options }: { defaultValue?: string | null; error?: string; options?: string[] }) {
  const list = options && options.length > 0 ? options : DEPARTMENTS;
  return (
    <div className="flex flex-col gap-2">
      <Label id="department-label">Department</Label>
      <Select name="department" defaultValue={defaultValue ?? undefined}>
        <SelectTrigger aria-labelledby="department-label" aria-invalid={error ? true : undefined} data-testid="department">
          <SelectValue placeholder="Choose your department" />
        </SelectTrigger>
        <SelectContent>
          {list.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
