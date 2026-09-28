"use client";

import { ImageSquare, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Textarea } from "@/components/ui";
import { postVentureUpdate } from "@/lib/actions/ventures";
import type { ActionError } from "@/lib/actions/result";
import { prepareImages } from "@/lib/images/downscale";

/** Members post short progress updates with up to 4 images (PRD 5.28 "Updates"). */
export function UpdateComposer({ ventureId }: { ventureId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.url)), [images]);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setPreparing(true);
    try {
      const existing = images.map((i) => i.file);
      const all = await prepareImages(existing, Array.from(list));
      setImages([...images, ...all.slice(existing.length).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    } catch (err) {
      setError({ ok: false, code: "invalid_input", message: err instanceof Error ? err.message : "That image couldn't be added." });
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("ventureId", ventureId);
    data.set("body", String(new FormData(event.currentTarget).get("body") ?? ""));
    images.forEach((i) => data.append("images", i.file));
    startTransition(async () => {
      setError(null);
      const result = await postVentureUpdate(data);
      if (result.ok) {
        form.current?.reset();
        setImages([]);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-3 rounded-lg border border-border-default p-4">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="update-body" label="Post an update" error={error?.fields?.body} helper="What the team shipped, learned or needs. Everyone who can see the venture reads it.">
        <Textarea
          id="update-body"
          name="body"
          rows={3}
          maxLength={2000}
          required
          aria-invalid={error?.fields?.body ? true : undefined}
          aria-describedby={error?.fields?.body ? "update-body-error" : "update-body-helper"}
        />
      </Field>
      {images.length ? (
        <ul className="grid grid-cols-4 gap-2" aria-label="Images to post">
          {images.map((img, i) => (
            <li key={img.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={img.url} alt="" className="aspect-square w-full rounded-md object-cover" />
              <button
                type="button"
                aria-label={`Remove image ${i + 1}`}
                onClick={() => setImages(images.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full bg-bg-page/90 focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                <X aria-hidden weight="bold" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} disabled={preparing}>
          Post update
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Add images"
          onChange={(e) => void addFiles(e.target.files)}
          data-testid="update-images"
        />
        <Button type="button" variant="ghost" loading={preparing} disabled={images.length >= 4} onClick={() => fileInput.current?.click()}>
          <ImageSquare aria-hidden weight="bold" className="size-4" />
          Images ({images.length}/4)
        </Button>
      </div>
    </form>
  );
}
