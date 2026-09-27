import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { onboardingPath, ONBOARDING_STEPS } from "@/lib/auth/gate";

/** One step per screen with a progress bar; Back always works (PRD 5.27). */
export function WizardFrame({
  step,
  title,
  why,
  children,
}: {
  step: number;
  title: string;
  why: string;
  children: ReactNode;
}) {
  const total = ONBOARDING_STEPS.length;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-8 sm:py-12">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-body-sm text-text-secondary">
          {step > 1 ? (
            <Link href={onboardingPath(step - 1) as Route} className="inline-flex items-center gap-1 rounded-sm font-semibold text-text-primary hover:underline">
              <ArrowLeft aria-hidden weight="bold" className="size-4" />
              Back
            </Link>
          ) : (
            <span />
          )}
          <span>
            Step {step} of {total}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step}
          aria-valuetext={`Step ${step} of ${total}`}
          className="h-1.5 overflow-hidden rounded-full bg-bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-standard" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      </div>
      <div className="rounded-lg border border-border-default bg-bg-surface p-6 shadow-1 sm:p-8">
        <h1 className="font-display text-h2">{title}</h1>
        <p className="mt-2 text-body text-text-secondary">{why}</p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
