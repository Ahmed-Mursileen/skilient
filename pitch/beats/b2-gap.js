// Beat 2 (0:12-0:30): "The Gap". Only a CGPA crosses from the university to the employer; everything else bounces off the gate.
import { W, H, C, clamp, lerp, easeOutCubic, easeInOutCubic, seg } from "../lib.js";

export const duration = 18;

const RAIL_Y = 716;
const ROW0 = 366; // centre of row 0 (hook row lands on the rail, y=716)
const ROW_H = 70;
const GATE_X = 960;
const LEFT = { x0: 120, x1: 840 };
const RIGHT = { x0: 1080, x1: 1800 };
const VALUES = ["3.38", "3.45", "3.52", "3.40", "3.44", "3.41", "3.47", "3.41"];
const HOOK = 5;
const NAME_W = [300, 250, 330, 280, 310, 320, 290, 270];
// sorted descending by value, stable on index
const ORDER = VALUES.map((v, i) => [Number(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1]);
const SLOT = (idx) => ORDER.indexOf(idx);
const CUTOFF_AFTER = 3; // rows 0..3 pass, 4.. do not
const rowY = (k) => ROW0 + k * ROW_H;

const CHIPS = [
  { text: "Shipped a real project", t: 2.5, dy: -170 },
  { text: "Led a team", t: 3.05, dy: -95 },
  { text: "Fixed a live bug", t: 3.6, dy: 100 },
];

function label(ctx, text, x, y, alpha = 0.55, size = 28, spacing = 6) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.paper;
  ctx.font = `600 ${size}px Barlow`;
  ctx.textAlign = "left";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  ctx.restore();
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

function panel(ctx, x0, x1, dx, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(244,239,230,0.07)";
  ctx.fillRect(x0 + dx, 240, x1 - x0, 660);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function row(ctx, x0, x1, y, nameW, value, alpha, opts = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.paper;
  ctx.globalAlpha = alpha * 0.72;
  ctx.fillRect(x0 + 30, y - 11, nameW, 22);
  ctx.globalAlpha = alpha;
  ctx.font = "600 46px Spectral";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x1 - 34, y + 15);
  if (opts.hook) {
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(x0 + 8, y - 28, 8, 56);
  }
  ctx.restore();
}

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // Exit (16.0-17.6): panels part, everything collapses to a single vermillion dot at the gate.
  const exit = easeInOutCubic(seg(t, 14.6, 16.4));
  const dotP = easeInOutCubic(seg(t, 16.3, 17.3));

  const lIn = easeOutCubic(seg(t, 0.0, 0.9));
  const rIn = easeOutCubic(seg(t, 4.7, 5.5));
  const lx = -(1 - lIn) * 900 - exit * 1000;
  const rx = (1 - rIn) * 900 + exit * 1000;
  const fade = 1 - seg(t, 15.4, 16.4);

  // Panels
  panel(ctx, LEFT.x0, LEFT.x1, lx, fade);
  if (rIn > 0) panel(ctx, RIGHT.x0, RIGHT.x1, rx, fade);
  ctx.save();
  ctx.globalAlpha = fade;
  label(ctx, "UNIVERSITY RECORD", LEFT.x0 + 30 + lx, 292);
  if (rIn > 0) label(ctx, "SHORTLIST", RIGHT.x0 + 30 + rx, 292);
  ctx.restore();

  // Left rows
  for (let k = 0; k < VALUES.length; k++) {
    const a = easeOutCubic(seg(t, 0.4 + k * 0.08, 1.0 + k * 0.08));
    if (a <= 0) continue;
    const isHook = k === HOOK;
    const v = isHook && t > 4.5 ? "" : VALUES[k];
    row(ctx, LEFT.x0 + lx, LEFT.x1 + lx, rowY(k) + (1 - a) * 18, NAME_W[k], v, a * fade, { hook: isHook && t > 1.8 });
  }

  // Gate with a slit exactly the height of the CGPA token.
  const gateA = easeOutCubic(seg(t, 1.6, 2.2)) * (1 - seg(t, 14.4, 15.2));
  if (gateA > 0) {
    ctx.fillStyle = `rgba(244,239,230,${0.55 * gateA})`;
    ctx.fillRect(GATE_X - 2, 240, 4, RAIL_Y - 30 - 240);
    ctx.fillRect(GATE_X - 2, RAIL_Y + 30, 4, 900 - (RAIL_Y + 30));
  }

  // Rail (the thread): enters from the left edge, runs to the gate, then beyond after the token crosses.
  const railIn = easeInOutCubic(seg(t, 0.0, 1.8));
  const railOut = easeInOutCubic(seg(t, 4.7, 5.6));
  const snap = easeOutCubic(seg(t, 13.0, 13.5));
  ctx.fillStyle = C.vermillion;
  const railL1 = 0;
  const railL2 = lerp(0, GATE_X - 6, railIn);
  const gapHalf = snap * 26;
  if (t < 16.3) {
    const seg2 = (a, b) => {
      if (b > a) ctx.fillRect(a, RAIL_Y - 4, b - a, 8);
    };
    const lPanel = [LEFT.x0 + lx, LEFT.x1 + lx];
    const rPanel = [RIGHT.x0 + rx, RIGHT.x1 + rx];
    // left of the university panel
    seg2(railL1, Math.min(railL2 - gapHalf, lPanel[0]));
    // between panel and gate
    seg2(lPanel[1], railL2 - gapHalf);
    if (railOut > 0) {
      const rStart = GATE_X + 6 + gapHalf;
      const rEnd = rStart + lerp(0, 1700 - rStart, railOut);
      seg2(rStart, Math.min(rEnd, rPanel[0]));
    }
  }

  // Chips: fly to the gate, hit, squash, fall.
  for (const ch of CHIPS) {
    const dt = t - ch.t;
    if (dt < 0) continue;
    ctx.font = "500 30px Barlow";
    const w = ctx.measureText(ch.text).width + 44;
    const flight = 0.85;
    let right = lerp(700 + w, GATE_X - 18, easeInOutCubic(clamp(dt / flight)));
    let y = RAIL_Y - 26 + ch.dy * easeOutCubic(clamp(dt / 0.5));
    let rot = 0;
    let sx = 1;
    let a = 1;
    if (dt > flight) {
      const f = dt - flight;
      sx = f < 0.12 ? lerp(1, 0.72, f / 0.12) : 0.72;
      const fall = Math.max(0, f - 0.1);
      y += 0.5 * 2600 * fall * fall;
      rot = -0.9 * fall;
      right -= 60 * fall;
      a = 1 - seg(f, 0.25, 0.9);
    }
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a * fade;
    ctx.translate(right, y + 26);
    ctx.rotate(rot);
    ctx.scale(sx, 1);
    ctx.fillStyle = C.paper;
    roundRect(ctx, -w, -28, w, 56, 6);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(ch.text, -w + 22, 10);
    ctx.restore();
  }

  // CGPA token crosses through the slit.
  const tk = easeInOutCubic(seg(t, 4.6, 5.9));
  if (tk > 0 && t < 6.4) {
    const x = lerp(LEFT.x1 - 34 - 130 + lx, RIGHT.x1 - 34 - 130, tk);
    ctx.save();
    ctx.fillStyle = C.paper;
    roundRect(ctx, x, RAIL_Y - 28, 130, 56, 6);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = "600 42px Spectral";
    ctx.textAlign = "center";
    ctx.fillText("3.41", x + 65, RAIL_Y + 14);
    ctx.restore();
  }

  // Right rows: arrive in received order, then sort, then the cutoff falls.
  const sortP = easeInOutCubic(seg(t, 6.3, 7.3));
  for (let k = 0; k < VALUES.length; k++) {
    const a = easeOutCubic(seg(t, 5.3 + k * 0.06, 5.8 + k * 0.06));
    if (a <= 0) continue;
    const isHook = k === HOOK;
    if (isHook && t < 5.9) continue;
    const y = lerp(rowY(k), rowY(SLOT(k)), sortP);
    const below = SLOT(k) > CUTOFF_AFTER;
    const dim = below ? 1 - 0.68 * easeOutCubic(seg(t, 7.9 + (SLOT(k) - 4) * 0.06, 8.3 + (SLOT(k) - 4) * 0.06)) : 1;
    row(ctx, RIGHT.x0 + rx, RIGHT.x1 + rx, y + (1 - a) * 14, NAME_W[(k + 3) % NAME_W.length], VALUES[k], a * dim * fade, { hook: isHook });
  }

  // Cutoff line sweeps down and lands between row 4 and row 5 (no number: illustrative).
  const cut = easeInOutCubic(seg(t, 7.4, 8.0));
  if (cut > 0 && t < 16.3) {
    const y = lerp(250, rowY(CUTOFF_AFTER) + ROW_H / 2, cut);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(RIGHT.x0 + rx, y - 2, RIGHT.x1 - RIGHT.x0, 4);
    label(ctx, "CUTOFF", RIGHT.x1 + rx + 12, y + 8, 0.95, 22, 3);
    ctx.restore();
  }

  // Stamp on the student's row.
  const st = clamp((t - 8.7) / 0.14);
  if (st > 0 && t < 16.3) {
    const s = 1 + 0.8 * (1 - easeOutCubic(st));
    ctx.save();
    ctx.globalAlpha = 0.95 * st * fade;
    ctx.translate(RIGHT.x0 + 420 + rx, rowY(SLOT(HOOK)) + 2);
    ctx.rotate(-0.1);
    ctx.scale(s, s);
    ctx.strokeStyle = C.vermillion;
    ctx.fillStyle = C.vermillion;
    ctx.lineWidth = 7;
    ctx.strokeRect(-150, -34, 300, 68);
    ctx.font = "600 46px Barlow";
    ctx.textAlign = "center";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText("REJECTED", 2, 16);
    ctx.restore();
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  // Captions.
  const c1 = easeOutCubic(seg(t, 9.8, 10.5));
  const c2 = easeOutCubic(seg(t, 11.4, 12.1));
  ctx.font = "600 62px Spectral";
  ctx.fillStyle = C.paper;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const [c, text, x, dx] of [[c1, "Universities can't see capability.", LEFT.x0, lx], [c2, "Employers can't verify it.", RIGHT.x0, rx]]) {
    if (c <= 0) continue;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.rect(x + dx - 4, 920, 900, 100);
    ctx.clip();
    ctx.fillText(text, x + dx, 990 + (1 - c) * 100);
    ctx.restore();
  }

  // Hand-off dot.
  if (t >= 16.3) {
    ctx.fillStyle = C.vermillion;
    ctx.beginPath();
    ctx.arc(GATE_X, RAIL_Y, lerp(10, 10, dotP), 0, Math.PI * 2);
    ctx.fill();
  }
}
