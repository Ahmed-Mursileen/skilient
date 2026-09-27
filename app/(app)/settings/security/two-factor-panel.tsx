"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { CodeInput } from "@/components/auth/code-input";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui";
import { confirmTotpEnrollment, removeTotpFactor, startTotpEnrollment, type TotpEnrollment } from "@/lib/actions/mfa";
import type { ActionError } from "@/lib/actions/result";

export function TwoFactorPanel({ factorId }: { factorId: string | null }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  if (factorId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-body font-semibold">
          <CheckCircle aria-hidden weight="bold" className="size-5 text-success" />
          On
        </p>
        {error ? <FormAlert requestId={error.requestId} className="w-full">{error.message}</FormAlert> : null}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="danger">Turn off</Button>
          </DialogTrigger>
          <DialogContent title="Turn off two-factor?" description="Signing in will need only your password again.">
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Keep it on</Button>
              </DialogClose>
              <Button
                variant="danger"
                loading={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set("factorId", factorId);
                  startTransition(async () => {
                    const result = await removeTotpFactor(form);
                    if (result.ok) router.refresh();
                    else setError(result);
                  });
                }}
              >
                Turn off
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="flex flex-col gap-3">
        {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
        <Button
          className="self-start"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await startTotpEnrollment();
              if (result.ok) setEnrollment(result.data);
              else setError(result);
            })
          }
        >
          Set up two-factor
        </Button>
      </div>
    );
  }

  function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await confirmTotpEnrollment(form);
      if (result.ok) {
        setEnrollment(null);
        setCode("");
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <form onSubmit={onConfirm} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <ol className="flex list-decimal flex-col gap-4 pl-5 text-body text-text-secondary">
        <li>
          Scan this QR code with your authenticator app.
          {/* Supabase returns the QR as an SVG data URI; CSP allows data: images. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrollment.qrCode}
            alt="QR code for your authenticator app"
            width={176}
            height={176}
            className="mt-3 size-44 rounded-md border border-border-default bg-white p-2"
          />
          <p className="mt-3 text-body-sm">
            Can&apos;t scan it? Enter this key instead:{" "}
            <code className="font-mono text-code break-all text-text-primary select-all">{enrollment.secret}</code>
          </p>
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <CodeInput id="totp-code" label="Code from the app" value={code} onChange={setCode} error={error?.fields?.code} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending} disabled={code.length !== 6}>
          Turn on two-factor
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEnrollment(null)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
