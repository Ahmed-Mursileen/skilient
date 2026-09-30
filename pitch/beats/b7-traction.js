// Beat 7 (2:27-2:47): "Traction and discovery". Only what is verified (see claims.md):
//  - Waitlist: 182 unique signups, all from the landing page, no paid acquisition (founder-stated); 63 of 182 (35%, "1 in 3") used a university-style email.
//  - ILO SIYB programme (founder-stated) and four changes Ahmed listed, worded to match what the product actually does.
//  - Build progress: phases 0-5 of 14 complete (docs/build-plan.md).
import { W, H, C, clamp, lerp, easeOutCubic, easeInOutCubic, seg, shuffled } from "../lib.js";

export const duration = 20;

const DOTS = 182;
const UNI = 63;
const COLS = 14;
const uniSet = new Set(shuffled(DOTS, 182).slice(0, UNI));

function text(ctx, str, x, y, font, color, align = "left", alpha = 1, spacing = 0) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function waitlist(ctx, t) {
  const p = easeOutCubic(seg(t, 0.3, 3.0));
  const n = Math.round(DOTS * p);
  text(ctx, String(n), 120, 520, "600 300px Spectral", C.paper);
  const a = easeOutCubic(seg(t, 1.0, 1.7));
  text(ctx, "joined our waitlist.", 120, 620 + (1 - a) * 40, "500 60px Barlow", C.paper, "left", a);
  const b = easeOutCubic(seg(t, 1.8, 2.5));
  text(ctx, "From our landing page. No paid ads.", 120, 700 + (1 - b) * 40, "500 40px Barlow", C.paper, "left", 0.8 * b);

  const gx = 1120;
  const gy = 210;
  const pitch = 40;
  const recolor = easeInOutCubic(seg(t, 3.6, 5.0));
  for (let i = 0; i < DOTS; i++) {
    const cx = gx + (i % COLS) * pitch;
    const cy = gy + Math.floor(i / COLS) * pitch;
    const on = i < n;
    const uni = uniSet.has(i);
    let fill = on ? C.paper : "rgba(244,239,230,0.1)";
    if (on && uni && recolor > 0.5) fill = C.vermillion;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, on && uni && recolor > 0 && recolor < 1 ? 14 : 14 - 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const l = easeOutCubic(seg(t, 4.6, 5.3));
  if (l > 0) {
    ctx.save();
    ctx.globalAlpha *= l;
    ctx.fillStyle = C.vermillion;
    ctx.beginPath();
    ctx.arc(gx + 6, gy + 13 * pitch + 60, 14, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, "1 in 3 used a university email", gx + 36, gy + 13 * pitch + 72, "600 38px Barlow", C.paper);
    ctx.restore();
  }
}

const CHANGES = [
  { text: "Skills are proven by understanding, not claims.", tag: null },
  { text: "Verification designed from 30+ research papers.", tag: null },
  { text: "No likes: a one-tap survey ranks posts on quality.", tag: null },
  { text: "Recruiter feedback dashboard for universities.", tag: "LAUNCHING" },
];

function siyb(ctx, t) {
  const h1 = easeOutCubic(seg(t, 0.0, 0.7));
  ctx.save();
  ctx.beginPath();
  ctx.rect(100, 120, 1700, 160);
  ctx.clip();
  text(ctx, "We took it through ILO’s SIYB programme.", 120, 230 + (1 - h1) * 120, "600 78px Spectral", C.paper);
  ctx.restore();
  const h2 = easeOutCubic(seg(t, 0.7, 1.3));
  text(ctx, "What we changed:", 120, 330, "600 40px Barlow", C.vermillion, "left", h2, 2);
  CHANGES.forEach((c, i) => {
    const at = 1.4 + i * 1.5;
    const p = easeOutCubic(seg(t, at, at + 0.6));
    const y = 450 + i * 110;
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate((1 - p) * 60, 0);
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(120, y - 34, 36 * p, 8);
    text(ctx, c.text, 180, y, "500 50px Barlow", C.paper);
    if (c.tag) {
      ctx.font = "500 50px Barlow";
      const w = ctx.measureText(c.text).width;
      text(ctx, c.tag, 180 + w + 28, y - 6, "600 26px Barlow", C.vermillion, "left", 1, 4);
    }
    ctx.restore();
  });
}

function progress(ctx, t) {
  const a = easeOutCubic(seg(t, 0.0, 0.7));
  text(ctx, "6 of 14", 120, 330, "600 210px Spectral", C.paper, "left", a);
  text(ctx, "build phases complete,", 780, 270, "500 54px Barlow", C.paper, "left", a);
  text(ctx, "built and tested.", 780, 340, "500 54px Barlow", C.paper, "left", a);
  for (let i = 0; i < 14; i++) {
    const p = easeOutCubic(seg(t, 0.6 + i * 0.12, 1.0 + i * 0.12));
    const x = 120 + i * 122;
    ctx.save();
    ctx.globalAlpha *= p;
    if (i < 6) {
      ctx.fillStyle = C.paper;
      ctx.fillRect(x, 470 + (1 - p) * 30, 110, 80);
    } else {
      ctx.strokeStyle = "rgba(244,239,230,0.45)";
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, 472 + (1 - p) * 30, 106, 76);
    }
    ctx.restore();
  }
  const n = easeOutCubic(seg(t, 2.6, 3.3));
  text(ctx, "Identity, projects, social, ranking, signed CV", 120, 640, "500 38px Barlow", C.paper, "left", 0.9 * n);
  const m = easeOutCubic(seg(t, 3.2, 3.9));
  text(ctx, "Next: student, teacher, recruiter and university portals", 120 + 6 * 122, 720, "500 38px Barlow", C.vermillion, "left", m);
}

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  const s1 = 1 - easeInOutCubic(seg(t, 6.4, 7.0));
  const s2in = easeInOutCubic(seg(t, 6.9, 7.5));
  const s2out = easeInOutCubic(seg(t, 14.4, 15.0));
  const s3in = easeInOutCubic(seg(t, 14.9, 15.5));

  if (t < 7.1) {
    ctx.save();
    ctx.globalAlpha = s1;
    waitlist(ctx, t);
    ctx.restore();
  }
  if (t >= 6.9 && t < 15.1) {
    ctx.save();
    ctx.globalAlpha = s2in * (1 - s2out);
    siyb(ctx, t - 7.0);
    ctx.restore();
  }
  if (t >= 14.9) {
    ctx.save();
    ctx.globalAlpha = s3in;
    progress(ctx, t - 15.0);
    ctx.restore();
  }

  // the thread underlines whichever chapter is on screen
  ctx.fillStyle = C.vermillion;
  const ty = 1000;
  const w = t < 7 ? 1680 * easeOutCubic(seg(t, 0.2, 1.2)) : t < 15 ? 1680 * easeOutCubic(seg(t, 7.0, 7.9)) : 1680 * easeOutCubic(seg(t, 15.0, 15.9));
  ctx.fillRect(120, ty, w, 6);
}
