// Beat 6a (1:32-2:00): "The loop, students". The ring is drawn, then the student stage is walked through five verified steps.
// Steps are built features: ventures (peer-verified contributions), skill levels L1-L4, tiers, the signed CV.
import { W, H, C, clamp, lerp, easeOutCubic, easeInOutCubic, seg, images } from "../lib.js";
import { RC, NODE, pt, ring, node, thread, text, TAU } from "./loop.js";

export const duration = 28;

const STAGES = [
  { at: 2.6, title: ["Build real", "projects."], sub: "Complete a venture with a team." },
  { at: 7.0, title: ["Teammates", "confirm your work."], sub: "Contributions are peer-verified." },
  { at: 11.4, title: ["Skills earn", "levels."], sub: "From evidence, L1 to L4." },
  { at: 15.8, title: ["Your tier", "rises with proof."], sub: "Six tiers, earned, never bought." },
  { at: 20.2, title: ["A CV anyone", "can check."], sub: "Signed and tamper-evident." },
];
const STAGE_LEN = 4.4;
const TIERS = ["Raw", "Spark", "Flare", "Shine", "Radiant", "Luminary"];

const cx = RC.x;
const cy = RC.y;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function check(ctx, x, y, s, p, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, s * 0.16);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const a = [x - s * 0.5, y + s * 0.02];
  const b = [x - s * 0.12, y + s * 0.4];
  const c = [x + s * 0.55, y - s * 0.4];
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  const f = p * 2;
  ctx.lineTo(lerp(a[0], b[0], clamp(f)), lerp(a[1], b[1], clamp(f)));
  if (f > 1) ctx.lineTo(lerp(b[0], c[0], clamp(f - 1)), lerp(b[1], c[1], clamp(f - 1)));
  ctx.stroke();
  ctx.restore();
}

// ---- center graphics, each takes local time t (0..STAGE_LEN)
function venture(ctx, t) {
  const x = cx - 250;
  const y = cy - 150;
  ctx.fillStyle = "rgba(244,239,230,0.1)";
  ctx.fillRect(x, y, 500, 300);
  text(ctx, "VENTURE", x + 30, y + 52, "600 24px Barlow", C.paper, "left", 0.6, 6);
  ctx.fillStyle = "rgba(244,239,230,0.85)";
  ctx.fillRect(x + 30, y + 80, 300, 24);
  ctx.fillStyle = "rgba(244,239,230,0.3)";
  ctx.fillRect(x + 30, y + 120, 420, 16);
  for (let i = 0; i < 3; i++) {
    const a = easeOutCubic(seg(t, 0.7 + i * 0.2, 1.1 + i * 0.2));
    ctx.fillStyle = `rgba(244,239,230,${0.55 + 0.15 * i})`;
    ctx.beginPath();
    ctx.arc(x + 54 + i * 56, y + 200, 26 * a, 0, TAU);
    ctx.fill();
  }
  const p = easeInOutCubic(seg(t, 1.4, 3.2));
  ctx.fillStyle = "rgba(244,239,230,0.18)";
  ctx.fillRect(x + 30, y + 256, 440, 14);
  ctx.fillStyle = C.paper;
  ctx.fillRect(x + 30, y + 256, 440 * p, 14);
  const done = easeOutCubic(seg(t, 3.2, 3.6));
  if (done > 0) text(ctx, "Completed", x + 470, y + 214, "600 34px Barlow", C.vermillion, "right", done);
}

function contributions(ctx, t) {
  const x = cx - 260;
  const y = cy - 150;
  for (let i = 0; i < 3; i++) {
    const a = easeOutCubic(seg(t, 0.3 + i * 0.25, 0.8 + i * 0.25));
    const ry = y + i * 100;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate((1 - a) * 40, 0);
    ctx.fillStyle = "rgba(244,239,230,0.1)";
    ctx.fillRect(x, ry, 520, 80);
    ctx.fillStyle = "rgba(244,239,230,0.7)";
    ctx.fillRect(x + 28, ry + 26, [260, 200, 300][i], 22);
    const p = seg(t, 1.3 + i * 0.6, 1.8 + i * 0.6);
    ctx.strokeStyle = "rgba(244,239,230,0.45)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x + 470, ry + 40, 24, 0, TAU);
    ctx.stroke();
    if (p > 0) check(ctx, x + 470, ry + 40, 38, p, C.vermillion);
    ctx.restore();
  }
  text(ctx, "Peer-verified by a teammate", x, y + 330, "500 30px Barlow", C.paper, "left", 0.7 * easeOutCubic(seg(t, 2.6, 3.2)));
}

function levels(ctx, t) {
  const x = cx - 240;
  const base = cy + 130;
  const reached = t < 2.6 ? 3 : 4;
  for (let i = 0; i < 4; i++) {
    const a = easeOutCubic(seg(t, 0.3 + i * 0.3, 0.9 + i * 0.3));
    const h = (70 + i * 62) * a;
    const lit = i + 1 <= 3 || t >= 2.6;
    ctx.fillStyle = lit ? C.paper : "rgba(244,239,230,0.2)";
    if (i === 3 && t >= 2.6) ctx.fillStyle = C.vermillion;
    ctx.fillRect(x + i * 130, base - h, 100, h);
    text(ctx, `L${i + 1}`, x + i * 130 + 50, base + 52, "600 34px Barlow", C.paper, "center", a);
  }
  text(ctx, reached === 4 ? "Level 4: code checked by a person" : "Level 3", x, base - 280, "500 30px Barlow", C.paper, "left", 0.8 * easeOutCubic(seg(t, 1.6, 2.2)));
}

function tiers(ctx, t) {
  const x = cx - 150;
  const y0 = cy - 200;
  const at = easeInOutCubic(seg(t, 1.2, 2.8)); // marker climbs from Raw to Flare
  for (let i = 0; i < 6; i++) {
    const a = easeOutCubic(seg(t, 0.2 + i * 0.08, 0.6 + i * 0.08));
    const y = y0 + (5 - i) * 68;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = "rgba(244,239,230,0.1)";
    ctx.fillRect(x, y, 300, 56);
    text(ctx, TIERS[i], x + 30, y + 39, "600 32px Barlow", C.paper, "left", i <= 2 ? 1 : 0.5);
    ctx.restore();
  }
  const my = y0 + (5 - lerp(0, 2, at)) * 68;
  ctx.strokeStyle = C.vermillion;
  ctx.lineWidth = 6;
  ctx.strokeRect(x - 8, my - 6, 316, 68);
}

function cvSeal(ctx, t) {
  const a = easeOutCubic(seg(t, 0.1, 0.7));
  const w = 300;
  const h = (w * 1123) / 794;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(0, (1 - a) * 50);
  ctx.drawImage(images.cv, cx - w / 2, cy - h / 2 + 10, w, h);
  ctx.restore();
  const s = easeOutCubic(seg(t, 1.4, 1.9));
  if (s > 0) {
    const sx = cx + w / 2 - 20;
    const sy = cy + h / 2 - 20;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1 + (1 - s) * 0.8, 1 + (1 - s) * 0.8);
    ctx.globalAlpha *= s;
    ctx.fillStyle = C.vermillion;
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, TAU);
    ctx.fill();
    check(ctx, 0, 0, 52, seg(t, 1.7, 2.3), C.paper);
    ctx.restore();
  }
  text(ctx, "Sample CV", cx, cy + h / 2 + 50, "400 26px Barlow", C.paper, "center", 0.55 * a);
}

const GRAPHICS = [venture, contributions, levels, tiers, cvSeal];

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // The ring draws itself clockwise from the top, then the nodes arrive.
  const draw = easeInOutCubic(seg(t, 0.0, 2.3));
  ring(ctx, -Math.PI / 2, -Math.PI / 2 + TAU * draw, C.paper, 4, 0.28);

  const pulse = seg(t, 27.4, 28.0);
  node(ctx, "recruiters", easeOutCubic(seg(t, 1.6, 2.2)) * 0.0, "LAUNCHING", 0);
  node(ctx, "universities", pulse > 0 ? easeOutCubic(pulse) : 0, "LAUNCHING", pulse > 0 ? pulse : 0);
  node(ctx, "students", easeOutCubic(seg(t, 0.3, 0.9)), null, 0);

  // Stage title (left) and graphic (center).
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i];
    const lt = t - s.at;
    if (lt < -0.05 || lt > STAGE_LEN + 0.05) continue;
    const inP = easeOutCubic(seg(lt, 0.0, 0.6));
    const outP = easeInOutCubic(seg(lt, STAGE_LEN - 0.5, STAGE_LEN));
    const alpha = inP * (1 - outP);
    s.title.forEach((ln, k) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(100, 300 + k * 92, 700, 125);
      ctx.clip();
      const p = easeOutCubic(seg(lt, 0.05 + k * 0.12, 0.65 + k * 0.12));
      text(ctx, ln, 120, 380 + k * 92 + (1 - p) * 90 - outP * 0, "600 72px Spectral", C.paper, "left", 1 - outP);
      ctx.restore();
    });
    const sp = easeOutCubic(seg(lt, 0.5, 1.0));
    ctx.fillStyle = C.vermillion;
    ctx.globalAlpha = 1 - outP;
    ctx.fillRect(120, 520, 120 * sp, 7);
    ctx.globalAlpha = 1;
    text(ctx, s.sub, 120, 580, "500 36px Barlow", C.paper, "left", 0.85 * sp * (1 - outP));
    // step counter
    text(ctx, `${i + 1} / ${STAGES.length}`, 120, 250, "600 26px Barlow", C.paper, "left", 0.55 * alpha, 5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, (1 - inP) * 30);
    GRAPHICS[i](ctx, Math.max(0, lt));
    ctx.restore();
  }

  // The thread leaves the student node toward universities.
  const go = easeInOutCubic(seg(t, 24.6, 27.6));
  thread(ctx, NODE.students.angle, NODE.universities.angle, go);
  // a thin lit arc behind the thread so the cycle reads as a loop
  if (go > 0) ring(ctx, NODE.students.angle, NODE.universities.angle, C.paper, 4, 0.0);
}
