"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { acceptInvite, createOrganization, inviteMember, removeMember, revokeInvite, setMemberRole, updateCompanyPage } from "@/lib/actions/recruit";
import type { ActionError } from "@/lib/actions/result";
import { ORG_ROLE_LABELS, ORG_SIZES, type OrgRole } from "@/lib/recruit/constants";
import { ActionButton } from "@/components/teach/action-button";

/** /org/join (PRD 5.20): company name, website, industry, size, city and the signer's role. */
export function OrgJoinForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [size, setSize] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setError(null);
    startTransition(async () => {
      const result = await createOrganization({
        name: get("name"),
        website: get("website"),
        industry: get("industry"),
        size: size as (typeof ORG_SIZES)[number],
        city: get("city"),
        signerRole: get("signerRole"),
        linkedinUrl: get("linkedinUrl"),
        registrationNumber: get("registrationNumber"),
      });
      if (result.ok) router.refresh();
      else setError(result);
    });
  }

  const bind = (id: string) => ({ "aria-invalid": fields[id] ? (true as const) : undefined, "aria-describedby": fields[id] ? `${id}-error` : undefined });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-lg border border-border-default bg-bg-surface p-5" data-testid="org-join-form">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="name" label="Company name" error={fields.name}>
        <Input id="name" name="name" required maxLength={80} {...bind("name")} />
      </Field>
      <Field id="website" label="Company website" error={fields.website} helper={`Must match your work email domain (${domain}).`}>
        <Input id="website" name="website" type="url" required placeholder={`https://www.${domain}`} maxLength={200} {...bind("website")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="industry" label="Industry" error={fields.industry}>
          <Input id="industry" name="industry" required maxLength={60} placeholder="Software" {...bind("industry")} />
        </Field>
        <div className="flex flex-col gap-2">
          <label id="size-label" className="block text-label text-text-secondary uppercase">Company size</label>
          <Select value={size} onValueChange={setSize} name="size">
            <SelectTrigger aria-labelledby="size-label" data-testid="org-size" aria-invalid={fields.size ? true : undefined}>
              <SelectValue placeholder="Employees" />
            </SelectTrigger>
            <SelectContent>
              {ORG_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} people
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fields.size ? <p role="alert" className="text-body-sm text-text-error">{fields.size}</p> : null}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="city" label="Main city" error={fields.city}>
          <Input id="city" name="city" required maxLength={60} {...bind("city")} />
        </Field>
        <Field id="signerRole" label="Your role at the company" error={fields.signerRole}>
          <Input id="signerRole" name="signerRole" required maxLength={60} placeholder="Head of hiring" {...bind("signerRole")} />
        </Field>
      </div>
      <Field id="linkedinUrl" label="LinkedIn page (optional)" error={fields.linkedinUrl} helper="Helps us verify you faster.">
        <Input id="linkedinUrl" name="linkedinUrl" type="url" maxLength={200} placeholder="https://www.linkedin.com/company/…" {...bind("linkedinUrl")} />
      </Field>
      <Field id="registrationNumber" label="Registration or tax number (optional)" error={fields.registrationNumber}>
        <Input id="registrationNumber" name="registrationNumber" maxLength={60} {...bind("registrationNumber")} />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        Send for verification
      </Button>
    </form>
  );
}

export function CompanyPageForm({
  initial,
}: {
  initial: { about: string; locations: string[]; industry: string; size: string; linkedinUrl: string };
}) {
  const router = useRouter();
  const [size, setSize] = useState(initial.size);
  const [error, setError] = useState<ActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCompanyPage({
        about: String(f.get("about") ?? ""),
        locations: String(f.get("locations") ?? "")
          .split(/[,\n]/)
          .map((l) => l.trim())
          .filter(Boolean),
        industry: String(f.get("industry") ?? ""),
        size: size as (typeof ORG_SIZES)[number],
        linkedinUrl: String(f.get("linkedinUrl") ?? ""),
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else setError(result);
    });
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Saved.</FormAlert> : null}
      <Field id="about" label="About the company" error={fields.about} helper="Students read this before they answer a contact request. Up to 1,500 characters.">
        <Textarea id="about" name="about" rows={6} maxLength={1500} defaultValue={initial.about} />
      </Field>
      <Field id="locations" label="Locations" error={fields.locations} helper="Separate with commas. Up to 10.">
        <Input id="locations" name="locations" defaultValue={initial.locations.join(", ")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="industry" label="Industry" error={fields.industry}>
          <Input id="industry" name="industry" defaultValue={initial.industry} maxLength={60} required />
        </Field>
        <div className="flex flex-col gap-2">
          <label id="size2-label" className="block text-label text-text-secondary uppercase">Company size</label>
          <Select value={size} onValueChange={setSize} name="size">
            <SelectTrigger aria-labelledby="size2-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORG_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} people
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Field id="linkedinUrl" label="LinkedIn page" error={fields.linkedinUrl}>
        <Input id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={initial.linkedinUrl} maxLength={200} />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        Save company page
      </Button>
    </form>
  );
}

export function InviteForm({ seatsFree }: { seatsFree: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState<OrgRole>("recruiter");
  const [error, setError] = useState<ActionError | null>(null);
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    setError(null);
    setLink(null);
    startTransition(async () => {
      const result = await inviteMember({ email, role });
      if (result.ok) {
        setLink({ url: result.data.link, emailed: result.data.emailed });
        form.reset();
        router.refresh();
      } else setError(result);
    });
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-4">
      <h2 className="text-h4">Invite a teammate</h2>
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {link ? (
        <FormAlert tone="success">
          {link.emailed ? "Invite sent." : "Invite saved. The email didn't send from here, so share this link yourself:"}{" "}
          <span className="font-mono text-code-sm break-all" data-testid="invite-link">{link.url}</span>
        </FormAlert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field id="invite-email" label="Work email" helper="Must be on your company domain. The link works once and expires in 7 days.">
          <Input id="invite-email" name="email" type="email" required maxLength={254} placeholder="name@company.com" />
        </Field>
        <div className="flex flex-col gap-2">
          <label id="invite-role-label" className="block text-label text-text-secondary uppercase">Role</label>
          <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
            <SelectTrigger aria-labelledby="invite-role-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ORG_ROLE_LABELS) as OrgRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ORG_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" loading={pending} disabled={!seatsFree}>
          Send invite
        </Button>
      </div>
      {!seatsFree ? <p className="text-body-sm text-text-muted">Your plan has no free seats. Revoke an invite or remove a member first.</p> : null}
    </form>
  );
}

export function MemberRow({ userId, role, isMe }: { userId: string; role: OrgRole; isMe: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={role}
        onValueChange={(v) =>
          startTransition(async () => {
            setError(null);
            const r = await setMemberRole(userId, v as OrgRole);
            if (r.ok) router.refresh();
            else setError(r.message);
          })
        }
        disabled={pending}
      >
        <SelectTrigger aria-label="Role" className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ORG_ROLE_LABELS) as OrgRole[]).map((r) => (
            <SelectItem key={r} value={r}>
              {ORG_ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isMe ? (
        <ActionButton action={() => removeMember(userId)} variant="danger" size="sm">
          Remove
        </ActionButton>
      ) : null}
      {error ? <p role="alert" className="text-body-sm text-text-error">{error}</p> : null}
    </div>
  );
}

export function RevokeInviteButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => revokeInvite(id)} variant="secondary" size="sm">
      Revoke
    </ActionButton>
  );
}

export function AcceptInviteButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => acceptInvite(id)} variant="primary" testId="accept-invite">
      Join this organisation
    </ActionButton>
  );
}
