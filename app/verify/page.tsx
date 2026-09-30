import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { PublicFrame } from "@/components/cv/public-frame";
import { Button, Field, Input } from "@/components/ui";
import { normaliseCode } from "@/supabase/functions/_shared/cv/sign.ts";

export const metadata: Metadata = { title: "Check a verified CV", robots: { index: false } };

/** /verify: type the code printed on a CV (works without JavaScript). */
export default async function VerifyIndexPage({ searchParams }: PageProps<"/verify">) {
  const raw = (await searchParams).code;
  const typed = typeof raw === "string" ? raw : "";
  const code = typed ? normaliseCode(typed) : null;
  if (code) redirect(`/verify/${code}` as Route);
  return (
    <PublicFrame>
      <div className="rounded-lg border border-border-default bg-bg-surface p-6 shadow-1 sm:p-8">
        <h1 className="font-display text-h2">Check a verified CV</h1>
        <p className="mt-2 text-body text-text-secondary">
          Every Skilient CV carries a 10-character code in its footer. Enter it to see whether the CV is genuine and current.
        </p>
        <form method="get" action="/verify" className="mt-6 flex flex-col gap-4">
          <Field id="code" label="CV code" error={typed && !code ? "Codes have 10 letters and numbers, like ABCDE-12345." : undefined}>
            <Input id="code" name="code" defaultValue={typed} autoComplete="off" placeholder="ABCDE-12345" className="font-mono" required />
          </Field>
          <Button type="submit">Check</Button>
        </form>
      </div>
    </PublicFrame>
  );
}
