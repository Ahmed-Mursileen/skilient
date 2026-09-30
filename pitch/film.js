// Timeline: a list of beats. seek(ctx, T) paints global time T (seconds).
import { W, H, C, loadImages } from "./lib.js";
import * as b1 from "./beats/b1-number.js";
import * as b2 from "./beats/b2-gap.js";
import * as b3 from "./beats/b3-scale.js";
import * as b4a from "./beats/b4a-shatter.js";
import * as b4b from "./beats/b4b-signed-cv.js";
import * as b5 from "./beats/b5-why-it-holds.js";

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
  { name: "The gap", ...b2 },
  { name: "The scale", ...b3 },
  { name: "Shatter", ...b4a },
  { name: "Signed CV", ...b4b },
  { name: "Why it holds", ...b5 },
  placeholder("6a Loop: students", 28),
  placeholder("6b Loop: universities and recruiters", 27),
  placeholder("7 Traction and discovery", 20),
  placeholder("8 Close", 13),
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

export const preload = () => loadImages({ cv: "assets/cv.png", cvFoot: "assets/cv-foot.png" });
