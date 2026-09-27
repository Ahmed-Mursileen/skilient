import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-[680px] flex-col justify-center px-[var(--page-gutter)] py-10">
      <EmptyState
        title="We couldn't find that page"
        description="The link may be wrong, or the page (or profile) isn't available to you."
        action={
          <Button asChild variant="secondary">
            <Link href="/feed">Go to Home</Link>
          </Button>
        }
      />
    </main>
  );
}
