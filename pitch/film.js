// Timeline: a list of beats. seek(ctx, T) paints global time T (seconds).
import { W, H, C } from "./lib.js";
import * as b1 from "./beats/b1-number.js";

function placeholder(title, duration) {
  return {
    duration,
    seek(ctx, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.paper;
      ctx.font = "600 96px Spectral";
      ctx.textAlign = "left";
      ctx.fillText(title, 120, 560);
      ctx.fillStyle = C.vermillion;
      ctx.fillRect(120, 596, 120 + t * 80, 8);
    },
  };
}

export const beats = [
  { name: "The number", ...b1 },
  placeholder("2 The gap", 18),
  placeholder("3 The scale", 18),
  placeholder("4 Proof", 22),
  placeholder("5 The loop", 55),
  placeholder("6 Why it holds", 17),
  placeholder("7 Traction and discovery", 23),
  placeholder("8 Close", 15),
];

export const TOTAL = beats.reduce((s, b) => s + b.duration, 0);

export function seek(ctx, T) {
  let start = 0;
  for (const b of beats) {
    if (T < start + b.duration || b === beats[beats.length - 1]) {
      b.seek(ctx, Math.min(b.duration, Math.max(0, T - start)));
      return;
    }
    start += b.duration;
  }
}

export const beatStarts = (() => {
  let s = 0;
  return beats.map((b) => {
    const r = { start: s, end: s + b.duration };
    s += b.duration;
    return r;
  });
})();
