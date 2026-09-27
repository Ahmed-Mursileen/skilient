"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F0EFED", color: "#0E0D0B", padding: 32 }}>
        <h1>Something went wrong</h1>
        <p>We&apos;ve been notified. {error.digest ? `Ref: ${error.digest.slice(0, 8)}` : null}</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
