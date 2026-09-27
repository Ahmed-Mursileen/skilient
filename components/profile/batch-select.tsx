"use client";

import { FieldError, HelperText, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { graduationYears } from "@/lib/profile/options";

export function BatchSelect({ defaultValue, error }: { defaultValue?: number | null; error?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label id="batch-label">Batch (graduation year)</Label>
      <Select name="graduationYear" defaultValue={defaultValue ? String(defaultValue) : undefined}>
        <SelectTrigger aria-labelledby="batch-label" aria-invalid={error ? true : undefined} data-testid="batch">
          <SelectValue placeholder="Choose your batch" />
        </SelectTrigger>
        <SelectContent>
          {graduationYears().map((y) => (
            <SelectItem key={y} value={String(y)}>
              Class of {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <FieldError>{error}</FieldError> : <HelperText>The year you graduate (or graduated).</HelperText>}
    </div>
  );
}
