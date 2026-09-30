// Beat 8 (2:47-3:00): "Close". The thread becomes the Skilient logo; the three founders and their roles.
import { W, H, C, clamp, lerp, easeOutCubic, easeInOutCubic, easeOutBack, seg, images } from "../lib.js";

export const duration = 13;

const FOUNDERS = [
  { name: "Huzaifa Khan", role: "CEO / Founder" },
  { name: "Ahmed Mursileen", role: "CTO / Co-founder" },
  { name: "Laiba Owais", role: "CHRO" },
];

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

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // A vermillion line sweeps in from the left and contracts into a dot at the centre of the logo's place.
  const sweep = easeInOutCubic(seg(t, 0.0, 1.0));
  const shrink = easeInOutCubic(seg(t, 1.0, 1.8));
  const logoIn = easeOutCubic(seg(t, 1.7, 2.7));
  const lw = 1000;
  const lh = (lw * 1260) / 5544;
  const ly = 330;

  ctx.fillStyle = C.vermillion;
  if (t < 1.8) {
    const x0 = lerp(0, W / 2 - 10, shrink);
    const x1 = lerp(W * sweep, W / 2 + 10, shrink);
    ctx.fillRect(x0, 540 - 5 * (1 - shrink) - 5 * shrink, Math.max(20, x1 - x0), 10);
  }
  if (logoIn > 0) {
    ctx.save();
    ctx.globalAlpha = logoIn;
    ctx.translate(W / 2, ly + lh / 2);
    const s = 0.94 + 0.06 * logoIn;
    ctx.scale(s, s);
    ctx.drawImage(images.logo, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
  }

  // Founders.
  const rule = easeOutCubic(seg(t, 3.6, 4.6));
  ctx.fillStyle = C.vermillion;
  ctx.fillRect(W / 2 - 420 * rule, 690, 840 * rule, 6);
  FOUNDERS.forEach((f, i) => {
    const at = 4.4 + i * 0.7;
    const p = easeOutCubic(seg(t, at, at + 0.7));
    const x = 360 + i * 600;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 300, 740, 600, 150);
    ctx.clip();
    text(ctx, f.name, x, 800 + (1 - p) * 170, "600 56px Spectral", C.paper, "center");
    text(ctx, f.role, x, 860 + (1 - p) * 170, "500 36px Barlow", C.paper, "center", 0.8);
    ctx.restore();
  });
}
