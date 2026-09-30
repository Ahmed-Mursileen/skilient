// Beat 1 (0:00-0:12): "The Number". One CGPA, slammed, then revealed as one of a thousand identical CVs, all stamped.
import { W, H, C, clamp, lerp, easeOutCubic, easeInOutCubic, seg, mulberry32, shuffled } from "../lib.js";

export const duration = 12;

const COLS = 45;
const ROWS = 29;
const CW = 800;
const CH = 1100;
const PX = CW + 60;
const PY = CH + 60;
const HC = 22;
const HR = 14;
const N = COLS * ROWS;
const HOOK = HR * COLS + HC;

const rank = shuffled(N, 341);
const rot = (() => {
  const r = mulberry32(99);
  return Array.from({ length: N }, () => (r() - 0.5) * 0.44);
})();

const STAMP_START = 3.4;
const STAMP_END = 8.6;
const stampTime = (i) => {
  if (i === HOOK) return 2.4;
  const k = rank[i] / N;
  return STAMP_START + (STAMP_END - STAMP_START) * Math.pow(k, 0.55);
};

function camera(t) {
  const z0 = 2.1;
  const zHold = z0 * (1 + 0.05 * clamp(t / 3));
  const p = easeInOutCubic(seg(t, 3.0, 8.4));
  const z = t < 3.0 ? zHold : Math.exp(lerp(Math.log(zHold * (1 + 0)), Math.log(0.058), p));
  const cx0 = HC * PX + CW / 2;
  const cy0 = HR * PY + 350;
  const cxg = (COLS * PX - 60) / 2;
  const cyg = (ROWS * PY - 60) / 2;
  return { z, cx: lerp(cx0, cxg, p), cy: lerp(cy0, cyg, p) };
}

function shake(t) {
  const a = seg(t, 2.4, 2.75);
  if (a <= 0 || a >= 1) return [0, 0];
  const amp = 26 * Math.pow(1 - a, 2);
  return [Math.sin(a * 61) * amp, Math.cos(a * 47) * amp * 0.7];
}

function stamp(ctx, x, y, z, t0, t, rotation, big) {
  const a = clamp((t - t0) / (big ? 0.12 : 0.14));
  if (a <= 0) return;
  const s = 1 + (big ? 0.9 : 0.7) * (1 - easeOutCubic(a));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(s * z, s * z);
  ctx.globalAlpha = 0.94 * a;
  ctx.strokeStyle = C.vermillion;
  ctx.fillStyle = C.vermillion;
  ctx.lineWidth = 14;
  ctx.strokeRect(-300, -82, 600, 164);
  ctx.font = "600 104px Barlow";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "10px";
  ctx.fillText("REJECTED", 5, 36);
  ctx.restore();
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  const { z, cx, cy } = camera(t);
  const [shx, shy] = shake(t);
  const sx = (wx) => W / 2 + (wx - cx) * z + shx;
  const sy = (wy) => H / 2 + (wy - cy) * z + shy;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = sx(c * PX);
      const y0 = sy(r * PY);
      const w = CW * z;
      const h = CH * z;
      if (x0 > W || y0 > H || x0 + w < 0 || y0 + h < 0) continue;
      const i = r * COLS + c;

      ctx.fillStyle = C.paper;
      ctx.fillRect(x0, y0, w, h);

      ctx.fillStyle = C.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const fs = 220 * z;
      ctx.font = `600 ${fs}px Spectral`;
      ctx.fillText("3.41", x0 + (CW / 2) * z, y0 + 300 * z + fs * 0.33);

      if (z > 0.1) {
        ctx.globalAlpha = 0.86;
        ctx.fillRect(x0 + 70 * z, y0 + 700 * z, 420 * z, 26 * z);
        ctx.globalAlpha = 0.16;
        const widths = [660, 600, 640, 420];
        for (let k = 0; k < widths.length; k++) {
          ctx.fillRect(x0 + 70 * z, y0 + (790 + k * 62) * z, widths[k] * z, 22 * z);
        }
        ctx.globalAlpha = 1;
      }

      if (i === HOOK) {
        const rule = easeInOutCubic(seg(t, 1.0, 1.6));
        if (rule > 0) {
          ctx.fillStyle = C.vermillion;
          ctx.fillRect(x0 + 210 * z, y0 + 395 * z, 380 * rule * z, 9 * z);
        }
      }

      const ts = stampTime(i);
      if (t > ts) {
        stamp(ctx, x0 + (CW / 2) * z, y0 + 500 * z, 1 * z, ts, t, i === HOOK ? -0.13 : rot[i], i === HOOK);
      }
    }
  }

  // Line 1: dim the wall, wipe a slab in, set the sentence.
  const dim = seg(t, 8.9, 9.6);
  if (dim > 0) {
    ctx.fillStyle = `rgba(14,13,11,${0.62 * easeOutCubic(dim)})`;
    ctx.fillRect(0, 0, W, H);
  }
  const slab = easeInOutCubic(seg(t, 9.0, 9.7));
  if (slab > 0) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 330, W * slab, 420);
  }
  const l1 = easeOutCubic(seg(t, 9.5, 10.1));
  const l2 = easeOutCubic(seg(t, 10.2, 10.8));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "600 150px Spectral";
  ctx.fillStyle = C.paper;
  if (l1 > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 330, W, 210);
    ctx.clip();
    ctx.fillText("Same number.", 120, 500 + (1 - l1) * 170);
    ctx.restore();
  }
  if (l2 > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 540, W, 210);
    ctx.clip();
    ctx.fillText("Different people.", 120, 690 + (1 - l2) * 170);
    ctx.restore();
  }

  // The thread: a vermillion rule drawn under line 2 and carried off-frame to beat 2.
  const line = easeInOutCubic(seg(t, 10.9, 11.7));
  const carry = easeInOutCubic(seg(t, 11.5, 12));
  if (line > 0) {
    ctx.fillStyle = C.vermillion;
    const x1 = 120 + 1130 * line + (W - 1250) * carry;
    const xStart = 120 + (W + 40) * carry;
    ctx.fillRect(Math.min(xStart, x1), 716, Math.max(0, x1 - xStart), 10);
  }
}
