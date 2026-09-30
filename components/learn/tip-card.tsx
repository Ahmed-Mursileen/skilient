"use client";

import { Lightbulb, X } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { dismissTip } from "@/lib/actions/learn";
import { TIPS, type TipId } from "@/lib/tips";

/** The dismissible first-visit card (PRD 5.27): two lines, "Show me more" expands inline. */
export function TipCard({ tipId }: { tipId: TipId }) {
  const tip = TIPS[tipId];
  const [gone, setGone] = useState(false);
  const [more, setMore] = useState(false);
  const [pending, startTransition] = useTransition();
  if (gone) return null;
  return (
    <aside aria-label={tip.title} className="flex flex-col gap-2 rounded-lg border border-border-default bg-accent-subtle p-4" data-testid={`tip-${tipId}`}>
      <div className="flex items-start gap-3">
        <Lightbulb aria-hidden weight="bold" className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-h4">{tip.title}</p>
          <p className="text-body-sm text-text-secondary">{tip.body}</p>
          {more ? (
            <p className="mt-2 text-body-sm text-text-secondary" id={`tip-more-${tipId}`}>
              {tip.more}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          aria-label={`Dismiss: ${tip.title}`}
          className="-mr-2 -mt-1 size-8 shrink-0 px-0"
          onClick={() =>
            startTransition(async () => {
              setGone(true);
              await dismissTip(tipId);
            })
          }
        >
          <X aria-hidden weight="bold" className="size-4" />
        </Button>
      </div>
      {!more ? (
        <div className="pl-8">
          <Button variant="ghost" size="sm" aria-expanded={false} onClick={() => setMore(true)}>
            Show me more
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
