import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { ChecklistItem } from "@/lib/data/portal";
import { points } from "@/lib/ranking/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "You're in" };

/** "You're in" (PRD 5.27): the getting-started checklist as it stands, and the tour. */
export default async function OnboardingDonePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("getting_started");
  const items = ((data as unknown as { items?: ChecklistItem[] } | null)?.items ?? []).map((i) => ({
    ...i,
    // Everyone who reaches this page has finished the wizard, which is what "your profile" means here.
    done: i.key === "profile" ? true : i.done,
  }));
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-12">
      <div className="rounded-lg border border-border-default bg-bg-surface p-6 shadow-1 sm:p-8">
        <h1 className="font-display text-h1">You&apos;re in{user ? `, ${user.fullName.split(/\s+/)[0]}` : ""}</h1>
        <p className="mt-2 text-body text-text-secondary">Your profile is set up. Here&apos;s what builds your proof from here:</p>
        <ul className="mt-5 flex flex-col gap-3" data-testid="done-checklist">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 text-body">
              {item.done ? (
                <CheckCircle aria-hidden weight="fill" className="size-5 shrink-0 text-success" />
              ) : (
                <Circle aria-hidden weight="bold" className="size-5 shrink-0 text-text-muted" />
              )}
              <Link href={item.href as Route} className={item.done ? "text-text-secondary line-through" : "underline-offset-4 hover:underline"}>
                {item.label}
              </Link>
              <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
              {item.points !== null && !item.done ? (
                <span className="ml-auto text-caption text-text-secondary tabular-nums">
                  +{points(item.points)}
                  {item.note ? ` ${item.note}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/feed?tour=1" data-testid="take-tour">
              Take the tour
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/feed">Go to Home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
