import "server-only";

import { ageLabel, dayLabel } from "@/lib/format/time";
import { FEEDBACK_BUCKET, type FeedbackStatus, type FeedbackType } from "@/lib/feedback/constants";
import { createClient } from "@/lib/supabase/server";

/** Feedback reads (PRD 5.27): the student's own list, and the staff queue and case behind /ops/feedback. */

export interface MyFeedback {
  id: string;
  type: FeedbackType;
  body: string;
  status: FeedbackStatus;
  staffReply: string | null;
  sentLabel: string;
  repliedLabel: string | null;
  hasScreenshot: boolean;
}

export async function getMyFeedback(): Promise<MyFeedback[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_feedback");
  if (error) throw new Error(`my_feedback: ${error.code}`);
  return (data ?? []).map((f) => ({
    id: f.id,
    type: f.type,
    body: f.body,
    status: f.status,
    staffReply: f.staff_reply,
    sentLabel: dayLabel(f.created_at),
    repliedLabel: f.replied_at ? dayLabel(f.replied_at) : null,
    hasScreenshot: f.has_screenshot,
  }));
}

export interface FeedbackQueueRow {
  id: string;
  type: FeedbackType;
  body: string;
  status: FeedbackStatus;
  student: string | null;
  username: string | null;
  claimedBy: string | null;
  claimedByMe: boolean;
  age: string;
}

export async function getFeedbackQueue(open: boolean): Promise<FeedbackQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_queue", { p_open: open });
  if (error) throw new Error(`feedback_queue: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    body: r.body,
    status: r.status,
    student: r.student_name,
    username: r.student_username,
    claimedBy: r.claimed_by_name,
    claimedByMe: r.claimed_by_me === true,
    age: ageLabel(r.created_at),
  }));
}

export interface FeedbackCase extends FeedbackQueueRow {
  staffReply: string | null;
  page: string | null;
  device: string | null;
  appVersion: string | null;
  screenshotUrl: string | null;
}

export async function getFeedbackCase(id: string): Promise<FeedbackCase | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_case", { p_id: id });
  if (error) throw new Error(`feedback_case: ${error.code}`);
  const r = data?.[0];
  if (!r) return null;
  // Staff read the screenshot through a short-lived signed link (the bucket is private).
  let screenshotUrl: string | null = null;
  if (r.screenshot_path) {
    const signed = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrl(r.screenshot_path, 300);
    screenshotUrl = signed.data?.signedUrl ?? null;
  }
  return {
    id: r.id,
    type: r.type,
    body: r.body,
    status: r.status,
    student: r.student_name,
    username: r.student_username,
    claimedBy: r.claimed_by_name,
    claimedByMe: r.claimed_by_me === true,
    age: ageLabel(r.created_at),
    staffReply: r.staff_reply,
    page: r.page,
    device: r.device,
    appVersion: r.app_version,
    screenshotUrl,
  };
}

export interface BatchRow {
  universityId: string;
  name: string;
  finalYearBatch: number | null;
  students: number;
  graduates: number;
}

export async function getBatches(): Promise<BatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ops_batches");
  if (error) throw new Error(`ops_batches: ${error.code}`);
  return (data ?? []).map((r) => ({
    universityId: r.university_id,
    name: r.name,
    finalYearBatch: r.final_year_batch,
    students: Number(r.students),
    graduates: Number(r.graduates),
  }));
}
