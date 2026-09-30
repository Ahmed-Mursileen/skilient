// Shared drawing for the loop (beats 6a and 6b): the ring, three nodes, and the thread that travels clockwise.
// Students at the top, Universities bottom right, Recruiters bottom left.
import { W, H, C, clamp, lerp, seg } from "../lib.js";

export const RC = { x: 1160, y: 560, r: 330 };
const A = { students: -Math.PI / 2, universities: Math.PI / 6, recruiters: (5 * Math.PI) / 6 };
export const NODE = {
  students: { angle: A.students, label: "Students" },
  universities: { angle: A.universities, label: "Universities" },
  recruiters: { angle: A.recruiters, label: "Recruiters" },
};

export const pt = (angle, r = RC.r) => [RC.x + Math.cos(angle) * r, RC.y + Math.sin(angle) * r];

export function text(ctx, str, x, y, font, color, align = "left", alpha = 1, spacing = 0) {
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

export function ring(ctx, from, to, color, width, alpha = 1) {
  if (to <= from) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(RC.x, RC.y, RC.r, from, to);
  ctx.stroke();
  ctx.restore();
}

// Node circle plus its label. `lit` 0..1 brightens it; `tag` adds a small "launching" line.
export function node(ctx, key, lit, tag = null, pulse = 0) {
  const n = NODE[key];
  const [x, y] = pt(n.angle);
  ctx.save();
  if (pulse > 0) {
    ctx.strokeStyle = C.vermillion;
    ctx.globalAlpha = 0.6 * (1 - pulse);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 26 + pulse * 40, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = lit > 0.5 ? C.paper : "rgba(244,239,230,0.45)";
  ctx.lineWidth = 5;
  ctx.stroke();
  if (lit > 0) {
    ctx.fillStyle = C.paper;
    ctx.globalAlpha = lit;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const a = 0.45 + 0.55 * lit;
  const up = key === "students";
  const right = key === "universities";
  const lx = up ? x : right ? x + 50 : x - 50;
  const ly = up ? y - 52 : y + 14;
  const align = up ? "center" : right ? "left" : "right";
  text(ctx, n.label, lx, ly, "600 44px Spectral", C.paper, align, a);
  if (tag) text(ctx, tag, lx, ly + 40, "600 24px Barlow", C.vermillion, align, 0.9 * (0.4 + 0.6 * lit), 4);
}

// The thread: a vermillion arc between two angles (clockwise, radians), progress 0..1.
export function thread(ctx, from, to, p, width = 10) {
  if (p <= 0) return;
  const end = from + (to - from) * p;
  ring(ctx, from, end, C.vermillion, width);
  const [x, y] = pt(end);
  ctx.fillStyle = C.vermillion;
  ctx.beginPath();
  ctx.arc(x, y, width * 0.9, 0, Math.PI * 2);
  ctx.fill();
}

export const TAU = Math.PI * 2;
export { W, H, C, clamp, lerp, seg };
