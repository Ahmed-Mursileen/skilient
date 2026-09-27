"use client";

import { Camera, Trash } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { FormAlert } from "@/components/auth/form-alert";
import { Avatar, Button, Dialog, DialogContent, DialogFooter } from "@/components/ui";
import { removeProfileImage, setProfileImage } from "@/lib/actions/profile";
import type { ActionError } from "@/lib/actions/result";
import { cn } from "@/lib/cn";

const SPECS = {
  avatar: { width: 512, height: 512, aspect: 1, label: "photo", maxBytes: 5 * 1024 * 1024 },
  cover: { width: 1500, height: 500, aspect: 3, label: "cover image", maxBytes: 8 * 1024 * 1024 },
} as const;

async function cropToBlob(src: string, area: Area, width: number, height: number): Promise<Blob> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no_canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("crop_failed"))), "image/jpeg", 0.92),
  );
}

/**
 * Avatar or cover upload (PRD 5.4): crop in the browser to 512×512 / 1500×500, then the
 * server re-encodes, stores and deletes the old file. Shows progress and a named error.
 */
export function ImageUpload({ kind, name, currentUrl }: { kind: "avatar" | "cover"; name: string; currentUrl: string | null }) {
  const spec = SPECS[kind];
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(currentUrl);
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source);
  }, [source]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError({ ok: false, code: "not_an_image", message: "Choose an image file (JPEG, PNG or WebP)." });
      return;
    }
    if (file.size > spec.maxBytes) {
      setError({ ok: false, code: "too_large", message: `Choose an image under ${spec.maxBytes / 1024 / 1024} MB.` });
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setSource(URL.createObjectURL(file));
  }

  function onSave() {
    if (!source || !area) return;
    startTransition(async () => {
      try {
        const blob = await cropToBlob(source, area, spec.width, spec.height);
        const form = new FormData();
        form.set("kind", kind);
        form.set("file", new File([blob], `${kind}.jpg`, { type: "image/jpeg" }));
        const result = await setProfileImage(form);
        if (!result.ok) {
          setError(result);
          return;
        }
        setUrl(result.data.url);
        setSource(null);
        router.refresh();
      } catch {
        setError({ ok: false, code: "crop_failed", message: "Couldn't prepare that image. Try another one." });
      }
    });
  }

  function onRemove() {
    startTransition(async () => {
      const form = new FormData();
      form.set("kind", kind);
      const result = await removeProfileImage(form);
      if (result.ok) {
        setUrl(null);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex gap-4", kind === "avatar" ? "items-center" : "flex-col")}>
        {kind === "avatar" ? (
          <Avatar name={name} src={url} size="lg" className="size-20" />
        ) : (
          <div className="aspect-[3/1] w-full overflow-hidden rounded-lg border border-border-default bg-bg-subtle">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- user image from our public bucket, already sized
              <img src={url} alt="Your cover image" className="size-full object-cover" />
            ) : null}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic"
            className="sr-only"
            tabIndex={-1}
            aria-label={`Choose a ${spec.label}`}
            data-testid={`${kind}-file`}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={pending}>
            <Camera aria-hidden weight="bold" className="size-4" />
            {url ? `Change ${spec.label}` : `Add a ${spec.label}`}
          </Button>
          {url ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} loading={pending && !source}>
              <Trash aria-hidden weight="bold" className="size-4" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}

      <Dialog open={!!source} onOpenChange={(open) => !open && !pending && setSource(null)}>
        <DialogContent title={kind === "avatar" ? "Crop your photo" : "Crop your cover"} description="Drag to position, and zoom to fit.">
          <div className="relative h-72 overflow-hidden rounded-md bg-bg-muted">
            {source ? (
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={spec.aspect}
                cropShape={kind === "avatar" ? "round" : "rect"}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : null}
          </div>
          <label className="mt-4 flex items-center gap-3 text-body-sm text-text-secondary">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSource(null)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} loading={pending} disabled={!area}>
              {pending ? "Uploading…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
