import type { Route } from "next";
import "./ecosphere.css";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Ecosphere, PageBlock } from "@/lib/data/uni";
import { mediaUrl } from "@/lib/uni/media";

/**
 * Brand colours apply only inside the ecosphere (decisions.md 2026-10-04): they are exposed as
 * --eco-* variables on this wrapper, one value per theme, each already checked at 4.5:1.
 */
export function EcosphereFrame({ name, slug, branding, pages, current, children }: {
  name: string; slug: string; branding: Ecosphere["branding"]; pages: { slug: string; title: string }[]; current: string | null; children: ReactNode;
}) {
  const style = {
    "--eco-primary-light": branding.primary?.light ?? "var(--text-primary)",
    "--eco-primary-dark": branding.primary?.dark ?? "var(--text-primary)",
    "--eco-accent-light": branding.accent?.light ?? "var(--text-secondary)",
    "--eco-accent-dark": branding.accent?.dark ?? "var(--text-secondary)",
  } as CSSProperties;
  return (
    <div className="ecosphere mx-auto flex w-full max-w-page flex-col gap-6 px-[var(--page-gutter)] py-6" style={style} data-testid="ecosphere">
      {branding.cover_path ? (
        // eslint-disable-next-line @next/next/no-img-element -- public WebP from our bucket
        <img src={mediaUrl(branding.cover_path)} alt="" className="aspect-[3/1] w-full rounded-lg object-cover" />
      ) : null}
      <header className="flex items-center gap-4">
        {branding.logo_path ? (
          // eslint-disable-next-line @next/next/no-img-element -- public WebP from our bucket
          <img src={mediaUrl(branding.logo_path)} alt="" className="size-16 rounded-lg border border-border-default" />
        ) : null}
        <h1 className="eco-primary font-display text-h1">{name}</h1>
      </header>
      <nav aria-label={`${name} pages`} className="flex flex-wrap gap-3 border-b border-border-default pb-2">
        <Link href={`/u/${slug}` as Route} aria-current={current === null ? "page" : undefined} className="eco-primary font-semibold underline-offset-4 hover:underline">Home</Link>
        {pages.map((p) => (
          <Link key={p.slug} href={`/u/${slug}/${p.slug}` as Route} aria-current={current === p.slug ? "page" : undefined} className="eco-primary font-semibold underline-offset-4 hover:underline">{p.title}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

/** Text blocks are plain paragraphs: no HTML, no Markdown. */
export function Blocks({ blocks, announcements, events }: {
  blocks: PageBlock[]; announcements: { id: string; body: string }[]; events: { id: string; title: string; starts: string }[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "text":
            return <div key={i} className="flex max-w-prose flex-col gap-3">{b.text.split(/\n{2,}/).map((p, j) => <p key={j} className="whitespace-pre-line text-body">{p}</p>)}</div>;
          case "image":
            return (
              <figure key={i} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- public WebP from our bucket */}
                <img src={mediaUrl(b.path)} alt={b.caption ?? ""} className="max-h-[480px] w-full rounded-lg object-contain" />
                {b.caption ? <figcaption className="text-body-sm text-text-secondary">{b.caption}</figcaption> : null}
              </figure>
            );
          case "links":
            return <ul key={i} className="flex flex-col gap-1">{b.items.map((l) => <li key={l.url}><a className="eco-accent underline" href={l.url} rel="noopener noreferrer" target="_blank">{l.label}</a></li>)}</ul>;
          case "announcements":
            return <ul key={i} className="flex flex-col gap-2">{announcements.slice(0, b.count).map((a) => <li key={a.id} className="rounded-md border border-border-default p-3 whitespace-pre-line">{a.body}</li>)}</ul>;
          case "events":
            return <ul key={i} className="flex flex-col gap-1">{events.slice(0, b.count).map((e) => <li key={e.id}><Link className="eco-accent underline" href={`/events/${e.id}` as Route}>{e.title}</Link> · {e.starts}</li>)}</ul>;
          case "ventures":
            return <ul key={i} className="grid gap-2 sm:grid-cols-2">{(b.items ?? []).map((v) => <li key={v.id} className="rounded-md border border-border-default p-3"><Link className="font-semibold underline-offset-4 hover:underline" href={`/ventures/${v.id}` as Route}>{v.title}</Link> <span className="text-text-secondary">· {v.type}</span></li>)}</ul>;
          case "faculty":
            return <ul key={i} className="grid gap-2 sm:grid-cols-3">{(b.items ?? []).map((f) => <li key={f.name} className="rounded-md border border-border-default p-3"><p className="font-semibold">{f.name}</p><p className="text-body-sm text-text-secondary">{f.title}, {f.department}</p></li>)}</ul>;
        }
      })}
    </div>
  );
}
