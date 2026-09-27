"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { CodeInput } from "@/components/auth/code-input";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui";
import { resendVerificationCode, verifyEmailCode } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";
import { hardNavigate, onAuthMessage } from "@/lib/auth/channel";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN = 60;

/**
 * "Check your inbox" (PRD 5.2): the code works here; the link works in any tab or device.
 * If the link is opened in another tab of this browser, this tab notices (auth events,
 * a broadcast from /auth/confirmed, focus, and a light poll) and moves on by itself.
 */
function useAdvanceWhenConfirmed() {
  useEffect(() => {
    const supabase = createClient();
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      hardNavigate("/feed");
    };
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user?.email_confirmed_at) go();
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.email_confirmed_at) go();
    });
    const stopChannel = onAuthMessage((m) => {
      if (m === "confirmed") void check();
    });
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void check(), 4000);
    return () => {
      subscription.unsubscribe();
      stopChannel();
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, []);
}

export function VerifyForm() {
  useAdvanceWhenConfirmed();
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [pending, startTransition] = useTransition();
  const [resending, startResend] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await verifyEmailCode(form);
      if (result && !result.ok) setError(result);
    });
  }

  function onResend() {
    setError(null);
    setNotice(null);
    startResend(async () => {
      const result = await resendVerificationCode();
      if (result.ok) {
        setNotice("We sent a new code. Older codes stop working.");
        setCode("");
        setCooldown(RESEND_COOLDOWN);
      } else {
        setError(result);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
      <CodeInput id="code" label="6-digit code" value={code} onChange={setCode} error={error?.fields?.code} autoFocus />
      <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6 || resending}>
        Confirm email
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-text-secondary">
        <span>Didn&apos;t get it? Check spam, then:</span>
        <Button type="button" variant="ghost" size="sm" onClick={onResend} loading={resending} disabled={cooldown > 0 || pending}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </Button>
      </div>
    </form>
  );
}
