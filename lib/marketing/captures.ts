import manifest from "@/content/captures.json";

/**
 * Real product captures for the marketing pages (docs/marketing-design-plan.md B5). Made by
 * `pnpm marketing:captures` from the built app on the local stack with fictional sample content;
 * never generated art. Sizes are CSS pixels of the captured element; files are 2x.
 */

export interface CaptureFile {
  /** CSS pixel size of the captured element. */
  w: number;
  h: number;
  light: { avif: string; webp: string };
  dark: { avif: string; webp: string };
}

/** A box inside a capture, in CSS pixels from its top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroCaptures {
  /** Width of the phone screen the captures were taken at. */
  screen: number;
  top: CaptureFile;
  postB: CaptureFile;
  /** Post A with the survey strip, before the tick. */
  postABefore: CaptureFile;
  /** Post A answered, its public line reading 12. */
  postAAfter: CaptureFile;
  /** The public line in postAAfter, and the two crops that roll there ("11 people...", then "12 people..."). */
  line: Box;
  lineBefore: CaptureFile;
  lineAfter: CaptureFile;
  /** Centre of the tick button in postABefore. */
  tick: { x: number; y: number };
}

export interface SectionCaptures {
  venture: CaptureFile;
  jobs: CaptureFile;
  contactRequest: CaptureFile;
}

export interface CaptureManifest {
  hero: HeroCaptures;
  sections: SectionCaptures;
}

export const captures = manifest as CaptureManifest;
