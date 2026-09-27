"use client";

import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { duration, easing } from "@/lib/motion";

/**
 * The Verified Stamp (PRD 9.4), the one 500 ms moment: the border sweeps down,
 * the shield settles 0.5 → 1.03 → 1.0, the row tints verified-subtle, and
 * "Verified" slides in after 200 ms. Reduced motion shows the end state only.
 */
export function VerifiedStamp({ children, animate = true, className }: { children: ReactNode; animate?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const still = reduce || !animate;

  return (
    <motion.div
      className={cn("relative flex items-center gap-3 overflow-hidden rounded-md border border-border-default px-4 py-3", className)}
      initial={still ? false : { backgroundColor: "rgba(0,0,0,0)" }}
      animate={{ backgroundColor: "var(--verified-subtle)" }}
      transition={{ duration: duration.slow, ease: easing.standard }}
    >
      <motion.span
        aria-hidden
        className="absolute top-0 left-0 w-0.5 bg-verified"
        initial={still ? false : { height: "0%" }}
        animate={{ height: "100%" }}
        transition={{ duration: duration.stamp, ease: easing.decelerate }}
      />
      <motion.span
        className="inline-flex text-verified"
        initial={still ? false : { scale: 0.5 }}
        animate={{ scale: [0.5, 1.03, 1] }}
        transition={{ duration: duration.stamp, ease: easing.decelerate, times: [0, 0.7, 1] }}
      >
        <ShieldCheck aria-hidden weight="fill" className="size-5" />
      </motion.span>
      <div className="min-w-0 flex-1 text-body text-text-primary">{children}</div>
      <motion.span
        className="text-body-sm font-semibold text-verified"
        initial={still ? false : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: still ? 0 : duration.base, duration: duration.slow, ease: easing.decelerate }}
      >
        Verified
      </motion.span>
    </motion.div>
  );
}
