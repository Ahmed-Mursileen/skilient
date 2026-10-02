import { cn } from "@/lib/cn";

/**
 * The Skilient lockup (brand/, PRD 9.1) in the theme's colours: the ink version in light mode,
 * the reversed one in dark. Plain <img> so the SVG is cached and never inlined twice.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
      <img src="/brand/skilient-logo.svg" alt="Skilient" width={154} height={35} className={cn("dark:hidden", className)} />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
      <img src="/brand/skilient-logo-reversed.svg" alt="Skilient" width={154} height={35} className={cn("hidden dark:block", className)} />
    </>
  );
}
