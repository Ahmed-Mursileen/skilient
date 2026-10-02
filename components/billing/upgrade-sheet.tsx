"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui";

/**
 * The upgrade sheet (PRD 4b.4): any action refused with `payment_required` opens it with the database's own
 * words. Mounted once in the app layout; components call `showUpgrade(result)` after a refusal. It only
 * explains and links to billing: it never grants anything.
 */
const EVENT = "skilient:payment-required";

export function showUpgrade(result: { ok: boolean; code?: string; message?: string }): boolean {
  if (result.ok || result.code !== "payment_required") return false;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: result.message ?? "" }));
  return true;
}

function billingHome(pathname: string): string {
  if (pathname.startsWith("/uni")) return "/uni/billing";
  if (pathname.startsWith("/recruit") || pathname.startsWith("/org")) return "/org/billing";
  return "/settings/billing";
}

export function UpgradeSheetHost() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMessage((e as CustomEvent<string>).detail || "This isn't included in your plan.");
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && setMessage(null)}>
      {message !== null ? (
        <DialogContent title="This needs a different plan" description={message} data-testid="upgrade-sheet">
          <p className="text-body text-text-secondary">
            Proof stays free: verification, levels, ranking and being found never depend on a plan. Paid plans add tools and polish.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Not now</Button>
            </DialogClose>
            <Button asChild>
              <Link href={billingHome(pathname) as Route} onClick={() => setMessage(null)}>
                See plans
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
