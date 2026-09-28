"use client";

import { ChartBar } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui";
import { getPostInsights, type InsightRow } from "@/lib/actions/posts";

/**
 * Post insights (PRD 5.28, paid): the author's full tick/cross breakdown. Free authors see
 * what it offers; the server refuses the data without the entitlement.
 */
export function InsightsButton({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await getPostInsights(postId);
            if (result.ok) {
              setRows(result.data);
              setMessage(null);
            } else {
              setRows(null);
              setMessage(result.message);
            }
            setOpen(true);
          })
        }
      >
        <ChartBar aria-hidden weight="bold" className="size-4" />
        Insights
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Post insights"
          description={
            rows
              ? "How readers answered each question on this post."
              : "See how readers answered every question on your posts: informative, interesting, credible, clear and more, with views and commenters. Everyone sees the public line; the full breakdown is part of Student Pro."
          }
        >
          {rows ? (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-label text-text-secondary uppercase">
                  <th className="py-1">Question</th>
                  <th className="py-1 text-right">Yes</th>
                  <th className="py-1 text-right">No</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dimension} className="border-t border-border-muted">
                    <td className="py-1">{r.label}</td>
                    <td className="py-1 text-right tabular-nums">{r.ticks}</td>
                    <td className="py-1 text-right tabular-nums">{r.crosses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-body-sm text-text-secondary" data-testid="insights-upgrade">
              {message}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
