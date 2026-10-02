import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One landing section: the page's grid, its rhythm (80 px, 64 on dense sections) and a labelled region. */
export function Section({
  id,
  labelledBy,
  children,
  className,
  inner,
  dense = false,
}: {
  id?: string;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  inner?: string;
  dense?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={className}>
      <div className={cn("mx-auto max-w-page px-[var(--page-gutter)]", dense ? "py-16" : "py-16 sm:py-20", inner)}>{children}</div>
    </section>
  );
}

/** A section heading: Spectral h1 size on the landing, more space above than below. */
export function SectionHeading({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn("font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-text-primary sm:text-h1", className)}>
      {children}
    </h2>
  );
}
