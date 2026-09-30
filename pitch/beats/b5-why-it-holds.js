// Beat 5 (1:16-1:32): "Why it holds". Four rules, each with the mechanism behind it. All four are built and tested:
//  1. Code check: three fixed questions, graded by a human, no AI generates questions or grades (PRD 5.5)
//  2. No likes; the micro-survey replaces them and feeds ranking (PRD 5.28, feed_score)
//  3. Money never buys rank or visibility (PRD 4a hard rules); boards show rank and tier
//  4. Row-level security on every table; a test fails if one is missing (pgTAP 00_rls_everywhere)
import { W, H, C, clamp, lerp, easeOutCubic, easeInOutCubic, easeOutBack, seg } from "../lib.js";

export const duration = 16;
const CARD = 4;
const GX = 1040;

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

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function check(ctx, cx, cy, s, p, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, s * 0.16);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts = [[cx - s * 0.5, cy + s * 0.02], [cx - s * 0.12, cy + s * 0.4], [cx + s * 0.55, cy - s * 0.4]];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  const f = p * 2;
  const a = clamp(f);
  ctx.lineTo(lerp(pts[0][0], pts[1][0], a), lerp(pts[0][1], pts[1][1], a));
  if (f > 1) {
    const b = clamp(f - 1);
    ctx.lineTo(lerp(pts[1][0], pts[2][0], b), lerp(pts[1][1], pts[2][1], b));
  }
  ctx.stroke();
  ctx.restore();
}

function cross(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, s * 0.16);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.4, cy - s * 0.4);
  ctx.lineTo(cx + s * 0.4, cy + s * 0.4);
  ctx.moveTo(cx + s * 0.4, cy - s * 0.4);
  ctx.lineTo(cx - s * 0.4, cy + s * 0.4);
  ctx.stroke();
  ctx.restore();
}

function heart(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.45);
  ctx.bezierCurveTo(cx - s * 1.0, cy - s * 0.1, cx - s * 0.5, cy - s * 0.8, cx, cy - s * 0.25);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.8, cx + s * 1.0, cy - s * 0.1, cx, cy + s * 0.45);
  ctx.stroke();
  ctx.restore();
}

function lock(ctx, cx, cy, s, closed, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(3, s * 0.12);
  ctx.lineCap = "round";
  // shackle lifts and swings open when closed < 1
  const lift = (1 - closed) * s * 0.28;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.05 - lift, s * 0.26, Math.PI, 0);
  ctx.lineTo(cx + s * 0.26, cy + s * 0.05 - lift * (closed < 1 ? 0.2 : 1));
  ctx.stroke();
  rr(ctx, cx - s * 0.36, cy + s * 0.02, s * 0.72, s * 0.52, 5);
  ctx.fill();
  ctx.restore();
}

// ---- Card 1: code check
function card1(ctx, t) {
  const l1 = easeOutCubic(seg(t, 0.1, 0.7));
  const l2 = easeOutCubic(seg(t, 0.3, 0.9));
  statement(ctx, ["No AI", "grades anyone."], [l1, l2], "Tested on your own work, by a person.");
  const a = easeOutCubic(seg(t, 0.6, 1.2));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate((1 - a) * 60, 0);
  ctx.fillStyle = "rgba(244,239,230,0.08)";
  ctx.fillRect(GX, 200, 740, 640);
  text(ctx, "CODE CHECK", GX + 40, 264, "600 26px Barlow", C.paper, "left", 0.6, 6);
  const qs = ["What does it do?", "Why is it written this way?", "How would you change it?"];
  qs.forEach((q, i) => {
    const y = 380 + i * 130;
    text(ctx, q, GX + 120, y + 12, "500 40px Barlow", C.paper);
    ctx.strokeStyle = "rgba(244,239,230,0.4)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(GX + 70, y, 28, 0, Math.PI * 2);
    ctx.stroke();
    const p = seg(t, 1.3 + i * 0.5, 1.8 + i * 0.5);
    if (p > 0) check(ctx, GX + 70, y, 44, p, C.vermillion);
  });
  text(ctx, "Graded by a person,", GX + 40, 770, "500 30px Barlow", C.paper, "left", 0.85);
  text(ctx, "against a rubric. One attempt per skill every 30 days.", GX + 40, 810, "500 30px Barlow", C.paper, "left", 0.85);
  ctx.restore();
}

// ---- Card 2: no likes, the micro-survey
function card2(ctx, t) {
  statement(ctx, ["No likes."], [easeOutCubic(seg(t, 0.1, 0.7))], "Posts rise on quality, not taps.");
  const a = easeOutCubic(seg(t, 0.6, 1.2));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate((1 - a) * 60, 0);
  ctx.fillStyle = "rgba(244,239,230,0.08)";
  ctx.fillRect(GX, 150, 740, 420);
  ctx.fillStyle = "rgba(244,239,230,0.5)";
  ctx.beginPath();
  ctx.arc(GX + 70, 220, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(244,239,230,0.75)";
  ctx.fillRect(GX + 120, 208, 240, 20);
  [560, 640, 420].forEach((w, i) => {
    ctx.fillStyle = "rgba(244,239,230,0.3)";
    ctx.fillRect(GX + 40, 290 + i * 54, w, 22);
  });
  // heart, struck out
  const hp = easeOutCubic(seg(t, 0.9, 1.3));
  heart(ctx, GX + 660, 220, 46, "rgba(244,239,230,0.55)");
  ctx.strokeStyle = C.vermillion;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(GX + 620, 190);
  ctx.lineTo(GX + 620 + 80 * hp, 190 + 60 * hp);
  ctx.stroke();
  ctx.restore();

  const s = easeOutCubic(seg(t, 1.3, 1.9));
  if (s > 0) {
    ctx.save();
    ctx.globalAlpha *= s;
    ctx.translate(0, (1 - s) * 40);
    ctx.fillStyle = "rgba(244,239,230,0.14)";
    ctx.fillRect(GX, 600, 740, 130);
    text(ctx, "Did you learn something from this?", GX + 30, 678, "500 34px Barlow", C.paper);
    const press = easeOutCubic(seg(t, 2.3, 2.5));
    // tick and cross buttons
    ctx.fillStyle = press > 0 ? C.paper : "transparent";
    rr(ctx, GX + 560, 622, 84, 84, 10);
    ctx.fill();
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = 4;
    ctx.stroke();
    check(ctx, GX + 602, 664, 44, 1, press > 0 ? C.ink : C.paper);
    rr(ctx, GX + 656, 622, 84, 84, 10);
    ctx.stroke();
    cross(ctx, GX + 698, 664, 44, C.paper);
    const n = t >= 2.4 ? 13 : 12;
    text(ctx, `${n} people find this informative`, GX + 30, 790, "500 36px Barlow", C.paper, "left", 0.95);
    text(ctx, "Sample post", GX + 30, 834, "400 26px Barlow", C.paper, "left", 0.55);
    ctx.restore();
  }
}

// ---- Card 3: money never buys rank
const TIERS = ["Luminary", "Radiant", "Shine", "Flare", "Spark", "Raw"];
function card3(ctx, t) {
  statement(ctx, ["Money never", "buys rank."], [easeOutCubic(seg(t, 0.1, 0.7)), easeOutCubic(seg(t, 0.3, 0.9))], "Rank and tier come from verified work.");
  const a = easeOutCubic(seg(t, 0.5, 1.1));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate((1 - a) * 60, 0);
  const target = 3; // the row the coin tries to lift
  const impact = 1.7;
  const shake = t > impact && t < impact + 0.5 ? Math.sin((t - impact) * 70) * 10 * (1 - (t - impact) / 0.5) : 0;
  for (let i = 0; i < 6; i++) {
    const y = 190 + i * 110;
    const dx = i === target ? shake : 0;
    ctx.fillStyle = i === target ? "rgba(244,239,230,0.16)" : "rgba(244,239,230,0.08)";
    ctx.fillRect(GX + dx, y, 740, 92);
    text(ctx, String(i + 1), GX + dx + 40, y + 64, "600 52px Spectral", C.paper);
    ctx.fillStyle = "rgba(244,239,230,0.6)";
    ctx.fillRect(GX + dx + 110, y + 34, 240 + ((i * 53) % 90), 22);
    ctx.strokeStyle = "rgba(244,239,230,0.6)";
    ctx.lineWidth = 3;
    rr(ctx, GX + dx + 560, y + 22, 150, 48, 24);
    ctx.stroke();
    text(ctx, TIERS[i], GX + dx + 635, y + 57, "600 26px Barlow", C.paper, "center", 0.9);
  }
  // coin: drops onto row 4, row shakes and stays put, coin rolls off and falls away.
  const drop = seg(t, 1.0, impact);
  const roll = seg(t, impact + 0.2, impact + 1.3);
  if (t > 1.0 && roll < 1) {
    const ty = 190 + target * 110 + 46;
    let cx = GX + 360;
    let cy = lerp(60, ty, drop * drop);
    if (t > impact) {
      const b = t - impact;
      cy = ty - Math.abs(Math.sin(b * 9)) * 70 * Math.exp(-b * 2.5);
    }
    if (roll > 0) {
      cx += roll * 520;
      cy = ty + 0.5 * 2800 * Math.pow(Math.max(0, roll - 0.35) * 1.1, 2);
    }
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 27, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, "Rs", cx, cy + 10, "600 28px Barlow", C.ink, "center");
  }
  ctx.restore();
  // vermillion bar holds the row in place
  const hold = easeOutCubic(seg(t, impact, impact + 0.3));
  if (hold > 0) {
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(GX - 14, 190 + target * 110, 8, 92 * hold);
  }
}

// ---- Card 4: locked by default
function card4(ctx, t) {
  statement(ctx, ["Locked", "by default."], [easeOutCubic(seg(t, 0.1, 0.7)), easeOutCubic(seg(t, 0.3, 0.9))], "Row-level security on every table.");
  const a = easeOutCubic(seg(t, 0.4, 1.0));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate((1 - a) * 60, 0);
  const COLS = 6;
  const OPEN = 17;
  for (let i = 0; i < 24; i++) {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    const x = GX + c * 124;
    const y = 200 + r * 106;
    ctx.fillStyle = "rgba(244,239,230,0.08)";
    ctx.fillRect(x, y, 110, 92);
    ctx.fillStyle = "rgba(244,239,230,0.25)";
    ctx.fillRect(x + 14, y + 14, 50, 8);
    ctx.fillRect(x + 14, y + 30, 70, 8);
    const at = 0.7 + i * 0.05;
    const p = i === OPEN ? (t < 2.9 ? 0 : easeOutBack(seg(t, 2.9, 3.3))) : easeOutBack(seg(t, at, at + 0.3));
    const color = i === OPEN && t >= 1.8 && t < 3.1 ? C.vermillion : C.paper;
    lock(ctx, x + 55, y + 50, 46, clamp(p), color);
  }
  // the test
  const tp = easeOutCubic(seg(t, 1.6, 2.1));
  ctx.save();
  ctx.globalAlpha *= tp;
  text(ctx, "Test: every table has row-level security", GX, 770, "500 34px Barlow", C.paper, "left", 0.9);
  const pass = t >= 3.1;
  text(ctx, pass ? "Pass" : "Fail", GX, 836, "600 64px Spectral", pass ? C.paper : C.vermillion);
  ctx.restore();
  ctx.restore();
}

function statement(ctx, lines, prog, sub) {
  lines.forEach((ln, i) => {
    const p = prog[i] ?? 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(100, 240 + i * 150 - 20, 900, 215);
    ctx.clip();
    text(ctx, ln, 120, 380 + i * 150 + (1 - p) * 160, "600 128px Spectral", C.paper);
    ctx.restore();
  });
  const sp = easeOutCubic(seg(prog[prog.length - 1] ?? 1, 0.6, 1));
  ctx.fillStyle = C.vermillion;
  ctx.fillRect(120, 380 + lines.length * 150 - 60, 160 * sp, 8);
  text(ctx, sub, 120, 380 + lines.length * 150 + 10, "500 46px Barlow", C.paper, "left", 0.9 * sp);
}

const CARDS = [card1, card2, card3, card4];

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  const idx = Math.min(3, Math.floor(t / CARD));
  const local = t - idx * CARD;
  const wipe = idx < 3 ? easeInOutCubic(seg(local, 3.5, 4.0)) : 0;
  const edge = W * wipe;

  if (idx < 3 && wipe > 0) {
    // next card underneath, revealed left to right
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, edge, H);
    ctx.clip();
    CARDS[idx + 1](ctx, 0);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(edge, 0, W - edge, H);
    ctx.clip();
    CARDS[idx](ctx, local);
    ctx.restore();
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(edge - 5, 0, 10, H);
  } else {
    CARDS[idx](ctx, local);
  }

  // tail: last card exits into the next beat
  if (t > 15.4) {
    const p = easeInOutCubic(seg(t, 15.4, 16));
    ctx.fillStyle = `rgba(14,13,11,${p})`;
    ctx.fillRect(0, 0, W, H);
  }
}
