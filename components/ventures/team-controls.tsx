"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmAction } from "@/components/ventures/confirm-action";
import { removeVentureMember, setMemberRole, transferVentureOwnership } from "@/lib/actions/ventures";
import type { ActionError } from "@/lib/actions/result";
import type { TeamRole } from "@/lib/data/ventures";
import { TEAM_ROLE_LABELS } from "@/lib/ventures/labels";

/** The owner's controls on one team member: venture role, remove, hand over ownership. */
export function TeamControls({ ventureId, memberId, name, teamRole }: { ventureId: string; memberId: string; name: string; teamRole: TeamRole }) {
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const selectId = `role-${memberId}`;

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          {`Role for ${name}`}
        </label>
        <select
          id={selectId}
          defaultValue={teamRole}
          disabled={pending}
          onChange={(e) => {
            const role = e.target.value;
            startTransition(async () => {
              setError(null);
              const result = await setMemberRole(ventureId, memberId, role);
              if (result.ok) router.refresh();
              else setError(result);
            });
          }}
          className="h-8 rounded-md border border-border-default bg-bg-subtle px-2 text-body-sm"
        >
          {(Object.keys(TEAM_ROLE_LABELS) as TeamRole[]).map((r) => (
            <option key={r} value={r}>
              {TEAM_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <ConfirmAction
          action={transferVentureOwnership.bind(null, ventureId, memberId)}
          label="Make owner"
          confirm={{ title: `Make ${name} the owner?`, description: "They'll manage the venture. You stay on the team as a member." }}
        />
        <ConfirmAction
          action={removeVentureMember.bind(null, ventureId, memberId)}
          label="Remove"
          danger
          confirm={{ title: `Remove ${name} from the team?`, description: "They lose access to the team's deliverables. They can apply again later." }}
        />
      </div>
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
    </div>
  );
}
