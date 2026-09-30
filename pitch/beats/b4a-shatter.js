// Beat 4a (0:44-1:00): "Shatter". The dot from beat 3 becomes the decimal point of 3.41; the number cracks and
// breaks apart, and four things it never captured are typeset in its place.
// Every item named here is built (ventures and peer-verified contributions, endorsements, code checks graded by a human).
import { W, H, C, clamp, lerp, easeOutCubic, easeInCubic, easeInOutCubic, seg, mulberry32 } from "../lib.js";

export const duration = 16;

const CX = 960;
const CY = 540;
const SIZE = 420;
const PERIOD_R = 23;
const SHATTER_AT = 2.7;
const GX0 = 520;
const GX1 = 1400;
const GY0 = 250;
const GY1 = 600;
const GC = 7;
const GR = 3;

// Jittered vertex grid -> triangles (seeded, so every frame is identical).
const rnd = mulberry32(4411);
const verts = [];
for (let r = 0; r <= GR; r++) {
  for (let c = 0; c <= GC; c++) {
    const edge = r === 0 || c === 0 || r === GR || c === GC;
    const jx = edge && (c === 0 || c === GC) ? 0 : (rnd() - 0.5) * 70;
    const jy = edge && (r === 0 || r === GR) ? 0 : (rnd() - 0.5) * 60;
    verts.push([GX0 + ((GX1 - GX0) * c) / GC + jx, GY0 + ((GY1 - GY0) * r) / GR + jy]);
  }
}
const V = (c, r) => verts[r * (GC + 1) + c];
const shards = [];
for (let r = 0; r < GR; r++) {
  for (let c = 0; c < GC; c++) {
    const a = V(c, r);
    const b = V(c + 1, r);
    const d = V(c, r + 1);
    const e = V(c + 1, r + 1);
    const tris = rnd() < 0.5 ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]];
    for (const tri of tris) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
      const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      let dx = cx - CX;
      let dy = cy - 420;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const speed = 90 + rnd() * 330;
      shards.push({ tri, cx, cy, vx: dx * speed, vy: dy * speed * 0.4 - 60, spin: (rnd() - 0.5) * 2.6 });
    }
  }
}

// The fracture: a main crack through the decimal point plus two branches, along grid vertices.
const c0 = Math.round(((CX - GX0) / (GX1 - GX0)) * GC);
const cracks = [
  { pts: [[CX, CY], V(c0, 2), V(c0 + 1, 1), V(c0, 0)], a: 0.0, b: 0.5 },
  { pts: [[CX, CY], V(c0, 3)], a: 0.0, b: 0.25 },
  { pts: [V(c0, 2), V(c0 - 2, 2), V(c0 - 3, 1), V(0, 2)], a: 0.3, b: 0.85 },
  { pts: [V(c0 + 1, 1), V(c0 + 3, 1), V(c0 + 4, 2), V(GC, 1)], a: 0.4, b: 1.0 },
];

function number(ctx, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.paper;
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${SIZE}px Spectral`;
  ctx.textAlign = "right";
  ctx.fillText("3", CX - PERIOD_R - 12, CY + 21);
  ctx.textAlign = "left";
  ctx.fillText("41", CX + PERIOD_R + 12, CY + 21);
  ctx.beginPath();
  ctx.arc(CX, CY, PERIOD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

const LINES = [
  { text: "Projects shipped.", at: 3.6 },
  { text: "Teammates who vouch.", at: 5.0 },
  { text: "Peers who endorse.", at: 6.4 },
  { text: "Understanding, checked by a human.", at: 7.8 },
];
const LINE_Y = [290, 440, 590, 740];

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  const exit = easeInOutCubic(seg(t, 13.6, 15.2));

  // The dot arrives from beat 3, grows to the decimal point, the digits slide in around it.
  if (t < SHATTER_AT) {
    const grow = easeOutCubic(seg(t, 0.0, 0.6));
    const slide = easeOutCubic(seg(t, 0.35, 1.25));
    const shakeA = seg(t, 1.6, SHATTER_AT);
    const sx = Math.sin(t * 90) * 5 * shakeA * shakeA;
    const sy = Math.cos(t * 77) * 4 * shakeA * shakeA;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = C.paper;
    ctx.font = `600 ${SIZE}px Spectral`;
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = slide;
    ctx.textAlign = "right";
    ctx.fillText("3", CX - PERIOD_R - 12 - (1 - slide) * 700, CY + 21);
    ctx.textAlign = "left";
    ctx.fillText("41", CX + PERIOD_R + 12 + (1 - slide) * 700, CY + 21);
    ctx.globalAlpha = 1;
    // the period: vermillion dot that grows, then turns paper
    const toPaper = seg(t, 1.0, 1.4);
    ctx.fillStyle = toPaper < 1 ? C.vermillion : C.paper;
    ctx.beginPath();
    ctx.arc(CX, CY, lerp(10, PERIOD_R, grow), 0, Math.PI * 2);
    ctx.fill();
    if (toPaper > 0 && toPaper < 1) {
      ctx.globalAlpha = toPaper;
      ctx.fillStyle = C.paper;
      ctx.beginPath();
      ctx.arc(CX, CY, PERIOD_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // crack draws across the number
    const cp = easeInOutCubic(seg(t, 1.9, 2.65));
    if (cp > 0) {
      ctx.strokeStyle = C.vermillion;
      ctx.lineWidth = 8;
      ctx.lineJoin = "miter";
      for (const k of cracks) {
        const p = clamp((cp - k.a) / (k.b - k.a));
        if (p <= 0) continue;
        const total = k.pts.length - 1;
        const f = p * total;
        ctx.beginPath();
        ctx.moveTo(k.pts[0][0], k.pts[0][1]);
        for (let i = 1; i <= total; i++) {
          const q = clamp(f - (i - 1));
          if (q <= 0) break;
          ctx.lineTo(lerp(k.pts[i - 1][0], k.pts[i][0], q), lerp(k.pts[i - 1][1], k.pts[i][1], q));
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  } else {
    // shards
    const dt = t - SHATTER_AT;
    const a = 1 - seg(dt, 1.6, 2.4);
    if (a > 0) {
      for (const s of shards) {
        const k = (1 - Math.exp(-2.0 * dt)) / 2.0;
        const ox = s.vx * k;
        const oy = s.vy * k + 0.5 * 2600 * dt * dt;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(s.cx + ox, s.cy + oy);
        ctx.rotate(s.spin * dt);
        ctx.translate(-s.cx, -s.cy);
        ctx.beginPath();
        ctx.moveTo(s.tri[0][0], s.tri[0][1]);
        ctx.lineTo(s.tri[1][0], s.tri[1][1]);
        ctx.lineTo(s.tri[2][0], s.tri[2][1]);
        ctx.closePath();
        ctx.clip();
        number(ctx, 1);
        ctx.restore();
      }
    }
  }

  // The four things it never captured, typeset with a vermillion rail.
  const railP = easeInOutCubic(seg(t, 3.3, 8.6));
  ctx.save();
  ctx.globalAlpha = 1 - exit;
  if (railP > 0) {
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(176, 240, 8, (LINE_Y[3] + 40 - 240) * railP);
  }
  for (let i = 0; i < LINES.length; i++) {
    const p = easeOutCubic(seg(t, LINES[i].at, LINES[i].at + 0.7));
    if (p <= 0) continue;
    const dimmed = seg(t, 9.6, 10.4);
    const y = LINE_Y[i];
    ctx.save();
    ctx.globalAlpha = (1 - exit) * (1 - 0.6 * dimmed);
    ctx.beginPath();
    ctx.rect(200, y - 100, W - 200, 150);
    ctx.clip();
    ctx.fillStyle = C.vermillion;
    ctx.fillRect(176, y - 34, 8 + 28 * p, 8);
    ctx.fillStyle = C.paper;
    ctx.font = "600 96px Spectral";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(LINES[i].text, 240, y + (1 - p) * 130);
    ctx.restore();
  }
  ctx.restore();

  // Conclusion.
  const fin = easeOutCubic(seg(t, 10.4, 11.3));
  if (fin > 0) {
    ctx.save();
    ctx.globalAlpha = 1 - exit;
    ctx.beginPath();
    ctx.rect(200, 800, W - 200, 200);
    ctx.clip();
    ctx.fillStyle = C.paper;
    ctx.font = "600 84px Spectral";
    ctx.textAlign = "left";
    ctx.fillText("One number can’t hold a person.", 240, 930 + (1 - fin) * 140);
    ctx.restore();
  }

  // Hand-off dot.
  if (t > 15.3) {
    ctx.fillStyle = C.vermillion;
    ctx.beginPath();
    ctx.arc(CX, CY, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}
