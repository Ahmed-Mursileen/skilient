"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/teach/action-button";
import { Button, Field, Input, Switch, Textarea } from "@/components/ui";
import {
  applyToJob,
  blockCompany,
  closeContactChat,
  createTeam,
  inviteTeamMember,
  respondContactRequest,
  respondTeamInvite,
  saveRecruiterPrefs,
  submitRepo,
  unblockCompany,
  withdrawJobApplication,
} from "@/lib/actions/opportunities";
import { AVAILABILITY, AVAILABILITY_LABELS, type Availability } from "@/lib/recruit/constants";

export function BlockCompanyButton({ orgId, name, blocked }: { orgId: string; name: string; blocked: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
      <h2 className="text-h4">Don&apos;t want to hear from {name}?</h2>
      <p className="text-body-sm text-text-secondary">
        Blocking hides you from every recruiter at this company: they can&apos;t find you in search, open your profile or contact you. You can undo it any time in Settings, Privacy.
      </p>
      {blocked ? (
        <ActionButton action={() => unblockCompany(orgId)} testId="unblock-company">Unblock {name}</ActionButton>
      ) : (
        <ActionButton action={() => blockCompany(orgId)} variant="danger" testId="block-company">Block {name}</ActionButton>
      )}
    </div>
  );
}

export function ContactResponse({ id, closed, accepted }: { id: string; closed: boolean; accepted: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (accepted) {
    return closed ? null : (
      <ActionButton action={() => closeContactChat(id)} variant="secondary" size="sm" testId="close-chat">
        Close this conversation
      </ActionButton>
    );
  }
  function answer(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await respondContactRequest(id, accept, accept ? "" : reason);
      if (!r.ok) setError(r.message);
      else if (accept && r.data) router.push(`/chat/${r.data}`);
      else router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-3" data-testid="contact-response">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id={`reason-${id}`} label="Reason if you decline (optional)" helper="The recruiter is told you declined, not who you are.">
        <Input id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => answer(true)} loading={pending} data-testid="accept-contact">Accept and open chat</Button>
        <Button variant="secondary" onClick={() => answer(false)} loading={pending} data-testid="decline-contact">Decline</Button>
      </div>
      <p className="text-body-sm text-text-muted">Accepting shows your name to the recruiter and opens a chat labelled with the company. You can close it any time. Ignoring a request is fine: it expires on its own.</p>
    </div>
  );
}

export function ApplyForm({ jobId, unmet }: { jobId: string; unmet: string[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await applyToJob(jobId, note);
      if (r.ok) router.push(`/opportunities/applications/${r.data}`);
      else setError(r.message);
    });
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="apply-form">
      <h2 className="text-h3">Apply with your live CV</h2>
      {unmet.length > 0 ? (
        <FormAlert>You don&apos;t meet the requirements yet: {unmet.join(", ")}. Build that proof and come back.</FormAlert>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="note" label="Note to the recruiter (optional)" helper={`${note.length} of 300 characters`}>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />
      </Field>
      <Button type="submit" loading={pending} disabled={unmet.length > 0} className="self-start" data-testid="apply-submit">Apply</Button>
    </form>
  );
}

export function WithdrawButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => withdrawJobApplication(id)} variant="danger" size="sm" testId="withdraw">
      Withdraw application
    </ActionButton>
  );
}

/** Availability, city and remote for recruiters (PRD 5.20); shown only with recruiter visibility on. */
export function RecruiterPrefsForm({ availability, city, remote, visible }: { availability: string[]; city: string; remote: boolean; visible: boolean }) {
  const router = useRouter();
  const [avail, setAvail] = useState<string[]>(availability);
  const [cityValue, setCity] = useState(city);
  const [remoteOk, setRemote] = useState(remote);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveRecruiterPrefs({ availability: avail as Availability[], city: cityValue, remote: remoteOk });
      if (r.ok) {
        setSaved(true);
        router.refresh();
      } else setError(r.message);
    });
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="recruiter-prefs">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Saved.</FormAlert> : null}
      {!visible ? <p className="text-body-sm text-text-muted">Recruiters only see these while recruiter visibility is on.</p> : null}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-label text-text-secondary uppercase">Open to</legend>
        {AVAILABILITY.map((a) => (
          <label key={a} className="flex items-center gap-2 text-body">
            <input type="checkbox" className="size-4" checked={avail.includes(a)} onChange={(e) => setAvail((cur) => (e.target.checked ? [...cur, a] : cur.filter((x) => x !== a)))} />
            {AVAILABILITY_LABELS[a]}
          </label>
        ))}
      </fieldset>
      <Field id="city" label="City">
        <Input id="city" value={cityValue} onChange={(e) => setCity(e.target.value)} maxLength={60} placeholder="Islamabad" />
      </Field>
      <label className="flex items-center gap-3 text-body">
        <Switch checked={remoteOk} onCheckedChange={setRemote} aria-label="Open to remote work" />
        Open to remote work
      </label>
      <Button type="submit" loading={pending} className="self-start">Save</Button>
    </form>
  );
}

// Competitions ---------------------------------------------------------------------------
export function CreateTeamForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await createTeam(competitionId, name);
          if (r.ok) router.refresh();
          else setError(r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="team-name" label="Team name">
        <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </Field>
      <Button type="submit" loading={pending} className="self-start" data-testid="create-team">Create team</Button>
    </form>
  );
}

export function InviteTeammateForm({ competitionId, teamId }: { competitionId: string; teamId: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await inviteTeamMember(competitionId, teamId, username);
          if (r.ok) {
            setUsername("");
            router.refresh();
          } else setError(r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="teammate" label="Invite a teammate by username">
        <Input id="teammate" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={31} placeholder="username" />
      </Field>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">Invite</Button>
    </form>
  );
}

export function TeamInviteResponse({ competitionId, teamId }: { competitionId: string; teamId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton action={() => respondTeamInvite(competitionId, teamId, true)} variant="primary" testId="accept-team">Join the team</ActionButton>
      <ActionButton action={() => respondTeamInvite(competitionId, teamId, false)}>Decline</ActionButton>
    </div>
  );
}

export function SubmitRepoForm({ competitionId, teamId, current }: { competitionId: string; teamId: string; current: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await submitRepo(competitionId, teamId, url);
          if (r.ok) router.refresh();
          else setError(r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="repo" label="GitHub repository" helper="You can change it until the deadline. At the deadline we record the latest commit where it can be read.">
        <Input id="repo" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/team/project" />
      </Field>
      <Button type="submit" loading={pending} className="self-start" data-testid="submit-repo">Submit repository</Button>
    </form>
  );
}
