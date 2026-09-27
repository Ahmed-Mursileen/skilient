/** Motion tokens (PRD 9.4) for framer-motion. No bounce, no spring. */
export const easing = {
  standard: [0.4, 0, 0.2, 1],
  decelerate: [0, 0, 0.2, 1],
  accelerate: [0.4, 0, 1, 1],
  sharp: [0.4, 0, 0.6, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Durations in seconds (framer-motion units). */
export const duration = {
  instant: 0,
  fast: 0.12,
  base: 0.2,
  slow: 0.3,
  stamp: 0.5,
} as const;
