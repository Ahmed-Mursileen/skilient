"use client";

/* The arrow ref goes to Floating UI's arrow middleware, which reads it in an effect, not in render. */
/* eslint-disable react-hooks/refs */

import { arrow, autoUpdate, flip, FloatingArrow, FloatingFocusManager, FloatingPortal, offset, shift, useDismiss, useFloating, useInteractions, useRole } from "@floating-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { saveTourProgress } from "@/lib/actions/learn";
import { TOURS, type TourStep } from "@/lib/tours";

export interface TourInitial {
  started: boolean;
  step: number;
  completed: boolean;
  skipped: boolean;
}

/** The first anchor with that id that is actually on screen (the sidebar and the tab bar both carry it). */
function findAnchor(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/** Steps whose anchor is on screen, each with its element. */
function visibleSteps(steps: TourStep[]): { step: TourStep; el: HTMLElement }[] {
  const out: { step: TourStep; el: HTMLElement }[] = [];
  for (const step of steps) {
    const el = findAnchor(step.anchor);
    if (el) out.push({ step, el });
  }
  return out;
}

/**
 * The guided tour (PRD 5.27): starts by itself the first time a verified user lands on Home
 * (or when Settings → Replay tour sends them to /feed?tour=1), one coach mark per visible nav
 * item with Next / Back / Skip, keyboard alone, a focus trap, Esc to leave, an aria-live
 * announcement of each step and no motion when the person prefers less. Progress is saved so
 * a reload resumes; finishing or skipping means it never starts by itself again.
 */
export function TourHost({ tourId, initial }: { tourId: keyof typeof TOURS; initial: TourInitial }) {
  const tour = TOURS[tourId];
  const pathname = usePathname();
  const params = useSearchParams();
  const forced = params.get("tour") === "1";
  const [active, setActive] = useState<{ step: TourStep; el: HTMLElement }[] | null>(null);
  const [index, setIndex] = useState(0);
  // A tour that ended in this tab must not restart when the person comes back to Home.
  const ended = useRef(initial.completed || initial.skipped);
  const started = useRef(false);

  useEffect(() => {
    if (pathname !== tour.startPath || tour.steps.length === 0) return;
    if (started.current || (ended.current && !forced)) return;
    // Wait a frame so the shell's anchors are laid out.
    const frame = requestAnimationFrame(() => {
      const steps = visibleSteps(tour.steps);
      if (steps.length === 0) return;
      started.current = true;
      ended.current = false;
      // Drop ?tour=1 so a reload doesn't force a restart.
      if (forced) window.history.replaceState(null, "", pathname);
      setActive(steps);
      setIndex(forced ? 0 : Math.min(initial.step, steps.length - 1));
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, forced, tour, initial.completed, initial.step]);

  if (!active) return null;
  const finish = (outcome: "completed" | "skipped") => {
    ended.current = true;
    started.current = false;
    void saveTourProgress({ tour: tourId, step: index, outcome });
    setActive(null);
    // Give focus back to the page rather than leaving it on a removed button.
    active[index]?.el.focus?.();
  };
  const go = (next: number) => {
    setIndex(next);
    void saveTourProgress({ tour: tourId, step: next, outcome: "progress" });
  };
  return <CoachMark step={active[index].step} el={active[index].el} index={index} total={active.length} onBack={() => go(index - 1)} onNext={() => (index === active.length - 1 ? finish("completed") : go(index + 1))} onSkip={() => finish("skipped")} />;
}

function CoachMark({
  step,
  el,
  index,
  total,
  onBack,
  onNext,
  onSkip,
}: {
  step: TourStep;
  el: HTMLElement;
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const arrowRef = useRef<SVGSVGElement>(null);
  const [rect, setRect] = useState(() => el.getBoundingClientRect());
  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) onSkip();
    },
    elements: { reference: el },
    placement: "right",
    whileElementsMounted: autoUpdate,
    middleware: [offset(14), flip({ fallbackPlacements: ["bottom", "top", "left"] }), shift({ padding: 12 }), arrow({ element: arrowRef })],
  });
  const dismiss = useDismiss(context, { outsidePress: false });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);
  const isLast = index === total - 1;
  const spot = useMemo(() => rect, [rect]);

  // Keep the spotlight on the element through scrolling and resizing.
  useEffect(() => {
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [el]);

  return (
    <>
      {/* The spotlight: a ring around the element with a dimmed page around it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60] rounded-md shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] outline-2 outline-offset-2 outline-primary"
        style={{ top: spot.top - 4, left: spot.left - 4, width: spot.width + 8, height: spot.height + 8 }}
      />
      <FloatingPortal>
      <FloatingFocusManager context={context} modal initialFocus={-1} returnFocus={false}>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps({ "aria-label": "Guided tour", "aria-modal": true })}
          className="z-[61] w-[min(320px,calc(100vw-24px))] rounded-lg border border-border-strong bg-bg-elevated p-4 shadow-4"
          data-testid="tour-popover"
        >
          <FloatingArrow ref={arrowRef} context={context} className="fill-bg-elevated [&>path:first-of-type]:stroke-border-strong" />
          <p className="text-caption font-semibold text-text-secondary" data-testid="tour-progress">
            Step {index + 1} of {total}
          </p>
          <h2 className="mt-1 text-h3">{step.title}</h2>
          <p className="mt-1 text-body-sm text-text-secondary">{step.body}</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={onSkip} data-testid="tour-skip">
              Skip
            </Button>
            <div className="flex gap-2">
              {index > 0 ? (
                <Button variant="secondary" size="sm" onClick={onBack} data-testid="tour-back">
                  Back
                </Button>
              ) : null}
              <Button size="sm" onClick={onNext} autoFocus data-testid="tour-next">
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>
          {/* Read out by screen readers each time the step changes. */}
          <p className="sr-only" aria-live="polite" role="status">
            Step {index + 1} of {total}: {step.title}. {step.body}
          </p>
        </div>
      </FloatingFocusManager>
      </FloatingPortal>
    </>
  );
}
