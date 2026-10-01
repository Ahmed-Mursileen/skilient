// Beat 6b (2:00-2:27): "The loop, universities and recruiters". The hand-off from 6a arrives mid-loop.
// Everything here is designed in the PRD but NOT built yet (5.20 recruiter portal, 5.23 university portal), so both nodes carry "LAUNCHING".
//  - Universities: analytics by department, groups of 5+ only (5.23)
//  - Recruiters: search by verified skill level, tier, code check; contact; hire (5.20)
//  - 90 days after a hire the recruiter answers one question; aggregate only into university placement stats (5.20)
//  - A completed hire counts toward the Luminary tier (5.17 requirements)
import { W, H, C, clamp, lerp, easeOutCubic, easeInOutCubic, seg } from "../lib.js";
import { RC, NODE, ring, node, thread, text, TAU } from "./loop.js";

export const duration = 27;

const cx = RC.x;
const cy = RC.y;
const S = NODE.students.angle;
const U = NODE.universities.angle;
const R = NODE.recruiters.angle;

const STAGES = [
  { at: 0.8, len: 4.4, title: ["Universities see", "real capability."], sub: "Beyond a CGPA, by department." },
  { at: 7.2, len: 4.4, title: ["Recruiters search", "by verified proof."], sub: "Skill level, tier, code check." },
  { at: 11.8, len: 4.0, title: ["They hire, then", "report back."], sub: "90 days later, one question." },
  { at: 18.2, len: 4.6, title: ["Every outcome", "flows back."], sub: "Each side validates the next." },
];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function uniPanel(ctx, t) {
  const x = cx - 250;
  const y = cy - 175;
  ctx.fillStyle = "rgba(244,239,230,0.1)";
  ctx.fillRect(x, y, 500, 340);
  text(ctx, "DEPARTMENTS", x + 30, y + 52, "600 24px Barlow", C.paper, "left", 0.6, 6);
  const widths = [0.82, 0.64, 0.9, 0.48];
  widths.forEach((w, i) => {
    const a = easeOutCubic(seg(t, 0.3 + i * 0.25, 1.2 + i * 0.25));
    const ry = y + 92 + i * 52;
    ctx.fillStyle = "rgba(244,239,230,0.55)";
    ctx.fillRect(x + 30, ry, 110, 18);
    ctx.fillStyle = "rgba(244,239,230,0.14)";
    ctx.fillRect(x + 160, ry - 4, 310, 26);
    ctx.fillStyle = i === 2 ? C.vermillion : C.paper;
    ctx.fillRect(x + 160, ry - 4, 310 * w * a, 26);
  });
  text(ctx, "Verified skills by department", x + 30, y + 322, "500 28px Barlow", C.paper, "left", 0.75 * easeOutCubic(seg(t, 1.6, 2.2)));
  text(ctx, "Groups of 5 or more only", x + 30, y + 362, "500 28px Barlow", C.paper, "left", 0.6 * easeOutCubic(seg(t, 2.2, 2.8)));
}

function searchPanel(ctx, t) {
  const x = cx - 250;
  const y = cy - 205;
  const bar = easeOutCubic(seg(t, 0.1, 0.6));
  ctx.fillStyle = "rgba(244,239,230,0.12)";
  ctx.fillRect(x, y, 500 * bar, 60);
  text(ctx, "Skill: React, level 3 or above", x + 24, y + 40, "500 30px Barlow", C.paper, "left", bar);
  ["Has code check", "Tier: Flare+"].forEach((c, i) => {
    const a = easeOutCubic(seg(t, 0.7 + i * 0.25, 1.1 + i * 0.25));
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.strokeStyle = C.vermillion;
    ctx.lineWidth = 4;
    rr(ctx, x + i * 230, y + 84, 210, 46, 23);
    ctx.stroke();
    text(ctx, c, x + i * 230 + 105, y + 116, "600 26px Barlow", C.paper, "center");
    ctx.restore();
  });
  ["Flare", "Shine", "Flare"].forEach((tier, i) => {
    const a = easeOutCubic(seg(t, 1.5 + i * 0.3, 2.0 + i * 0.3));
    const ry = y + 150 + i * 84;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate((1 - a) * 40, 0);
    ctx.fillStyle = "rgba(244,239,230,0.1)";
    ctx.fillRect(x, ry, 500, 70);
    ctx.fillStyle = "rgba(244,239,230,0.6)";
    ctx.fillRect(x + 24, ry + 14, 200, 20);
    ctx.fillStyle = "rgba(244,239,230,0.28)";
    ctx.fillRect(x + 24, ry + 44, 320, 12);
    ctx.strokeStyle = "rgba(244,239,230,0.6)";
    ctx.lineWidth = 3;
    rr(ctx, x + 380, ry + 12, 96, 44, 22);
    ctx.stroke();
    text(ctx, tier, x + 428, ry + 42, "600 24px Barlow", C.paper, "center", 0.9);
    ctx.restore();
  });
  text(ctx, "Never ordered by payment", x, y + 420, "500 28px Barlow", C.paper, "left", 0.7 * easeOutCubic(seg(t, 2.8, 3.4)));
}

function hireCard(ctx, t) {
  const x = cx - 250;
  const y = cy - 140;
  const a = easeOutCubic(seg(t, 0.1, 0.6));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = "rgba(244,239,230,0.1)";
  ctx.fillRect(x, y, 500, 300);
  text(ctx, "90 DAYS AFTER THE HIRE", x + 30, y + 52, "600 24px Barlow", C.paper, "left", 0.6, 5);
  text(ctx, "Is this hire meeting", x + 30, y + 120, "600 44px Spectral", C.paper);
  text(ctx, "expectations?", x + 30, y + 172, "600 44px Spectral", C.paper);
  ["Yes", "Partly", "No", "Left"].forEach((o, i) => {
    const px = x + 30 + i * 112;
    const sel = i === 0 && t > 2.0;
    ctx.fillStyle = sel ? C.paper : "transparent";
    rr(ctx, px, y + 210, 100, 52, 26);
    ctx.fill();
    ctx.strokeStyle = sel ? C.paper : "rgba(244,239,230,0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, o, px + 50, y + 245, "600 26px Barlow", sel ? C.ink : C.paper, "center");
  });
  ctx.restore();
}

function flowPanel(ctx, t) {
  const x = cx - 260;
  const y = cy - 160;
  const chip = easeOutCubic(seg(t, 0.1, 0.6));
  ctx.save();
  ctx.globalAlpha *= chip;
  ctx.fillStyle = C.paper;
  rr(ctx, x, y, 240, 64, 32);
  ctx.fill();
  text(ctx, "Hire recorded", x + 120, y + 42, "600 30px Barlow", C.ink, "center");
  ctx.restore();
  const rows = [
    { label: "Student", detail: "counts toward Luminary", at: 1.0 },
    { label: "University", detail: "aggregate stats only", at: 2.0 },
  ];
  rows.forEach((r, i) => {
    const a = easeOutCubic(seg(t, r.at, r.at + 0.6));
    const ry = y + 140 + i * 120;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.strokeStyle = C.vermillion;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 40, y + 64);
    ctx.lineTo(x + 40, ry + 24);
    ctx.lineTo(x + 40 + 70 * a, ry + 24);
    ctx.stroke();
    text(ctx, r.label, x + 130, ry + 36, "600 40px Spectral", C.paper);
    text(ctx, r.detail, x + 130, ry + 76, "500 28px Barlow", C.paper, "left", 0.8);
    ctx.restore();
  });
}

const GRAPHICS = [uniPanel, searchPanel, hireCard, flowPanel];

// Slide pacing: one slow closing lap (4 s authored, about 6 s on screen), not three speeding ones.
function lapFraction(t) {
  const laps = [4.0];
  let acc = 0;
  let frac = 0;
  for (const d of laps) {
    const p = clamp((t - acc) / d);
    frac += p;
    acc += d;
  }
  return frac;
}

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  ring(ctx, -Math.PI / 2, -Math.PI / 2 + TAU, C.paper, 4, 0.28);

  // Continuity from 6a: the thread has already reached Universities.
  const toU = 1;
  const toR = easeInOutCubic(seg(t, 5.4, 7.0));
  const toS = easeInOutCubic(seg(t, 16.0, 17.8));
  const laps = t >= 22.6 ? lapFraction(t - 22.6) : 0;

  if (laps <= 0) {
    ring(ctx, S, U, C.vermillion, 10, toU);
    if (toR > 0) ring(ctx, U, R, C.vermillion, 10, 1);
    if (toR > 0 && toR < 1) thread(ctx, U, R, toR);
    if (toR >= 1) thread(ctx, U, R, 1);
    if (toS > 0) thread(ctx, R, S + TAU, toS);
    if (toR <= 0) thread(ctx, S, U, 1);
  }
  // Redraw vermillion only up to the current progress so later arcs don't appear early.
  ctx.save();
  ctx.restore();

  // Closing lap: the thread circulates once and the ring fills.
  if (laps > 0) {
    const a = clamp(laps);
    ring(ctx, -Math.PI / 2, -Math.PI / 2 + TAU, C.vermillion, 10, 0.35 + 0.65 * a);
    const head = -Math.PI / 2 + TAU * laps;
    const hx = RC.x + Math.cos(head) * RC.r;
    const hy = RC.y + Math.sin(head) * RC.r;
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, TAU);
    ctx.fill();
  }

  const litU = 1;
  const litR = easeOutCubic(seg(t, 6.6, 7.2));
  const litS = t > 17.4 ? 1 : 0.5 + 0.5 * 0;
  node(ctx, "students", t > 17.4 ? easeOutCubic(seg(t, 17.4, 18)) * 0.5 + 0.5 : 1, null, t > 17.4 ? seg(t, 17.4, 18.2) : 0);
  node(ctx, "universities", litU, "LAUNCHING", 0);
  node(ctx, "recruiters", litR, "LAUNCHING", litR > 0 && litR < 1 ? litR : 0);
  void litS;

  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i];
    const lt = t - s.at;
    if (lt < -0.05 || lt > s.len + 0.05) continue;
    const inP = easeOutCubic(seg(lt, 0.0, 0.6));
    const outP = easeInOutCubic(seg(lt, s.len - 0.5, s.len));
    s.title.forEach((ln, k) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(100, 300 + k * 92, 700, 125);
      ctx.clip();
      const p = easeOutCubic(seg(lt, 0.05 + k * 0.12, 0.65 + k * 0.12));
      text(ctx, ln, 120, 380 + k * 92 + (1 - p) * 90, "600 72px Spectral", C.paper, "left", 1 - outP);
      ctx.restore();
    });
    const sp = easeOutCubic(seg(lt, 0.5, 1.0));
    ctx.save();
    ctx.globalAlpha = 1 - outP;
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(120, 520, 120 * sp, 7);
    ctx.restore();
    text(ctx, s.sub, 120, 580, "500 36px Barlow", C.paper, "left", 0.85 * sp * (1 - outP));
    ctx.save();
    ctx.globalAlpha = inP * (1 - outP);
    ctx.translate(0, (1 - inP) * 30);
    GRAPHICS[i](ctx, Math.max(0, lt));
    ctx.restore();
  }

  // Close: the loop, closed. Hold the ring solid with one line at its centre.
  const fin = easeOutCubic(seg(t, 24.4, 25.4));
  if (fin > 0) {
    text(ctx, "Proof that travels.", cx, cy + 18, "600 64px Spectral", C.paper, "center", fin);
  }
}
