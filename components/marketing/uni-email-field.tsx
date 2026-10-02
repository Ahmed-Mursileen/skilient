"use client";

import { CheckCircle, Info, Question, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Input, Label } from "@/components/ui/field";
import { emailField as copy, requestUniversity as requestCopy } from "@/content/marketing";
import { detectUniversity, normalizeEmail, universityLabel, type Detection, type DomainDirectory } from "@/lib/auth/email-domain";
import { fetchDomainDirectory } from "@/lib/hooks/use-domain-directory";
import { UniversityRequestForm } from "./university-request-form";

export type InitialEmailState = "personal" | "invalid" | null;

const DEBOUNCE_MS = 300;

/**
 * The university email field (PRD 5.1, hero and final CTA). The domain list loads on first
 * focus (one CDN-cached request) and the domain is matched locally 300 ms after typing stops.
 * Live: Join goes to /signup with the email. Personal: "Use your university email". Known but
 * not live, or unknown: "Request it" opens the request sheet. Without JavaScript the form posts
 * to /join, which makes the same decision on the server.
 */
export function UniEmailField({
  defaultEmail = "",
  initialState = null,
  siteKey,
  idPrefix,
}: {
  defaultEmail?: string;
  initialState?: InitialEmailState;
  siteKey: string | null;
  idPrefix: string;
}) {
  const router = useRouter();
  const uid = useId();
  const inputId = `${idPrefix}-email-${uid}`;
  const statusId = `${idPrefix}-status-${uid}`;
  const [email, setEmail] = useState(defaultEmail);
  const [directory, setDirectory] = useState<DomainDirectory | null>(null);
  const [detection, setDetection] = useState<Detection | null>(
    initialState ? (initialState === "personal" ? { kind: "personal", domain: "" } : { kind: "invalid" }) : null,
  );
  const [showInvalid, setShowInvalid] = useState(initialState === "invalid");
  const [sheetFor, setSheetFor] = useState<{ email: string; university: string | null } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!directory) fetchDomainDirectory().then((d) => d && setDirectory(d));
  };

  // Detect after typing pauses; the directory is local, so there's no request per keystroke.
  useEffect(() => {
    if (!directory) return;
    const t = window.setTimeout(() => setDetection(detectUniversity(email, directory)), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [email, directory]);

  useEffect(() => {
    const d = dialog.current;
    if (sheetFor && d && !d.open) d.showModal();
  }, [sheetFor]);

  const openSheet = (d: Detection) => {
    setSheetFor({ email: normalizeEmail(email), university: d.kind === "not_live" ? universityLabel(d.universities) : null });
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // No directory yet (or it failed): let the form post to /join and the server decide.
    if (!directory) return;
    event.preventDefault();
    const d = detectUniversity(email, directory);
    setDetection(d);
    if (d.kind === "match") {
      router.push(`/signup?email=${encodeURIComponent(normalizeEmail(email))}`);
    } else if (d.kind === "not_live" || d.kind === "unknown") {
      openSheet(d);
    } else {
      setShowInvalid(true);
      input.current?.focus();
    }
  }

  const visible = detection && (detection.kind !== "invalid" || showInvalid) && detection.kind !== "empty" ? detection : null;
  const tone = visible?.kind === "match" ? "ok" : visible?.kind === "personal" || visible?.kind === "invalid" ? "error" : "info";

  return (
    <>
      <form action="/join" method="get" onSubmit={onSubmit} className="flex w-full max-w-xl flex-col gap-2" noValidate>
        <Label htmlFor={inputId}>{copy.label}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={input}
            id={inputId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder={copy.placeholder}
            value={email}
            onFocus={load}
            onChange={(e) => {
              load();
              setEmail(e.target.value);
              setShowInvalid(false);
            }}
            aria-invalid={tone === "error" ? true : undefined}
            aria-describedby={statusId}
            className="h-12 min-w-0 text-body-lg sm:flex-1"
            data-testid={`${idPrefix}-email`}
          />
          <button
            type="submit"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-primary px-6 text-body-lg font-semibold text-text-on-primary transition-[background-color,transform] duration-[120ms] ease-standard hover:bg-primary-hover active:scale-[0.98] active:bg-primary-active"
          >
            {copy.submit}
          </button>
        </div>
        <div id={statusId} aria-live="polite" className="min-h-6 text-body" data-testid={`${idPrefix}-status`}>
          {visible ? (
            <p key={`${visible.kind}-${"domain" in visible ? visible.domain : ""}`} className="detect-in flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusIcon kind={visible.kind} />
              <span className={tone === "error" ? "text-text-error" : tone === "ok" ? "text-text-primary" : "text-text-secondary"}>
                {message(visible)}
              </span>
              {visible.kind === "not_live" || visible.kind === "unknown" ? (
                <button type="button" onClick={() => openSheet(visible)} className="font-semibold text-text-primary underline underline-offset-4">
                  {copy.request}
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </form>
      <dialog
        ref={dialog}
        onClose={() => setSheetFor(null)}
        aria-labelledby={`${idPrefix}-sheet-title`}
        className="request-sheet bg-bg-elevated text-text-primary"
      >
        {sheetFor ? (
          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <h2 id={`${idPrefix}-sheet-title`} className="font-display text-h2">
                {requestCopy.title}
              </h2>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label="Close"
                className="-mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-bg-subtle"
              >
                <X aria-hidden weight="bold" className="size-5" />
              </button>
            </div>
            <p className="text-body text-text-secondary">{requestCopy.intro}</p>
            <UniversityRequestForm defaultEmail={sheetFor.email} university={sheetFor.university} siteKey={siteKey} idPrefix={`${idPrefix}-sheet`} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function message(d: Detection): string {
  switch (d.kind) {
    case "match":
      return d.universities.length === 1 ? copy.live.replace("{name}", d.universities[0].name) : copy.liveShared;
    case "personal":
      return copy.personal;
    case "invalid":
      return copy.invalid;
    case "not_live":
      return copy.notLive.replace("{name}", universityLabel(d.universities));
    case "unknown":
      return copy.unknown;
    default:
      return "";
  }
}

function StatusIcon({ kind }: { kind: Detection["kind"] }) {
  const cls = "size-5 shrink-0";
  if (kind === "match") return <CheckCircle aria-hidden weight="bold" className={`${cls} text-success`} />;
  if (kind === "personal" || kind === "invalid") return <WarningCircle aria-hidden weight="bold" className={`${cls} text-text-error`} />;
  if (kind === "unknown") return <Question aria-hidden weight="bold" className={`${cls} text-text-muted`} />;
  return <Info aria-hidden weight="bold" className={`${cls} text-text-muted`} />;
}
