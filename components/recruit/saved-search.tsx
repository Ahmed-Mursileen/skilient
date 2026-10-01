"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/teach/action-button";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { deleteSavedSearch, saveSearch } from "@/lib/actions/recruit";
import type { TalentFilters } from "@/lib/recruit/constants";

export function SaveSearchForm({ filters }: { filters: TalentFilters }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const r = await saveSearch(name, filters, frequency);
          if (r.ok) {
            setSaved(true);
            setName("");
            router.refresh();
          } else setError(r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Saved. You&apos;ll get new matches in your digest.</FormAlert> : null}
      <div className="grid grid-cols-[1fr_7rem_auto] gap-2">
        <Input aria-label="Name this search" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name this search" />
        <Select value={frequency} onValueChange={(v) => setFrequency(v as "daily" | "weekly")}>
          <SelectTrigger aria-label="How often">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary" loading={pending}>Save</Button>
      </div>
    </form>
  );
}

export function DeleteSavedSearchButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => deleteSavedSearch(id)} variant="ghost" size="sm">
      Delete
    </ActionButton>
  );
}
