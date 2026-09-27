import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThemeToggle, Toaster } from "@/components/ui";
import { GalleryPanel } from "./gallery-panel";

export const metadata: Metadata = {
  title: "UI gallery",
  robots: { index: false, follow: false },
};

/** Dev-only gallery of every primitive in both themes (PRD 9, build: design system). */
export default function UiGalleryPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_UI_GALLERY !== "1") notFound();

  return (
    <Toaster>
      <main className="mx-auto flex max-w-page flex-col gap-6 px-[var(--page-gutter)] py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-h1">UI gallery</h1>
            <p className="text-body text-text-muted">Every primitive, light and dark side by side.</p>
          </div>
          <ThemeToggle />
        </header>
        <div className="grid gap-6 lg:grid-cols-2">
          <GalleryPanel theme="light" />
          <GalleryPanel theme="dark" />
        </div>
      </main>
    </Toaster>
  );
}
