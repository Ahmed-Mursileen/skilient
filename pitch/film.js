// Timeline: a list of beats. seek(ctx, T) paints global time T (seconds).
// Slide pacing (v2): each beat's own animation runs at 1/k speed (k = shown / authored duration) so every state holds
// longer, and beats crossfade into each other instead of cutting.
import { W, H, C, easeInOutCubic, loadImages } from "./lib.js";
import * as b1 from "./beats/b1-number.js";
import * as b2 from "./beats/b2-gap.js";
import * as b3 from "./beats/b3-scale.js";
import * as b4a from "./beats/b4a-shatter.js";
import * as b4b from "./beats/b4b-signed-cv.js";
import * as b5 from "./beats/b5-why-it-holds.js";
import * as b6a from "./beats/b6a-loop-students.js";
import * as b6b from "./beats/b6b-loop-universities-recruiters.js";
import * as b7 from "./beats/b7-traction.js";
import * as b8 from "./beats/b8-close.js";

const FADE = 0.8; // seconds of crossfade into the next beat

// `show` is the on-screen length in seconds; `fadeNext: false` where the next beat continues the same frame.
export const beats = [
  { name: "The number", show: 18, ...b1 },
  { name: "The gap", show: 26, ...b2 },
  { name: "The scale", show: 20, ...b3 },
  { name: "Shatter", show: 26, ...b4a },
  { name: "Signed CV", show: 26, ...b4b },
  { name: "Why it holds", show: 26, ...b5 },
  { name: "Loop: students", show: 40, fadeNext: false, ...b6a },
  { name: "Loop: universities and recruiters", show: 40, ...b6b },
  { name: "Traction and discovery", show: 30, ...b7 },
  { name: "Close", show: 18, ...b8 },
].map((b) => ({ ...b, k: b.show / b.duration }));

export const TOTAL = beats.reduce((s, b) => s + b.show, 0);

export const beatStarts = (() => {
  let s = 0;
  return beats.map((b) => {
    const r = { name: b.name, start: s, end: s + b.show, k: b.k };
    s += b.show;
    return r;
  });
})();

let off = null;
function offscreen(ctx) {
  const { width, height } = ctx.canvas;
  if (!off || off.canvas.width !== width || off.canvas.height !== height) {
    const canvas = new OffscreenCanvas(width, height);
    off = { canvas, ctx: canvas.getContext("2d") };
  }
  off.ctx.setTransform(ctx.getTransform());
  return off;
}

function paint(ctx, i, g) {
  const b = beats[i];
  b.seek(ctx, Math.min(b.duration, Math.max(0, g / b.k)));
}

export function seek(ctx, T) {
  let i = beats.length - 1;
  for (let j = 0; j < beats.length; j++) {
    if (T < beatStarts[j].end) {
      i = j;
      break;
    }
  }
  const g = Math.max(0, T - beatStarts[i].start);
  paint(ctx, i, g);

  const b = beats[i];
  const fadeStart = b.show - FADE;
  if (i < beats.length - 1 && b.fadeNext !== false && g > fadeStart) {
    const p = easeInOutCubic(Math.min(1, (g - fadeStart) / FADE));
    const o = offscreen(ctx);
    paint(o.ctx, i + 1, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = p;
    ctx.drawImage(o.canvas, 0, 0);
    ctx.restore();
  }
}

export const preload = () => loadImages({ cv: "assets/cv.png", cvFoot: "assets/cv-foot.png", logo: "assets/logo-reversed.svg" });

export { W, H, C };
