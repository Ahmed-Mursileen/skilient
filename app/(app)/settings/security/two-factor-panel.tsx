"use client";

import { CheckCircle, DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { CodeInput } from "@/components/auth/code-input";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui";
import {
  confirmTotpEnrollment,
  regenerateBackupCodes,
  removeTotpFactor,
  startTotpEnrollment,
  type TotpEnrollment,
} from "@/lib/actions/mfa";
import type { ActionError } from "@/lib/actions/result";

export interface AuthenticatorSummary {
  id: string;
  name: string;
  addedAt: string;
}

const added = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Karachi" });

/**
 * Two-factor (PRD 10; decisions 2026-09-28): one or more authenticator apps, plus 10
 * single-use backup codes shown once when two-factor is turned on, and regenerable.
 */
export function TwoFactorPanel({
  authenticators,
  backupCodesLeft,
}: {
  authenticators: AuthenticatorSummary[];
  backupCodesLeft: number;
}) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startTotpEnrollment();
      if (result.ok) setEnrollment(result.data);
      else setError(result);
    });
  }

  if (codes) {
    return (
      <BackupCodes
        codes={codes}
        onDone={() => {
          setCodes(null);
          router.refresh();
        }}
      />
    );
  }

  if (enrollment) {
    return (
      <EnrollForm
        enrollment={enrollment}
        onCancel={() => setEnrollment(null)}
        onDone={(backupCodes) => {
          setEnrollment(null);
          if (backupCodes) setCodes(backupCodes);
          router.refresh();
        }}
      />
    );
  }

  if (!authenticators.length) {
    return (
      <div className="flex flex-col gap-3">
        {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
        <Button className="self-start" loading={pending} onClick={start}>
          Set up two-factor
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-center gap-2 text-body font-semibold">
        <CheckCircle aria-hidden weight="bold" className="size-5 text-success" />
        On
      </p>
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}

      <div>
        <h3 className="text-h4">Authenticator apps</h3>
        <ul className="mt-2 divide-y divide-border-muted">
          {authenticators.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-body">
                {a.name}
                <span className="text-text-secondary"> · added {added.format(new Date(a.addedAt))}</span>
              </span>
              <RemoveAuthenticator authenticator={a} last={authenticators.length === 1} onError={setError} />
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="mt-2" loading={pending} onClick={start}>
          Add another authenticator
        </Button>
      </div>

      <div>
        <h3 className="text-h4">Backup codes</h3>
        <p className="mt-1 text-body text-text-secondary">
          If you lose your phone, sign in with one of these instead of an app code. Each works once.{" "}
          <strong className="font-semibold text-text-primary">
            {backupCodesLeft} of 10 left.
          </strong>
        </p>
        <RegenerateCodes onCodes={setCodes} onError={setError} />
      </div>
    </div>
  );
}

function RemoveAuthenticator({
  authenticator,
  last,
  onError,
}: {
  authenticator: AuthenticatorSummary;
  last: boolean;
  onError: (e: ActionError) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={last ? "danger" : "ghost"} size="sm">
          {last ? "Turn off" : "Remove"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={last ? "Turn off two-factor?" : `Remove ${authenticator.name}?`}
        description={
          last
            ? "Signing in will need only your password again, and your backup codes will stop working."
            : "Codes from this app will stop working. Your other authenticators and backup codes keep working."
        }
      >
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep it</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              const form = new FormData();
              form.set("factorId", authenticator.id);
              startTransition(async () => {
                const result = await removeTotpFactor(form);
                if (result.ok) router.refresh();
                else onError(result);
              });
            }}
          >
            {last ? "Turn off" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateCodes({ onCodes, onError }: { onCodes: (codes: string[]) => void; onError: (e: ActionError) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="mt-3">
          Make new backup codes
        </Button>
      </DialogTrigger>
      <DialogContent title="Make new backup codes?" description="Your current backup codes will stop working straight away.">
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await regenerateBackupCodes();
                setOpen(false);
                if (result.ok) onCodes(result.data.backupCodes);
                else onError(result);
              })
            }
          >
            Make new codes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shown once, right after the codes are made. */
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `Skilient two-factor backup codes\nEach code works once.\n\n${codes.join("\n")}\n`;
  const download = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone="success">
        Two-factor backup codes are ready. Save them somewhere safe now: we won&apos;t show them again.
      </FormAlert>
      <ol
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border-default bg-bg-subtle p-4 font-mono text-code"
      >
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <a href={download} download="skilient-backup-codes.txt" onClick={() => setSaved(true)}>
            <DownloadSimple aria-hidden weight="bold" className="size-4" />
            Download
          </a>
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n")).then(() => setSaved(true));
          }}
        >
          Copy
        </Button>
      </div>
      <label className="flex items-center gap-2 text-body">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4" />
        I&apos;ve saved these codes
      </label>
      <Button className="self-start" disabled={!saved} onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function EnrollForm({
  enrollment,
  onCancel,
  onDone,
}: {
  enrollment: TotpEnrollment;
  onCancel: () => void;
  onDone: (backupCodes: string[] | null) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await confirmTotpEnrollment(form);
      if (result.ok) onDone(result.data.backupCodes);
      else setError(result);
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
          Confirm
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
