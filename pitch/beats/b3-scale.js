// Beat 3 (0:30-0:44): "The Scale". Sourced figures only (see claims.md, Market).
//   1.96 million university students, 2023-24 (Pakistan Economic Survey 2025-26, Ch. 10, Table 10.2)
//   Unemployment rate by highest education, 2024-25 (PBS Labour Force Survey, Table 9.7): none 4.7, degree 10.9, degree men 7.0, degree women 24.1
import { W, H, C, clamp, lerp, easeOutCubic, easeInCubic, easeInOutCubic, seg } from "../lib.js";

export const duration = 14;

const DOTS = 196; // 1 dot = 10,000 students -> 1.96 million
const COLS = 14;
const PCT = 22; // px per percentage point

function text(ctx, str, x, y, font, color, align = "left", alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
  ctx.restore();
}

function bar(ctx, x, w, base, pct, grow, color, label, value, valueAlpha = 1) {
  const h = pct * PCT * grow;
  ctx.fillStyle = color;
  ctx.fillRect(x, base - h, w, h);
  text(ctx, (pct * grow).toFixed(1) + "%", x + w / 2, base - h - 22, "600 76px Spectral", C.paper, "center", valueAlpha * clamp(grow * 3));
  text(ctx, label, x + w / 2, base + 52, "600 34px Barlow", C.paper, "center", 0.9 * clamp(grow * 3));
}

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // Crossfade from stage A (enrolment) to stage B (unemployment).
  const scroll = easeInOutCubic(seg(t, 3.7, 4.7));
  const offA = 0;
  const offB = 0;

  // ---- Stage A: 1.96 million
  if (scroll < 1) {
    ctx.save();
    ctx.translate(0, offA);
    ctx.globalAlpha = 1 - scroll;
    const rule = easeOutCubic(seg(t, 0.0, 0.9));
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(960 - 840 * rule, 712, 1680 * rule, 8);

    const p = easeOutCubic(seg(t, 0.5, 3.3));
    text(ctx, (1.96 * p).toFixed(2), 120, 620, "600 340px Spectral", C.paper);
    ctx.font = "600 340px Spectral";
    const nw = ctx.measureText((1.96 * p).toFixed(2)).width;
    text(ctx, "million", 120 + nw + 36, 620, "500 120px Spectral", C.paper, "left", clamp((t - 0.9) / 0.5));

    const a = easeOutCubic(seg(t, 1.1, 1.9));
    text(ctx, "students in Pakistani universities", 120, 820 + (1 - a) * 40, "500 64px Barlow", C.paper, "left", a);
    text(ctx, "2023–24", 120, 890 + (1 - a) * 40, "500 40px Barlow", C.paper, "left", 0.7 * a);
    text(ctx, "Source: Pakistan Economic Survey 2025-26, Ch. 10 (Finance Division), Table 10.2", 120, 1016, "400 26px Barlow", C.paper, "left", 0.6 * a);

    // 196 dots, one per 10,000 students, fill with the count.
    const n = Math.floor(DOTS * p);
    const pitch = 28;
    const gx = 1420;
    const gy = 250;
    for (let i = 0; i < DOTS; i++) {
      const cx = gx + (i % COLS) * pitch;
      const cy = gy + Math.floor(i / COLS) * pitch;
      ctx.fillStyle = i < n ? C.paper : "rgba(244,239,230,0.12)";
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, "1 dot = 10,000 students", gx - 9 + 14 * pitch - 28 + 9, gy + 14 * pitch + 44, "500 26px Barlow", C.paper, "right", 0.7 * a);
    ctx.restore();
  }

  // ---- Stage B: unemployment by education
  if (scroll > 0) {
    ctx.save();
    ctx.translate(0, offB);
    ctx.globalAlpha = scroll;
    const base = 880;
    const exit = easeInOutCubic(seg(t, 12.3, 13.5));
    const fadeB = 1 - seg(t, 12.2, 12.9);

    text(ctx, "Unemployment rate, 2024-25", 120, 190, "600 52px Barlow", C.paper, "left", fadeB);
    text(ctx, "Unemployed share of the labour force, by highest level of education", 120, 240, "400 30px Barlow", C.paper, "left", 0.7 * fadeB);

    const gA = easeOutCubic(seg(t, 5.0, 6.0)) * (1 - easeInCubic(seg(t, 12.2, 13.0)));
    const gB = easeOutCubic(seg(t, 6.2, 7.2)) * (1 - easeInCubic(seg(t, 12.2, 13.0)));
    const split = easeInOutCubic(seg(t, 8.8, 9.8));
    const gMen = easeOutCubic(seg(t, 9.2, 10.0)) * (1 - easeInCubic(seg(t, 12.2, 13.0)));
    const gWom = easeOutCubic(seg(t, 9.6, 10.8)) * (1 - easeInCubic(seg(t, 12.2, 13.0)));

    bar(ctx, 300, 240, base, 4.7, gA, C.paper, "No education", 4.7, fadeB);
    // Degree bar: full until the split, then it becomes an outline.
    if (t < 9.6) {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * (1 - split);
      bar(ctx, 680, 240, base, 10.9, gB, C.paper, "Degree", 10.9, fadeB);
      ctx.globalAlpha = a0;
    } else if (gB > 0.02) {
      const hh = 10.9 * PCT * gB;
      ctx.strokeStyle = "rgba(244,239,230,0.45)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(680 + 1.5, base - hh, 240 - 3, hh);
      ctx.setLineDash([]);
      text(ctx, "Degree", 800, base + 52, "600 34px Barlow", C.paper, "center", 0.9 * fadeB);
      text(ctx, "10.9%", 800, base - hh - 22, "600 76px Spectral", C.paper, "center", 0.55 * fadeB);
    }
    if (gMen > 0) bar(ctx, 1060, 240, base, 7.0, gMen, C.paper, "Degree, men", 7.0, fadeB);
    if (gWom > 0) bar(ctx, 1380, 240, base, 24.1, gWom, C.vermillion, "Degree, women", 24.1, fadeB);

    // "More than twice": a vermillion guide from the no-education top across to the degree bar.
    const tw = easeOutCubic(seg(t, 7.5, 8.3)) * (1 - seg(t, 8.8, 9.4));
    if (tw > 0) {
      const y1 = base - 4.7 * PCT;
      const y2 = base - 10.9 * PCT;
      ctx.fillStyle = C.vermillion;
      ctx.fillRect(540, y1 - 2, 140 * tw, 4);
      ctx.fillRect(680, y2 - 2 + 0, 0, 4);
      text(ctx, "2.3×", 610, y1 - 90, "600 64px Spectral", C.vermillion, "center", tw);
    }

    text(ctx, "Source: Pakistan Bureau of Statistics, Labour Force Survey 2024-25, Table 9.7 (19th ICLS)", 120, 1016, "400 26px Barlow", C.paper, "left", 0.6 * fadeB);

    // Baseline: the thread. On exit it contracts to a dot at the centre for the next beat.
    const by = lerp(base, 540, exit);
    const bw = lerp(1680, 20, exit);
    const bin = easeOutCubic(seg(t, 4.6, 5.2));
    ctx.fillStyle = C.vermillion;
    if (exit < 1) ctx.fillRect(960 - (bw / 2) * bin, by - 4, bw * bin, 8);
    if (exit >= 1) {
      ctx.beginPath();
      ctx.arc(960, 540, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
