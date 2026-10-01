"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, FieldError, HelperText, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import type { ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/cn";

export type FieldSpec =
  | { name: string; label: string; type: "text" | "email" | "date" | "datetime-local" | "number" | "url"; required?: boolean; help?: string; placeholder?: string; defaultValue?: string | number }
  | { name: string; label: string; type: "textarea"; required?: boolean; help?: string; placeholder?: string; defaultValue?: string; rows?: number }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean; help?: string; defaultValue?: string }
  | { name: string; label: string; type: "checkbox"; help?: string; defaultValue?: boolean }
  /** Several checkboxes; the value is the list of checked values. */
  | { name: string; label: string; type: "checks"; options: { value: string; label: string }[]; help?: string; defaultValue?: string[] }
  /** Comma-separated text; the value is a list (numbers when `numeric`). */
  | { name: string; label: string; type: "list"; numeric?: boolean; help?: string; placeholder?: string; defaultValue?: string };

/**
 * One form for one server action (PRD 5.23 portal screens). Collects the fields into a plain
 * object, calls the action (which validates with Zod and re-checks everything in SQL), shows the
 * refusal under the form, and refreshes or moves on when it works. Keyboard-operable: native
 * controls, labels tied to inputs, errors announced with role="alert".
 */
export function RpcForm({
  fields,
  action,
  submitLabel,
  extra,
  after = "refresh",
  testId,
  className,
  successText,
}: {
  fields: FieldSpec[];
  action: (values: Record<string, unknown>) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  /** Fixed values sent with the form (ids). */
  extra?: Record<string, unknown>;
  /** refresh the page, reset the form, or go to a path (":id" is replaced by the returned id). */
  after?: "refresh" | "reset" | string;
  testId?: string;
  className?: string;
  successText?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function collect(form: HTMLFormElement): Record<string, unknown> {
    const data = new FormData(form);
    const values: Record<string, unknown> = { ...extra };
    for (const f of fields) {
      if (f.type === "checkbox") values[f.name] = data.get(f.name) === "on";
      else if (f.type === "checks") values[f.name] = data.getAll(f.name).map(String);
      else if (f.type === "list") {
        const items = String(data.get(f.name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        values[f.name] = f.numeric ? items.map(Number) : items;
      } else if (f.type === "number") {
        const raw = String(data.get(f.name) ?? "").trim();
        values[f.name] = raw === "" ? "" : Number(raw);
      } else values[f.name] = String(data.get(f.name) ?? "");
    }
    return values;
  }

  return (
    <form
      className={cn("flex flex-col gap-4", className)}
      data-testid={testId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const values = collect(form);
        startTransition(async () => {
          setError(null);
          setFieldErrors({});
          setDone(null);
          const result = await action(values);
          if (!result.ok) {
            setError(result.message);
            setFieldErrors(result.fields ?? {});
            return;
          }
          const data = result.data as { link?: string } | string | null;
          if (data && typeof data === "object" && data.link) setDone(`Done. Share this link if the email is slow: ${data.link}`);
          else if (successText) setDone(successText);
          if (after === "reset") form.reset();
          if (after !== "refresh" && after !== "reset") router.push(after.replace(":id", typeof data === "string" ? data : "") as Route);
          else router.refresh();
        });
      }}
    >
      {fields.map((f) => {
        const fid = `${id}-${f.name}`;
        const err = fieldErrors[f.name];
        const describedBy = [f.help ? `${fid}-help` : null, err ? `${fid}-err` : null].filter(Boolean).join(" ") || undefined;
        if (f.type === "checkbox") {
          return (
            <div key={f.name} className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-body">
                <input type="checkbox" name={f.name} defaultChecked={f.defaultValue} className="size-4 accent-[var(--primary)]" aria-describedby={describedBy} />
                {f.label}
              </label>
              {f.help ? <HelperText id={`${fid}-help`}>{f.help}</HelperText> : null}
            </div>
          );
        }
        if (f.type === "checks") {
          return (
            <fieldset key={f.name} className="flex flex-col gap-2" aria-describedby={describedBy}>
              <legend className="text-label text-text-secondary uppercase">{f.label}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {f.options.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-body">
                    <input type="checkbox" name={f.name} value={o.value} defaultChecked={f.defaultValue?.includes(o.value)} className="size-4 accent-[var(--primary)]" />
                    {o.label}
                  </label>
                ))}
              </div>
              {f.help ? <HelperText id={`${fid}-help`}>{f.help}</HelperText> : null}
              {err ? <FieldError id={`${fid}-err`}>{err}</FieldError> : null}
            </fieldset>
          );
        }
        return (
          <div key={f.name} className="flex flex-col gap-1">
            <Label htmlFor={fid}>{f.label}</Label>
            {f.type === "textarea" ? (
              <Textarea id={fid} name={f.name} rows={f.rows ?? 4} defaultValue={f.defaultValue} placeholder={f.placeholder} aria-invalid={Boolean(err)} aria-describedby={describedBy} required={f.required} />
            ) : f.type === "select" ? (
              <select id={fid} name={f.name} defaultValue={f.defaultValue} className={cn(controlBase, "h-10")} aria-invalid={Boolean(err)} aria-describedby={describedBy} required={f.required}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={fid}
                name={f.name}
                type={f.type === "list" ? "text" : f.type}
                defaultValue={f.defaultValue}
                placeholder={"placeholder" in f ? f.placeholder : undefined}
                aria-invalid={Boolean(err)}
                aria-describedby={describedBy}
                required={"required" in f ? f.required : undefined}
              />
            )}
            {f.help ? <HelperText id={`${fid}-help`}>{f.help}</HelperText> : null}
            {err ? <FieldError id={`${fid}-err`}>{err}</FieldError> : null}
          </div>
        );
      })}
      {error ? <FieldError>{error}</FieldError> : null}
      {done ? (
        <p role="status" className="text-body-sm break-all text-text-secondary" data-testid={testId ? `${testId}-done` : undefined}>
          {done}
        </p>
      ) : null}
      <div>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
export type FormAction = (values: Record<string, unknown>) => Promise<ActionResult<unknown>>;
