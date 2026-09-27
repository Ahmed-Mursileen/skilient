import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "You're in" };

/** "You're in" (PRD 5.27): a preview of the getting-started checklist. The guided tour arrives in phase 6. */
export default async function OnboardingDonePage() {
  const user = await getCurrentUser();
  const checklist = [
    { label: "Finish your profile", done: true },
    { label: "Connect GitHub", done: false },
    { label: "Reach your first L2 skill", done: false },
    { label: "Join or start a venture", done: false },
    { label: "Get your first endorsement", done: false },
    { label: "Build your CV", done: false },
  ];
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-12">
      <div className="rounded-lg border border-border-default bg-bg-surface p-6 shadow-1 sm:p-8">
        <h1 className="font-display text-h1">You&apos;re in{user ? `, ${user.fullName.split(/\s+/)[0]}` : ""}</h1>
        <p className="mt-2 text-body text-text-secondary">
          Your profile is set up. Here&apos;s what builds your proof from here:
        </p>
        <ul className="mt-5 flex flex-col gap-3">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-3 text-body">
              {item.done ? (
                <CheckCircle aria-hidden weight="fill" className="size-5 shrink-0 text-success" />
              ) : (
                <Circle aria-hidden weight="bold" className="size-5 shrink-0 text-text-muted" />
              )}
              <span className={item.done ? "text-text-secondary line-through" : undefined}>{item.label}</span>
              <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
            </li>
          ))}
        </ul>
        <Button asChild size="lg" className="mt-8 w-full sm:w-auto">
          <Link href="/feed">Go to Home</Link>
        </Button>
      </div>
    </main>
  );
}
