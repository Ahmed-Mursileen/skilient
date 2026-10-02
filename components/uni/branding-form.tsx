"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, FieldError, HelperText, Input, Label, Textarea } from "@/components/ui";
import { clearBrandingImage, saveBranding, uploadUniImage } from "@/lib/actions/uni";
import { brandColourError, contrastRatio, PAGE_BG } from "@/lib/ecosphere/contrast";

type Pair = { light: string; dark: string };

/**
 * Brand colours with a live contrast readout (4.5:1 against the page in each theme, PRD 5.23).
 * The same check runs in the action and in SQL; the readout only helps pick a passing value.
 */
export function BrandingForm({ primary, accent, welcome }: { primary?: Pair; accent?: Pair; welcome: string | null }) {
  const id = useId();
  const router = useRouter();
  const [p, setP] = useState<Pair>(primary ?? { light: "#1f4e79", dark: "#9cc7ff" });
  const [a, setA] = useState<Pair>(accent ?? { light: "#8a3b12", dark: "#f0a77a" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const local = brandColourError({ primary: p, accent: a });
  const row = (name: string, pair: Pair, set: (v: Pair) => void) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-label text-text-secondary uppercase">{name}</legend>
      {(["light", "dark"] as const).map((theme) => {
        const ratio = contrastRatio(pair[theme], PAGE_BG[theme]);
        return (
          <div key={theme} className="flex flex-wrap items-center gap-3">
            <Label htmlFor={`${id}-${name}-${theme}`} className="w-32">{theme === "light" ? "Light mode" : "Dark mode"}</Label>
            <Input id={`${id}-${name}-${theme}`} className="w-32 font-mono" value={pair[theme]} onChange={(e) => set({ ...pair, [theme]: e.target.value })} />
            <span aria-hidden className="size-8 rounded-md border border-border-default" style={{ background: PAGE_BG[theme] }}>
              <span className="block size-full rounded-md" style={{ background: /^#[0-9a-f]{6}$/i.test(pair[theme]) ? pair[theme] : "transparent", clipPath: "inset(25%)" }} />
            </span>
            <span className="text-body-sm text-text-secondary">{ratio ? `${ratio.toFixed(2)}:1 ${ratio >= 4.5 ? "passes" : "too low"}` : "not a colour"}</span>
          </div>
        );
      })}
    </fieldset>
  );
  return (
    <form className="flex flex-col gap-4" data-testid="branding-form" onSubmit={(e) => {
      e.preventDefault();
      const w = String(new FormData(e.currentTarget).get("welcome") ?? "");
      startTransition(async () => {
        setError(null);
        setSaved(false);
        const r = await saveBranding({ primary: p, accent: a, welcome: w });
        if (!r.ok) setError(r.message);
        else {
          setSaved(true);
          router.refresh();
        }
      });
    }}>
      {row("Primary colour", p, setP)}
      {row("Accent colour", a, setA)}
      <HelperText>Your colours appear only on your ecosphere pages, never in the rest of the app.</HelperText>
      {local ? <p className="text-body-sm text-text-secondary">{local}</p> : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-w`}>Welcome message</Label>
        <Textarea id={`${id}-w`} name="welcome" rows={3} maxLength={1000} defaultValue={welcome ?? ""} />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      {saved ? <p role="status" className="text-body-sm">Saved.</p> : null}
      <div><Button type="submit" loading={pending}>Save branding</Button></div>
    </form>
  );
}

export function ImageUpload({ kind, current }: { kind: "logo" | "cover"; current: string | null }) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-f`}>{kind === "logo" ? "Logo (square)" : "Cover image (3:1)"}</Label>
      <input id={`${id}-f`} type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("file", file);
        startTransition(async () => {
          const r = await uploadUniImage(fd);
          if (!r.ok) setError(r.message);
          else router.refresh();
        });
      }} />
      {current ? <Button type="button" size="sm" variant="ghost" onClick={() => startTransition(async () => { await clearBrandingImage(kind); router.refresh(); })}>Remove</Button> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
