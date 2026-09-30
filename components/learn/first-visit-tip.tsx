import { TipCard } from "@/components/learn/tip-card";
import { tipSeen } from "@/lib/data/portal";
import type { TipId } from "@/lib/tips";

/** Renders the tip card for a page until the student dismisses it (PRD 5.27). */
export async function FirstVisitTip({ id }: { id: TipId }) {
  if (await tipSeen(id)) return null;
  return <TipCard tipId={id} />;
}
