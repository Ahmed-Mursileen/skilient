"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { inviteSupervisor, requestReview } from "@/lib/actions/teach";
import { cn } from "@/lib/cn";
import type { TeacherOption } from "@/lib/data/teach";

/** The owner asks a teacher at their university to supervise or to review the venture (PRD 5.21). */
export function FacultyControls({
  ventureId,
  teachers,
  canSupervise,
  canReview,
}: {
  ventureId: string;
  teachers: TeacherOption[];
  canSupervise: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [teacher, setTeacher] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (teachers.length === 0) {
    return <p className="text-body-sm text-text-secondary">No teacher at your university has joined Skilient yet. When one does, you can ask them here.</p>;
  }
  const chosen = teachers.find((t) => t.userId === teacher);

  function run(kind: "supervise" | "review") {
    if (!teacher) {
      setMessage({ tone: "error", text: "Choose a teacher first." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = kind === "supervise" ? await inviteSupervisor(ventureId, teacher) : await requestReview(ventureId, teacher);
      if (result.ok) {
        setMessage({ tone: "success", text: kind === "supervise" ? "Invite sent. They can accept from their portal." : "Review requested. They have 14 days to answer." });
        router.refresh();
      } else setMessage({ tone: "error", text: result.message });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? <FormAlert tone={message.tone}>{message.text}</FormAlert> : null}
      <label htmlFor="teacher-pick" className="text-body-sm font-semibold">Teacher at your university</label>
      <select id="teacher-pick" value={teacher} onChange={(e) => setTeacher(e.target.value)} className={cn(controlBase, "h-10")}>
        <option value="">Choose a teacher</option>
        {teachers.map((t) => (
          <option key={t.userId} value={t.userId}>{t.name} · {t.title}, {t.department}{t.full ? " (full)" : ""}</option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        {canSupervise ? (
          <Button type="button" variant="secondary" loading={pending} disabled={chosen?.full} onClick={() => run("supervise")}>Ask to supervise</Button>
        ) : null}
        {canReview ? (
          <Button type="button" variant="secondary" loading={pending} onClick={() => run("review")}>Request a review</Button>
        ) : null}
      </div>
      {!canReview ? <p className="text-caption text-text-secondary">Reviews open once the venture is in progress.</p> : null}
    </div>
  );
}
