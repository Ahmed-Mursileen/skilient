"use client";

import { FieldError, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { DEPARTMENTS } from "@/lib/profile/options";

export function DepartmentSelect({ defaultValue, error }: { defaultValue?: string | null; error?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label id="department-label">Department</Label>
      <Select name="department" defaultValue={defaultValue ?? undefined}>
        <SelectTrigger aria-labelledby="department-label" aria-invalid={error ? true : undefined} data-testid="department">
          <SelectValue placeholder="Choose your department" />
        </SelectTrigger>
        <SelectContent>
          {DEPARTMENTS.map((d) => (
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
