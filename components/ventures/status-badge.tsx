import { Badge } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/ventures/labels";
import type { VentureStatus } from "@/lib/data/ventures";

const TONES = { recruiting: "info", in_progress: "primary", completed: "success", abandoned: "neutral" } as const;

/** Venture status with an icon or border, never colour alone (PRD 9.5). */
export function VentureStatusBadge({ status }: { status: VentureStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
