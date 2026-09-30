// Beat 4b (1:00-1:16): "Signed CV". The product's own CV document (sample student), the real SHA-256 of a real PDF of it,
// one byte flipped, and the verify page's own wording for Altered, Valid and Revoked (lib/cv/status.ts).
import { W, H, C, clamp, lerp, easeOutCubic, easeInCubic, easeInOutCubic, seg, mulberry32, images } from "../lib.js";
import { CV_FACTS } from "../assets/cv-facts.js";

export const duration = 16;

const PAGE = { x: 130, y: 70, w: 580, h: 820 };
const RX = 860;
const STATUS = {
  altered: {
    title: "Altered",
    body: "The file you checked doesn't match the CV issued under this code. The genuine CV is shown below so you can compare.",
  },
  valid: { title: "Valid", body: "This CV was issued by Skilient and hasn't changed since. Every item comes from checked evidence." },
  revoked: { title: "Revoked", body: "This CV has been withdrawn and is no longer valid." },
};

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

function wrap(ctx, str, maxW) {
  const words = str.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Hash display: settled value, or a scramble of hex digits (seeded per frame) while "recomputing".
function shown(target, from, p, t) {
  if (p >= 1) return target;
  if (p <= 0) return from;
  const r = mulberry32(Math.floor(t * 30) * 7919 + 13);
  const settled = Math.floor(target.length * p);
  let out = "";
  for (let i = 0; i < target.length; i++) out += i < settled ? target[i] : "0123456789abcdef"[Math.floor(r() * 16)];
  return out;
}

const groups = (h) => [0, 8, 16, 24].map((i) => h.slice(i, i + 8)).join("  ");

function verdict(ctx, key, color, p, alphaOut) {
  const s = STATUS[key];
  const a = easeOutCubic(p) * alphaOut;
  if (a <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(RX - 10, 640, 1000, 400);
  ctx.clip();
  ctx.globalAlpha *= a;
  const dy = (1 - easeOutCubic(p)) * 120;
  text(ctx, s.title, RX, 810 + dy, "600 190px Spectral", color, "left", 1);
  ctx.font = "500 38px Barlow";
  const lines = wrap(ctx, s.body, 900);
  lines.forEach((ln, i) => text(ctx, ln, RX, 880 + dy + i * 50, "500 38px Barlow", C.paper, "left", 0.9));
  ctx.restore();
}

export function seek(ctx, t) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  const exit = easeInOutCubic(seg(t, 14.3, 15.6));
  const exitX = -900 * exit;
  const fade = 1 - seg(t, 14.3, 15.2);

  // CV page (the product's own document) and its verify footer.
  const pin = easeOutCubic(seg(t, 0.0, 0.9));
  if (pin > 0) {
    ctx.save();
    ctx.globalAlpha = pin * (1 - exit);
    ctx.translate(exitX, (1 - pin) * 140);
    ctx.drawImage(images.cv, PAGE.x, PAGE.y, PAGE.w, PAGE.h);
    ctx.restore();
  }
  const fin = easeOutCubic(seg(t, 0.9, 1.7));
  if (fin > 0) {
    const fh = (PAGE.w * 279) / 2022;
    ctx.save();
    ctx.globalAlpha = fin * (1 - exit);
    ctx.translate(exitX, (1 - fin) * 60);
    ctx.fillStyle = "#fff";
    ctx.fillRect(PAGE.x, PAGE.y + PAGE.h + 12, PAGE.w, fh + 16);
    ctx.drawImage(images.cvFoot, PAGE.x + 8, PAGE.y + PAGE.h + 20, PAGE.w - 16, fh);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = fade;

  // File chip.
  const chip = easeOutCubic(seg(t, 1.7, 2.5));
  if (chip > 0) {
    ctx.save();
    ctx.globalAlpha *= chip;
    ctx.translate((1 - chip) * 80, 0);
    ctx.fillStyle = C.paper;
    ctx.fillRect(RX, 110, 86, 64);
    text(ctx, "PDF", RX + 43, 154, "600 34px Barlow", C.ink, "center");
    text(ctx, CV_FACTS.file, RX + 112, 146, "600 44px Barlow", C.paper);
    text(ctx, `Sample file, ${CV_FACTS.size.toLocaleString("en-US")} bytes`, RX + 112, 178, "400 28px Barlow", C.paper, "left", 0.65);
    ctx.restore();
  }

  // First 16 bytes; byte 7 is the one that changes.
  const flipIn = easeOutCubic(seg(t, 4.3, 4.6));
  const flipOut = easeOutCubic(seg(t, 8.4, 8.7));
  const flipped = t >= 4.45 && t < 8.55;
  for (let i = 0; i < 16; i++) {
    const a = easeOutCubic(seg(t, 2.6 + i * 0.035, 3.1 + i * 0.035));
    if (a <= 0) continue;
    const x = RX + i * 56;
    const y = 250 + (1 - a) * 20;
    const isFlip = i === CV_FACTS.flipIndex;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = isFlip && flipped ? C.vermillion : "rgba(244,239,230,0.12)";
    ctx.fillRect(x, y, 52, 64);
    const pulse = isFlip ? Math.max(flipIn * (1 - seg(t, 4.6, 5.2)), flipOut * (1 - seg(t, 8.7, 9.3))) : 0;
    if (pulse > 0) {
      ctx.strokeStyle = isFlip && flipped ? C.vermillion : C.paper;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 6 * pulse, y - 6 * pulse, 52 + 12 * pulse, 64 + 12 * pulse);
    }
    const val = isFlip && flipped ? CV_FACTS.flippedByte : CV_FACTS.bytes[i];
    text(ctx, val, x + 26, y + 43, "600 32px Barlow", isFlip && flipped ? C.paper : C.paper, "center", isFlip ? 1 : 0.85);
    ctx.restore();
  }
  const cap = easeOutCubic(seg(t, 3.1, 3.7));
  text(ctx, "The first 16 bytes of the file", RX, 350, "400 28px Barlow", C.paper, "left", 0.65 * cap);
  const capFlip = easeOutCubic(seg(t, 4.5, 5.0)) * (1 - seg(t, 8.4, 8.8));
  if (capFlip > 0) text(ctx, "One byte changed: 34 → 35", RX + 500, 350, "600 28px Barlow", C.vermillion, "left", capFlip);

  // Fingerprints.
  const fp = easeOutCubic(seg(t, 3.7, 4.3));
  if (fp > 0) {
    const tamper = seg(t, 4.6, 5.5);
    const restore = seg(t, 8.6, 9.5);
    const p = restore > 0 ? 1 - restore : tamper; // 0 = original, 1 = altered
    const thisFile = restore > 0
      ? shown(CV_FACTS.hash, CV_FACTS.alteredHash, restore, t)
      : shown(CV_FACTS.alteredHash, CV_FACTS.hash, tamper, t);
    const matches = restore >= 1 || tamper <= 0;
    ctx.save();
    ctx.globalAlpha *= fp;
    text(ctx, "SHA-256 fingerprint", RX, 440, "400 28px Barlow", C.paper, "left", 0.65);
    text(ctx, "Issued by Skilient", RX, 500, "500 30px Barlow", C.paper, "left", 0.85);
    text(ctx, groups(CV_FACTS.hash), RX + 300, 500, "600 34px Barlow", C.paper, "left", 1, 3);
    text(ctx, "This file", RX, 566, "500 30px Barlow", C.paper, "left", 0.85);
    text(ctx, groups(thisFile), RX + 300, 566, "600 34px Barlow", matches ? C.paper : C.vermillion, "left", 1, 3);
    void p;
    ctx.restore();
  }

  // Verdicts: Altered -> Valid -> Revoked, in the verify page's own words.
  const showAltered = seg(t, 5.6, 6.3) * (1 - seg(t, 9.0, 9.6));
  const showValid = seg(t, 9.6, 10.3) * (1 - seg(t, 11.9, 12.5));
  const showRevoked = seg(t, 12.5, 13.2);
  if (showAltered > 0) verdict(ctx, "altered", C.vermillion, seg(t, 5.6, 6.3), 1 - seg(t, 9.0, 9.6));
  if (showValid > 0) verdict(ctx, "valid", C.paper, seg(t, 9.6, 10.3), 1 - seg(t, 11.9, 12.5));
  if (showRevoked > 0) verdict(ctx, "revoked", C.vermillion, seg(t, 12.5, 13.2), 1);
  const wd = easeOutCubic(seg(t, 11.6, 12.1)) * (1 - seg(t, 12.6, 13.0));
  if (wd > 0) text(ctx, "The student withdraws it", RX, 620, "600 34px Barlow", C.vermillion, "left", wd);

  ctx.restore();

  if (t > 15.3) {
    ctx.fillStyle = C.vermillion;
    ctx.beginPath();
    ctx.arc(960, 540, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}
