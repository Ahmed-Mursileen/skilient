"use client";

/* Floating UI hands out ref setters and prop getters that the React compiler lint reads as ref access
   during render; they are the documented way to wire it and only run in event handlers and effects. */
/* eslint-disable react-hooks/refs */

import {
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement } from "react";
import { cn } from "@/lib/cn";

/**
 * A hover, keyboard-focus and long-press tooltip (PRD 5.27 nav tooltips). The one-line
 * description is always in the page for screen readers through aria-describedby; the popup
 * itself is presentation. Long-press (500 ms) shows it on a phone, where there is no hover.
 */
export function Tooltip({
  label,
  description,
  placement = "right",
  longPress = false,
  className = "inline-flex",
  children,
}: {
  label: string;
  description: string;
  placement?: Placement;
  longPress?: boolean;
  /** Display of the wrapper around the child: "block" or "flex" when the child fills its row. */
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const descId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  const hover = useHover(context, { move: false, delay: { open: 350, close: 0 }, mouseOnly: true });
  const focus = useFocus(context, { visibleOnly: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  if (!isValidElement(children)) return children;

  const press = longPress
    ? {
        onTouchStart: () => {
          timer.current = setTimeout(() => setOpen(true), 500);
        },
        onTouchEnd: () => {
          if (timer.current) clearTimeout(timer.current);
          if (open) setTimeout(() => setOpen(false), 1600);
        },
        onTouchMove: () => {
          if (timer.current) clearTimeout(timer.current);
        },
        onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
      }
    : {};

  // The wrapper is the reference the popup anchors to; hover, focus (which bubbles from the
  // link inside) and long-press are read from it. The child only gains aria-describedby.
  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps(press)} className={className}>
        {cloneElement(children, { "aria-describedby": descId })}
      </span>
      <span id={descId} className="sr-only">
        {description}
      </span>
      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "pointer-events-none z-50 max-w-[240px] rounded-md border border-border-default bg-bg-elevated px-3 py-2 shadow-3",
            )}
          >
            <p className="text-body-sm font-semibold text-text-primary">{label}</p>
            <p className="text-caption text-text-secondary">{description}</p>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
