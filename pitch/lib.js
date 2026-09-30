// Shared helpers. Everything is a pure function of time.
export const W = 1920;
export const H = 1080;
export const C = { ink: "#0E0D0B", paper: "#F4EFE6", vermillion: "#C03910" };

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
// progress of t within [a, b], clamped
export const seg = (t, a, b) => clamp((t - a) / (b - a));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(n, seed) {
  const rnd = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Preloaded images (drawImage needs decoded bitmaps; loaded once before the first frame).
export const images = {};
export async function loadImages(map) {
  await Promise.all(
    Object.entries(map).map(async ([key, src]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      images[key] = img;
    }),
  );
}
