"use client";

import { ImageSquare, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, FieldError, HelperText, Input, Label, Textarea } from "@/components/ui";
import { createPost } from "@/lib/actions/posts";
import { prepareImages } from "@/lib/images/downscale";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/cn";

type Kind = "general" | "event" | "poll" | "invite" | "announcement";

const KINDS: { value: Kind; label: string }[] = [
  { value: "general", label: "Post" },
  { value: "event", label: "Event" },
  { value: "poll", label: "Poll" },
  { value: "invite", label: "Venture invite" },
  { value: "announcement", label: "Announcement" },
];

interface Draft {
  kind: Kind;
  audience: "university" | "global";
  body: string;
}

function readDraft(key: string): Draft | null {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as Draft) : null;
  } catch {
    return null;
  }
}

type ComposerProps = {
  userId: string;
  defaultAudience: "university" | "global";
  ventures: { id: string; title: string; visibility: string }[];
  isStaff: boolean;
};

/**
 * The saved draft lives in this browser only, so the form mounts after hydration with
 * the draft already in its initial state (no flash, no effect-driven reset).
 */
export function Composer(props: ComposerProps) {
  const mounted = useMounted();
  if (!mounted) {
    return <div aria-hidden className="h-[228px] rounded-lg border border-border-default bg-bg-surface" data-testid="composer-placeholder" />;
  }
  return <ComposerForm {...props} draft={readDraft(`sk:draft:${props.userId}`)} />;
}

/**
 * Composer (PRD 5.6, 5.28). The text draft saves to this browser as you type (images
 * aren't kept). Every limit is checked again on the server.
 */
function ComposerForm({ userId, defaultAudience, ventures, isStaff, draft }: ComposerProps & { draft: Draft | null }) {
  const router = useRouter();
  const id = useId();
  const draftKey = `sk:draft:${userId}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const restoredKind =
    draft?.kind && (draft.kind !== "announcement" || isStaff) && (draft.kind !== "invite" || ventures.length) ? draft.kind : "general";
  const [kind, setKind] = useState<Kind>(restoredKind);
  const [audience, setAudience] = useState<"university" | "global">(draft?.audience ?? defaultAudience);
  const [body, setBody] = useState(draft?.body ?? "");
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [ventureId, setVentureId] = useState(ventures[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [place, setPlace] = useState("");
  const [link, setLink] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [days, setDays] = useState(3);
  const [pinDays, setPinDays] = useState(0);
  const [error, setError] = useState<{ message: string; fields?: Record<string, string>; requestId?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, startTransition] = useTransition();

  // Keep the text draft (PRD 5.28 "Drafts save automatically").
  useEffect(() => {
    try {
      if (body.trim()) localStorage.setItem(draftKey, JSON.stringify({ kind, audience, body } satisfies Draft));
      else localStorage.removeItem(draftKey);
    } catch {
      /* storage unavailable */
    }
  }, [draftKey, kind, audience, body]);
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.url)), [images]);

  const kinds = KINDS.filter((k) => (k.value !== "announcement" || isStaff) && (k.value !== "invite" || ventures.length > 0));
  const allowsImages = kind === "general" || kind === "invite" || kind === "event";
  const selectedVenture = ventures.find((v) => v.id === ventureId);
  const globalAllowed = kind !== "invite" || selectedVenture?.visibility === "public";

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setPreparing(true);
    try {
      const existing = images.map((i) => i.file);
      const all = await prepareImages(existing, Array.from(list));
      const added = all.slice(existing.length).map((file) => ({ file, url: URL.createObjectURL(file) }));
      setImages([...images, ...added]);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "That image couldn't be added." });
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const effectiveAudience = globalAllowed ? audience : "university";
    const data: Record<string, unknown> = { type: kind, body, audience: effectiveAudience };
    if (kind === "invite") data.ventureId = ventureId;
    if (kind === "announcement") data.pinDays = pinDays;
    if (kind === "event") {
      const when = startsAt ? new Date(startsAt) : null;
      data.startsAt = when && !Number.isNaN(when.getTime()) ? when.toISOString() : "";
      data.place = place;
      data.url = link;
    }
    if (kind === "poll") {
      data.options = options;
      data.days = days;
    }
    const form = new FormData();
    form.set("data", JSON.stringify(data));
    if (allowsImages) images.forEach((i) => form.append("images", i.file));
    startTransition(async () => {
      const result = await createPost(form);
      if (!result.ok) {
        setError({ message: result.message, fields: result.fields, requestId: result.requestId });
        return;
      }
      setBody("");
      setImages([]);
      setOptions(["", ""]);
      setStartsAt("");
      setPlace("");
      setLink("");
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* storage unavailable */
      }
      setNotice("Posted.");
      router.refresh();
    });
  }

  const fieldError = (name: string) => error?.fields?.[name];

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-4" aria-label="New post" data-testid="composer">
      <div role="radiogroup" aria-label="Post type" className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => {
              setKind(k.value);
              setError(null);
            }}
            className={cn(
              "h-9 rounded-md border px-3 text-body-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              kind === k.value ? "border-primary bg-primary-subtle text-text-primary" : "border-border-default text-text-secondary hover:border-border-strong",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}

      {kind === "invite" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-venture`}>Venture</Label>
          <select
            id={`${id}-venture`}
            value={ventureId}
            onChange={(e) => setVentureId(e.target.value)}
            className="h-10 rounded-md border border-border-default bg-bg-subtle px-3 text-body"
          >
            {ventures.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
          <HelperText>Readers see its open roles and an Apply button.</HelperText>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-body`}>{kind === "poll" ? "Question" : kind === "event" ? "What's happening" : "What's on your mind?"}</Label>
        <Textarea
          id={`${id}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={kind === "poll" ? 2 : 4}
          maxLength={2000}
          aria-invalid={fieldError("body") ? true : undefined}
          aria-describedby={`${id}-count`}
        />
        <div className="flex justify-between gap-2">
          {fieldError("body") ? <FieldError>{fieldError("body")}</FieldError> : <span />}
          <span id={`${id}-count`} className="text-caption text-text-secondary tabular-nums">
            {body.length}/2,000
          </span>
        </div>
      </div>

      {kind === "event" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-when`}>Date and time</Label>
            <Input id={`${id}-when`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-invalid={fieldError("startsAt") ? true : undefined} />
            {fieldError("startsAt") ? <FieldError>{fieldError("startsAt")}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-place`}>Place</Label>
            <Input id={`${id}-place`} value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} aria-invalid={fieldError("place") ? true : undefined} />
            {fieldError("place") ? <FieldError>{fieldError("place")}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-link`}>Or a link</Label>
            <Input id={`${id}-link`} type="url" inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        </div>
      ) : null}

      {kind === "poll" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label text-text-secondary uppercase">Options</legend>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Option ${i + 1}`}
                value={o}
                maxLength={80}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {options.length > 2 ? (
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  <X aria-hidden weight="bold" className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {fieldError("options") ? <FieldError>{fieldError("options")}</FieldError> : null}
          <div className="flex flex-wrap items-center gap-3">
            {options.length < 4 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setOptions([...options, ""])}>
                Add an option
              </Button>
            ) : null}
            <label className="flex items-center gap-2 text-body-sm">
              Closes after
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border border-border-default bg-bg-subtle px-2">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      ) : null}

      {kind === "announcement" ? (
        <label className="flex items-center gap-2 text-body-sm">
          Pin to the top for
          <select value={pinDays} onChange={(e) => setPinDays(Number(e.target.value))} className="h-9 rounded-md border border-border-default bg-bg-subtle px-2">
            <option value={0}>Don&apos;t pin</option>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "day" : "days"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {allowsImages && images.length ? (
        <ul className="grid grid-cols-4 gap-2" aria-label="Images to post">
          {images.map((img, i) => (
            <li key={img.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={img.url} alt="" className="aspect-square w-full rounded-md object-cover" />
              <button
                type="button"
                aria-label={`Remove image ${i + 1}`}
                onClick={() => setImages(images.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full bg-bg-page/90 text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                <X aria-hidden weight="bold" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {allowsImages ? (
            <>
              <input
                ref={fileInput}
                id={`${id}-images`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-label="Add images"
                onChange={(e) => void addFiles(e.target.files)}
                disabled={images.length >= 4 || preparing}
                data-testid="post-images"
              />
              <Button type="button" variant="ghost" size="sm" loading={preparing} disabled={images.length >= 4} onClick={() => fileInput.current?.click()}>
                <ImageSquare aria-hidden weight="bold" className="size-4" />
                Images ({images.length}/4)
              </Button>
            </>
          ) : null}
          {kind !== "announcement" ? (
            <div role="radiogroup" aria-label="Who sees it" className="flex overflow-hidden rounded-md border border-border-default">
              {(["university", "global"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={(globalAllowed ? audience : "university") === a}
                  disabled={a === "global" && !globalAllowed}
                  onClick={() => setAudience(a)}
                  className={cn(
                    "h-9 px-3 text-body-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50",
                    (globalAllowed ? audience : "university") === a ? "bg-primary-subtle text-text-primary" : "text-text-secondary",
                  )}
                >
                  {a === "university" ? "University" : "Global"}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-body-sm text-text-secondary">Platform news, seen by everyone</span>
          )}
        </div>
        <Button type="submit" loading={pending} disabled={preparing}>
          Post
        </Button>
      </div>
      <p role="status" className="sr-only">
        {notice}
      </p>
    </form>
  );
}
