/**
 * Renders the agreement's Markdown subset: "## " headings and plain paragraphs. Text goes
 * through React escaping; no HTML from the database is ever injected.
 */
export function AgreementText({ markdown }: { markdown: string }) {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="flex flex-col gap-3 text-body text-text-secondary">
      {blocks.map((block, i) =>
        block.startsWith("## ") ? (
          <h2 key={i} className="mt-3 text-h4 text-text-primary first:mt-0">
            {block.slice(3)}
          </h2>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        ),
      )}
    </div>
  );
}
