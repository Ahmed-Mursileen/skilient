import Image from "next/image";
import { ThemeToggle } from "@/components/ui";

// Placeholder until the marketing site (phase 12).
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col justify-between gap-16 px-[var(--page-gutter)] py-10">
      <header className="flex items-center justify-between">
        <Image src="/brand/skilient-logo.svg" alt="Skilient" width={176} height={40} priority className="h-10 w-auto dark:hidden" />
        <Image src="/brand/skilient-logo-reversed.svg" alt="Skilient" width={176} height={40} priority className="hidden h-10 w-auto dark:block" />
        <ThemeToggle />
      </header>
      <section className="flex max-w-3xl flex-col gap-6">
        <h1 className="font-display text-display">Prove it. Don&apos;t claim it.</h1>
        <p className="text-body-lg text-text-secondary">
          Build with classmates, prove your skills with real work, and get recognised by recruiters.
        </p>
      </section>
      <footer className="text-caption text-text-muted">© Skilient</footer>
    </main>
  );
}
