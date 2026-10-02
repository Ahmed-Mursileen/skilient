"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, FieldError, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { savePage, uploadUniImage } from "@/lib/actions/uni";
import type { PageBlock } from "@/lib/data/uni";

type Options = { ventures: { id: string; title: string }[]; faculty: { id: string; name: string; title: string }[] };
type Page = { id: string; slug: string; title: string; published: boolean; position: number; blocks: PageBlock[] } | null;

const BLOCK_LABELS: Record<PageBlock["type"], string> = {
  text: "Text", image: "Image", links: "Link list", announcements: "Latest announcements", events: "Upcoming events",
  ventures: "Featured ventures", faculty: "Faculty spotlight",
};

function emptyBlock(type: PageBlock["type"]): PageBlock {
  switch (type) {
    case "text": return { type, text: "" };
    case "image": return { type, path: "", caption: "" };
    case "links": return { type, items: [] };
    case "announcements": return { type, count: 3 };
    case "events": return { type, count: 3 };
    case "ventures": return { type, ids: [] };
    case "faculty": return { type, ids: [] };
  }
}

/**
 * A custom ecosphere page from a fixed set of blocks (PRD 5.23: no raw HTML). Text is plain
 * paragraphs; links are "label | https://…" lines. Saved through savePage (Zod + SQL checks).
 */
export function PageEditor({ page, options }: { page: Page; options: Options }) {
  const id = useId();
  const router = useRouter();
  const [blocks, setBlocks] = useState<PageBlock[]>(page?.blocks ?? []);
  const [adding, setAdding] = useState<PageBlock["type"]>("text");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const update = (i: number, b: PageBlock) => setBlocks((all) => all.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => setBlocks((all) => {
    const next = [...all];
    const j = i + d;
    if (j < 0 || j >= next.length) return all;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="page-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const result = await savePage({
            id: page?.id ?? null,
            slug: String(f.get("slug") ?? ""),
            title: String(f.get("title") ?? ""),
            published: f.get("published") === "on",
            position: Number(f.get("position") ?? 1),
            blocks,
          });
          if (!result.ok) setError(result.message);
          else {
            if (!page) setBlocks([]);
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1"><Label htmlFor={`${id}-t`}>Title</Label><Input id={`${id}-t`} name="title" defaultValue={page?.title} required /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`${id}-s`}>Address</Label><Input id={`${id}-s`} name="slug" defaultValue={page?.slug} required placeholder="societies" /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`${id}-p`}>Order (1 to 10)</Label><Input id={`${id}-p`} name="position" type="number" min={1} max={10} defaultValue={page?.position ?? 1} /></div>
      </div>
      <label className="flex items-center gap-2 text-body"><input type="checkbox" name="published" defaultChecked={page?.published} className="size-4" /> Published</label>
      <ol className="flex flex-col gap-3">
        {blocks.map((b, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-md border border-border-default p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{BLOCK_LABELS[b.type]}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)}>Move up</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)}>Move down</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setBlocks((all) => all.filter((_, j) => j !== i))}>Remove</Button>
            </div>
            <BlockFields block={b} options={options} onChange={(nb) => update(i, nb)} label={`${BLOCK_LABELS[b.type]} ${i + 1}`} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-add`}>Add a block</Label>
          <select id={`${id}-add`} className={`${controlBase} h-10`} value={adding} onChange={(e) => setAdding(e.target.value as PageBlock["type"])}>
            {Object.entries(BLOCK_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <Button type="button" variant="secondary" onClick={() => setBlocks((all) => [...all, emptyBlock(adding)])}>Add</Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div><Button type="submit" loading={pending}>{page ? "Save page" : "Create page"}</Button></div>
    </form>
  );
}

function BlockFields({ block, options, onChange, label }: { block: PageBlock; options: Options; onChange: (b: PageBlock) => void; label: string }) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  switch (block.type) {
    case "text":
      return <Textarea aria-label={label} rows={4} value={block.text} maxLength={5000} onChange={(e) => onChange({ ...block, text: e.target.value })} />;
    case "links":
      return (
        <Textarea aria-label={`${label}: one "label | https://address" per line`} rows={3}
          defaultValue={block.items.map((l) => `${l.label} | ${l.url}`).join("\n")}
          onChange={(e) => onChange({ ...block, items: e.target.value.split("\n").map((l) => l.split("|").map((s) => s.trim())).filter((p) => p[0] && p[1]).map(([lbl, url]) => ({ label: lbl, url })) })} />
      );
    case "announcements":
    case "events":
      return <Input aria-label={`${label}: how many`} type="number" min={1} max={10} value={block.count} onChange={(e) => onChange({ ...block, count: Number(e.target.value) })} />;
    case "ventures":
    case "faculty": {
      const list = block.type === "ventures" ? options.ventures.map((v) => ({ id: v.id, label: v.title })) : options.faculty.map((f) => ({ id: f.id, label: `${f.name}, ${f.title}` }));
      if (list.length === 0) return <p className="text-body-sm text-text-secondary">Nothing to pick yet.</p>;
      return (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1"><legend className="sr-only">{label}</legend>
          {list.slice(0, 50).map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-body-sm">
              <input type="checkbox" checked={block.ids.includes(o.id)} onChange={(e) => onChange({ ...block, ids: e.target.checked ? [...block.ids, o.id].slice(0, 12) : block.ids.filter((x) => x !== o.id) })} />
              {o.label}
            </label>
          ))}
        </fieldset>
      );
    }
    case "image":
      return (
        <div className="flex flex-col gap-2">
          <input aria-label={`${label}: image file`} type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.set("kind", "page");
            fd.set("file", file);
            const r = await uploadUniImage(fd);
            if (r.ok) onChange({ ...block, path: r.data.path });
            else setUploadError(r.message);
          }} />
          {block.path ? <p className="text-body-sm text-text-secondary">Image uploaded.</p> : null}
          <Input aria-label={`${label}: caption`} value={block.caption ?? ""} maxLength={200} onChange={(e) => onChange({ ...block, caption: e.target.value })} />
          {uploadError ? <FieldError>{uploadError}</FieldError> : null}
        </div>
      );
  }
}
