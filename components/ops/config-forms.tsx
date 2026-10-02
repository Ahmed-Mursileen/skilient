"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { editSkill, saveConfig, setPlanPrice } from "@/lib/actions/ops/config";
import { cn } from "@/lib/cn";
import { configDiff } from "@/lib/ops/diff";

/** The versioned editor: edit the JSON, see exactly what changes, give a reason, save a new version. */
export function ConfigEditor({ configKey, current, version, applies }: { configKey: string; current: unknown; version: number | null; applies: "now" | "next_nightly" }) {
  const uid = useId();
  const initial = useMemo(() => JSON.stringify(current, null, 2), [current]);
  const [text, setText] = useState(initial);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false as const };
    }
  }, [text]);
  const changes = parsed.ok ? configDiff(current, parsed.value) : [];
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(null);
        startTransition(async () => {
          const result = await saveConfig(configKey, text, reason, version);
          if (result.ok) {
            setSaved(result.data);
            setReason("");
          } else setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        New version
      </h2>
      <p className="text-body-sm text-text-secondary">
        {applies === "next_nightly" ? "Takes effect at the next nightly ranking run." : "Takes effect as soon as it is saved."} The value must keep the same fields and
        types; numbers can&apos;t be negative.
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Saved as version {saved}.</FormAlert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-v`}>Value (JSON)</Label>
        <Textarea
          id={`${uid}-v`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(24, Math.max(4, initial.split("\n").length + 1))}
          spellCheck={false}
          className="font-mono text-caption"
          aria-invalid={!parsed.ok}
          aria-describedby={`${uid}-diff`}
        />
        {!parsed.ok ? <FieldError>That isn&apos;t valid JSON yet.</FieldError> : null}
      </div>
      <section id={`${uid}-diff`} aria-label="What changes" className="flex flex-col gap-1" data-testid="config-diff">
        <p className="text-body-sm font-semibold">What changes</p>
        {changes.length ? (
          <table className="w-full text-left font-mono text-caption">
            <thead className="text-text-secondary">
              <tr>
                <th scope="col" className="py-1 pr-3 font-semibold">Field</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Now</th>
                <th scope="col" className="py-1 font-semibold">New</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.key} className="align-top">
                  <th scope="row" className="py-1 pr-3 font-semibold">{c.key}</th>
                  <td className="py-1 pr-3 break-all line-through decoration-text-secondary">{c.before ?? "—"}</td>
                  <td className="py-1 break-all">{c.after ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-caption text-text-secondary">{parsed.ok ? "Nothing yet." : "Fix the JSON to see the changes."}</p>
        )}
      </section>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-r`}>Reason</Label>
        <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={pending} disabled={!parsed.ok || !changes.length}>
          Save version {(version ?? 0) + 1}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setText(initial)}>
          Reset
        </Button>
      </div>
    </form>
  );
}

/** One plan's prices (super admins). New subscriptions and renewals use them. */
export function PlanPriceForm({ planId, label, pkr, usd }: { planId: string; label: string; pkr: number | null; usd: number | null }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(pkr?.toString() ?? "");
  const [u, setU] = useState(usd?.toString() ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Change the price of ${label}`}>
          Change
        </Button>
      </DialogTrigger>
      <DialogContent title={`Price of ${label}`} description="Applies to new subscriptions and to renewals from their next period. Paid periods keep their price.">
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-p`}>PKR</Label>
            <Input id={`${uid}-p`} inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} disabled={pkr === null} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-u`}>USD</Label>
            <Input id={`${uid}-u`} inputMode="decimal" value={u} onChange={(e) => setU(e.target.value)} disabled={usd === null} />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor={`${uid}-r`}>Reason</Label>
            <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await setPlanPrice(planId, p, u, reason);
                if (result.ok) setOpen(false);
                else setError(result.message);
              })
            }
          >
            Save price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CATEGORIES = ["language", "framework", "library", "tool", "platform", "practice"] as const;

/** Add a skill to the dictionary (trust reviewers). */
export function AddSkillForm() {
  const uid = useId();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("framework");
  const [parent, setParent] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        startTransition(async () => {
          const result = await editSkill({ action: "add", id: id.trim().toLowerCase(), name, category, parent, reason });
          if (result.ok) {
            setDone(`${name} added.`);
            setId("");
            setName("");
            setParent("");
            setReason("");
          } else setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        Add a skill
      </h2>
      <p className="text-body-sm text-text-secondary">New skills have no GitHub detectors until a developer adds them; credentials, endorsements and code checks can still prove them.</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {done ? <FormAlert tone="success">{done}</FormAlert> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-id`}>Id</Label>
          <Input id={`${uid}-id`} value={id} onChange={(e) => setId(e.target.value)} maxLength={40} placeholder="qwik" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-n`}>Name</Label>
          <Input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-c`}>Category</Label>
          <select id={`${uid}-c`} value={category} onChange={(e) => setCategory(e.target.value)} className={cn(controlBase, "h-10")}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-p`}>Parent id (optional)</Label>
          <Input id={`${uid}-p`} value={parent} onChange={(e) => setParent(e.target.value)} maxLength={40} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-r`}>Reason</Label>
        <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </div>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        Add skill
      </Button>
    </form>
  );
}

/** Rename, retire or restore one skill. */
export function SkillAction({ id, name, action }: { id: string; name: string; action: "rename" | "retire" | "restore" }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(name);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const verb = action === "rename" ? "Rename" : action === "retire" ? "Retire" : "Restore";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`${verb} ${name}`}>
          {verb}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`${verb} ${name}?`}
        description={action === "retire" ? "Retired skills stop being offered for new evidence; levels already earned stay on profiles." : action === "restore" ? "It is offered again." : "The new name shows everywhere the skill appears."}
      >
        <div className="mt-4 flex flex-col gap-3">
          {action === "rename" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-n`}>New name</Label>
              <Input id={`${uid}-n`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-r`}>Reason</Label>
            <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant={action === "retire" ? "danger" : "primary"}
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await editSkill({ action, id, name: action === "rename" ? newName : "", category: "", parent: "", reason });
                if (result.ok) setOpen(false);
                else setError(result.message);
              })
            }
          >
            {verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
