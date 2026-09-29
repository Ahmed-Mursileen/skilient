import type { Snippet } from "@/lib/data/code-checks";

/** The student's own lines, numbered as in their file. Shown, never stored (PRD 5.5). */
export function SnippetView({ snippet }: { snippet: Snippet }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
      <figcaption className="border-b border-border-muted px-4 py-2 font-mono text-code-sm break-all text-text-secondary">
        {snippet.path}, lines {snippet.startLine}–{snippet.startLine + snippet.lines.length - 1}
      </figcaption>
      <pre tabIndex={0} aria-label={`Code from ${snippet.path}`} className="max-h-[60vh] overflow-auto p-4 font-mono text-code-sm leading-6">
        <code>
          {snippet.lines.map((line, i) => (
            <span key={i} className="block">
              <span aria-hidden className="mr-4 inline-block w-8 text-right text-text-muted select-none">
                {snippet.startLine + i}
              </span>
              {line || " "}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
