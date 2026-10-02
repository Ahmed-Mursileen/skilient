"use client";

import { useEffect, useState } from "react";
import { FieldError } from "@/components/ui";
import { checkinCode } from "@/lib/actions/uni";

/** The organiser's screen: a QR that changes every 30 seconds (the previous one still works). */
export function CheckinScreen({ eventId }: { eventId: string }) {
  const [state, setState] = useState<{ qr: string; going: number; checkedIn: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const tick = async () => {
      const r = await checkinCode(eventId);
      if (!alive) return;
      if (!r.ok) {
        setError(r.message);
        timer = setTimeout(tick, 30_000);
        return;
      }
      setError(null);
      setState({ qr: r.data.qr, going: r.data.going, checkedIn: r.data.checkedIn });
      const wait = Math.max(2_000, new Date(r.data.changesAt).getTime() - Date.now() + 500);
      timer = setTimeout(tick, Math.min(wait, 30_000));
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [eventId]);
  return (
    <div className="flex flex-col items-center gap-4">
      {state ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URI drawn on the server
        <img src={state.qr} alt="Check-in code: scan it with your phone camera" className="size-72 rounded-lg bg-white p-4" data-testid="checkin-qr" />
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      <p className="text-body" aria-live="polite">{state ? `${state.checkedIn} checked in of ${state.going} going` : "Loading the code…"}</p>
    </div>
  );
}
