import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { requestUniversity as copy } from "@/content/marketing";
import { logger } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Request confirmed", robots: { index: false } };

/** The link in the request email (PRD 5.1): confirms the address. Confirming twice is fine. */
export default async function ConfirmRequestPage({ searchParams }: PageProps<"/request-university/confirm">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token.slice(0, 200) : "";
  let university: string | null = null;
  if (token.length >= 32) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("confirm_university_request", { p_token: token });
    if (error && error.code !== "P0002") {
      logger.error("marketing.confirm_request", { action: "confirm_university_request", outcome: "error", error_code: error.code ?? "unknown" });
    }
    university = error ? null : ((data as { university: string | null } | null)?.university ?? "your university");
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] pt-12 pb-24 sm:pt-16">
      <h1 className="font-display text-h1">{university ? "Request confirmed" : copy.title}</h1>
      {university ? (
        <p role="status" className="flex items-start gap-2 text-body-lg" data-testid="request-confirmed">
          <CheckCircle aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-success" />
          <span>{copy.confirmed.replace("{name}", university)}</span>
        </p>
      ) : (
        <p className="text-body-lg">
          {copy.badLink}{" "}
          <Link href="/request-university" className="font-semibold underline underline-offset-4">
            {copy.title}
          </Link>
        </p>
      )}
    </div>
  );
}
