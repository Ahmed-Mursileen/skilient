import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const controlBase =
  "w-full rounded-md border border-border-default bg-bg-subtle px-3 text-body text-text-primary " +
  "placeholder:text-text-secondary transition-colors duration-[120ms] ease-standard " +
  "hover:border-border-strong focus-visible:border-focus-ring " +
  "disabled:cursor-not-allowed disabled:bg-bg-muted disabled:text-text-disabled " +
  "aria-[invalid=true]:border-error";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  // text/label: form labels and table headers only.
  return <label className={cn("block text-label text-text-secondary uppercase", className)} {...props} />;
}

export function HelperText({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={cn("text-body-sm text-text-muted", className)}>
      {children}
    </p>
  );
}

/** Error is always icon + text, never colour alone (PRD 9.5). */
export function FieldError({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} role="alert" className={cn("flex items-start gap-1 text-body-sm text-text-error", className)}>
      <WarningCircle aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(controlBase, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(controlBase, "min-h-20 py-2", className)} {...props} />;
});

/** Label + control + helper/error, wired with ids for assistive tech. */
export function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  id: string;
  label: string;
  helper?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : helper ? <HelperText id={`${id}-helper`}>{helper}</HelperText> : null}
    </div>
  );
}
