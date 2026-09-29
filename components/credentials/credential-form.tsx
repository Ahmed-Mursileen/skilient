"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Input } from "@/components/ui";
import { submitCredentialImage, submitCredentialPdf } from "@/lib/actions/credentials";
import type { ActionError } from "@/lib/actions/result";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { CREDENTIAL_ACCEPT, CREDENTIAL_BUCKET, CREDENTIAL_PDF_MAX_BYTES } from "@/lib/credentials/constants";
import { downscaleForUpload } from "@/lib/images/downscale";
import { createClient } from "@/lib/supabase/client";

/**
 * Add a credential (PRD 5.19): a PDF up to 5 MB goes straight from the browser to the
 * student's private folder (Vercel refuses larger request bodies) and the server checks it;
 * an image is shrunk here and re-encoded on the server, which strips EXIF and GPS.
 */
export function CredentialForm() {
  const router = useRouter();
  const user = useCurrentUser();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    setError(null);
    setDone(false);
    if (!(file instanceof File) || file.size === 0) {
      setError({ ok: false, code: "invalid_file", message: "Choose a file.", fields: { file: "Choose a PDF or an image." } });
      return;
    }
    startTransition(async () => {
      const text = {
        title: String(data.get("title") ?? ""),
        issuer: String(data.get("issuer") ?? ""),
        issuedOn: String(data.get("issuedOn") ?? ""),
        expiresOn: String(data.get("expiresOn") ?? ""),
        verifyUrl: String(data.get("verifyUrl") ?? ""),
      };
      let result;
      if (file.type === "application/pdf") {
        if (file.size > CREDENTIAL_PDF_MAX_BYTES) {
          setError({ ok: false, code: "invalid_file", message: "PDFs can be up to 5 MB.", fields: { file: "PDFs can be up to 5 MB." } });
          return;
        }
        if (!user) {
          setError({ ok: false, code: "no_session", message: "Your session expired. Sign in again." });
          return;
        }
        const path = `${user.id}/${crypto.randomUUID()}.pdf`;
        const upload = await createClient().storage.from(CREDENTIAL_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
        if (upload.error) {
          setError({ ok: false, code: "upload_failed", message: "Couldn't upload the file. Try again." });
          return;
        }
        result = await submitCredentialPdf({ ...text, path });
      } else {
        let image: File;
        try {
          image = await downscaleForUpload(file);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Use a PDF, JPEG, PNG or WebP file.";
          setError({ ok: false, code: "invalid_file", message, fields: { file: message } });
          return;
        }
        const body = new FormData();
        for (const [k, v] of Object.entries(text)) body.set(k, v);
        body.set("file", image);
        result = await submitCredentialImage(body);
      }
      if (result.ok) {
        form.current?.reset();
        setDone(true);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  const described = (name: string, helper = false) => (fields[name] ? `${id}-${name}-error` : helper ? `${id}-${name}-helper` : undefined);

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-h3">
        Add a credential
      </h2>
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {done ? (
        <p role="status" className="text-body-sm text-text-primary">
          Sent for review. We&apos;ll tell you when it&apos;s approved.
        </p>
      ) : null}
      <Field id={`${id}-file`} label="Certificate file" error={fields.file} helper="A PDF up to 5 MB, or a photo or scan (JPEG, PNG or WebP).">
        <Input
          id={`${id}-file`}
          name="file"
          type="file"
          accept={CREDENTIAL_ACCEPT}
          required
          aria-invalid={fields.file ? true : undefined}
          aria-describedby={described("file", true)}
          className="py-2"
        />
      </Field>
      <Field id={`${id}-title-input`} label="Title" error={fields.title}>
        <Input id={`${id}-title-input`} name="title" maxLength={120} required placeholder="AWS Certified Cloud Practitioner" aria-invalid={fields.title ? true : undefined} aria-describedby={described("title")} />
      </Field>
      <Field id={`${id}-issuer`} label="Issued by" error={fields.issuer}>
        <Input id={`${id}-issuer`} name="issuer" maxLength={120} required placeholder="Amazon Web Services" aria-invalid={fields.issuer ? true : undefined} aria-describedby={described("issuer")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-issued`} label="Issued on" error={fields.issuedOn}>
          <Input id={`${id}-issued`} name="issuedOn" type="date" required aria-invalid={fields.issuedOn ? true : undefined} aria-describedby={described("issuedOn")} />
        </Field>
        <Field id={`${id}-expires`} label="Expires on (optional)" error={fields.expiresOn}>
          <Input id={`${id}-expires`} name="expiresOn" type="date" aria-invalid={fields.expiresOn ? true : undefined} aria-describedby={described("expiresOn")} />
        </Field>
      </div>
      <Field id={`${id}-verify`} label="Verification link (optional)" error={fields.verifyUrl} helper="A link where the issuer confirms it, such as Credly. It speeds up review.">
        <Input id={`${id}-verify`} name="verifyUrl" type="url" inputMode="url" maxLength={500} placeholder="https://" aria-invalid={fields.verifyUrl ? true : undefined} aria-describedby={described("verifyUrl", true)} />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        Send for review
      </Button>
    </form>
  );
}
