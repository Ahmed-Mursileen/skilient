"use client";

import { useEffect, useRef } from "react";
import { hero as copy } from "@/content/marketing";
import type { Box, HeroCaptures } from "@/lib/marketing/captures";
import { CaptureImage } from "./capture-image";

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const DECELERATE = "cubic-bezier(0, 0, 0.2, 1)";

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(3)}%`;
const boxStyle = (b: Box, w: number, h: number) => ({ left: pct(b.x, w), top: pct(b.y, h), width: pct(b.w, w), height: pct(b.h, h) });

/**
 * The hero's University Feed capture and its one focal moment (PRD 5.1, plan B3). Once, when the
 * phone is half on screen: a reader taps the tick on post A, the strip settles into its public
 * line, the count rolls 11 to 12, and post A moves up above post B (FLIP, 400 ms). Never loops.
 *
 * Every layer is a real capture. Without JavaScript the CSS shows the end state (html has no
 * data-js); with it, the start state until the sequence runs. Reduced motion: the count
 * crossfades in 200 ms and nothing moves.
 */
export function HeroFeedCapture({ shots }: { shots: HeroCaptures }) {
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const running: Animation[] = [];
    const timers: number[] = [];
    const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const run = (node: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const a = node.animate(frames, { fill: "both", ...options });
      running.push(a);
      return a;
    };

    const play = () => {
      const before = q(".hero-a-before");
      const after = q(".hero-a-after");
      const track = q(".hero-roll-track");
      if (reduce) {
        el.dataset.state = "answered";
        run(before, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        run(after, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        // The roll box shows "11" over the answered capture, which reads 12: fading it is the crossfade.
        run(q(".hero-roll"), [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        return;
      }
      // t = 0: the tap on the tick.
      run(q(".hero-tap"), [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.6)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.6 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.15)" },
      ], { duration: 320, easing: DECELERATE });
      // t = 120: the strip settles into the public line (still 11).
      at(120, () => {
        el.dataset.state = "answered";
        run(before, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "linear" });
        run(after, [{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "linear" });
      });
      // t = 350: 11 rolls to 12.
      at(350, () => run(track, [{ transform: "translateY(0)" }, { transform: "translateY(-50%)" }], { duration: 300, easing: DECELERATE }));
      // t = 900: post A moves up one place (FLIP).
      at(900, () => {
        const cards = [q(".hero-card-a"), q(".hero-card-b")];
        const first = cards.map((c) => c.getBoundingClientRect().top);
        el.dataset.state = "done";
        cards.forEach((c, i) => {
          const dy = first[i] - c.getBoundingClientRect().top;
          c.style.willChange = "transform";
          const a = run(c, [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 400, easing: EASE_OUT });
          a.finished.then(() => (c.style.willChange = "")).catch(() => {});
        });
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          at(reduce ? 200 : 450, play);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      running.forEach((a) => a.cancel());
    };
  }, []);

  const a = shots.postAAfter;
  return (
    <div className="hero-phone" data-testid="hero-capture">
      <div ref={screen} className="hero-screen" role="img" aria-label={copy.captureAlt} data-state="start">
        <div className="hero-top">
          <CaptureImage file={shots.top} alt="" />
        </div>
        <div className="hero-feed">
          <div className="hero-card hero-card-a">
            <div className="hero-a-stack">
              <div className="hero-a-before">
                <CaptureImage file={shots.postABefore} alt="" />
                <span
                  aria-hidden
                  className="hero-tap"
                  style={{ left: pct(shots.tick.x, shots.postABefore.w), top: pct(shots.tick.y, shots.postABefore.h) }}
                />
              </div>
              <div className="hero-a-after">
                <CaptureImage file={a} alt="" />
                <div aria-hidden className="hero-roll" style={boxStyle(shots.line, a.w, a.h)}>
                  <div className="hero-roll-track">
                    <div className="hero-roll-before">
                      <CaptureImage file={shots.lineBefore} alt="" />
                    </div>
                    <CaptureImage file={shots.lineAfter} alt="" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-card hero-card-b">
            <CaptureImage file={shots.postB} alt="" priority />
          </div>
        </div>
      </div>
    </div>
  );
}
