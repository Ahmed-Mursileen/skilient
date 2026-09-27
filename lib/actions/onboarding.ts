"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext, type ActionContext } from "@/lib/actions/context";
import { fail, fieldErrors, type ActionResult } from "@/lib/actions/result";
import { onboardingPath, ONBOARDING_STEPS } from "@/lib/auth/gate";
import {
  bioSchema,
  campusSchema,
  departmentSchema,
  formList,
  formText,
  graduationYearSchema,
  lookingForSchema,
  programmeSchema,
  usernameSchema,
} from "@/lib/profile/schema";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type Supabase = Awaited<ReturnType<typeof createClient>>;
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Onboarding wizard (PRD 5.27): each step is a server action that validates and saves its
 * slice, then moves the saved step forward so the wizard resumes where the student left.
 */
async function begin(action: string): Promise<{ ctx: ActionContext; supabase: Supabase; userId: string | null }> {
  const ctx = await actionContext(action);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) ctx.done("refused", { error_code: "no_session" });
  return { ctx, supabase, userId: user?.id ?? null };
}

/** Saves step data, moves the furthest step forward (never back) and goes to the next step. */
async function advance(ctx: ActionContext, supabase: Supabase, userId: string, completed: number, patch: Record<string, Json>) {
  const { data: state, error: readError } = await supabase
    .from("onboarding_state")
    .select("step, data")
    .eq("user_id", userId)
    .single();
  if (readError || !state) {
    ctx.done("error", { error_code: readError?.code ?? "no_state", user_id: userId });
    return fail("unavailable", "Couldn't save this step. Try again.", { requestId: ctx.requestId });
  }
  const nextStep = Math.min(Math.max(state.step, completed + 1), ONBOARDING_STEPS.length);
  const data = { ...((state.data as Record<string, Json>) ?? {}), ...patch };
  const { error, count } = await supabase
    .from("onboarding_state")
    .update({ step: nextStep, data }, { count: "exact" })
    .eq("user_id", userId);
  if (error || count !== 1) {
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: userId });
    return fail("unavailable", "Couldn't save this step. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: userId, step: completed });
  redirect(onboardingPath(completed + 1) as Route);
}

async function updateProfile(ctx: ActionContext, supabase: Supabase, userId: string, values: ProfileUpdate) {
  const { error, count } = await supabase.from("profiles").update(values, { count: "exact" }).eq("user_id", userId);
  if (error?.code === "23505") {
    ctx.done("refused", { error_code: "username_taken", user_id: userId });
    return fail("username_taken", "That username is taken.", { fields: { username: "That username is taken. Try another." } });
  }
  if (error || count !== 1) {
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: userId });
    return fail("unavailable", "Couldn't save this step. Try again.", { requestId: ctx.requestId });
  }
  return null;
}

const noSession = () => fail("no_session", "Your session expired. Sign in again to continue.");

// Step 1: university details
const universityStep = z.object({
  universityId: z.union([z.uuid(), z.literal("")]).optional(),
  department: departmentSchema,
  programme: programmeSchema,
  graduationYear: graduationYearSchema,
  campus: campusSchema,
});

export async function saveUniversityStep(formData: FormData): Promise<ActionResult> {
  const { ctx, supabase, userId } = await begin("onboarding.university");
  if (!userId) return noSession();
  const parsed = universityStep.safeParse({
    universityId: formText(formData, "universityId"),
    department: formText(formData, "department"),
    programme: formText(formData, "programme"),
    graduationYear: formText(formData, "graduationYear"),
    campus: formText(formData, "campus"),
  });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input", user_id: userId });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  if (parsed.data.universityId) {
    // Only universities that own the student's email domain, and only before completion (checked in SQL).
    const { data: set, error } = await supabase.rpc("set_my_university", { p_university_id: parsed.data.universityId });
    if (error || set !== true) {
      ctx.done("refused", { error_code: "university_refused", user_id: userId });
      return fail("university_refused", "Choose one of the universities listed.", { fields: { universityId: "Choose one of the universities listed." } });
    }
  }
  const { data: profile } = await supabase.from("profiles").select("university_id").eq("user_id", userId).single();
  if (!profile?.university_id) {
    ctx.done("refused", { error_code: "university_missing", user_id: userId });
    return fail("university_missing", "Choose your university.", { fields: { universityId: "Choose your university." } });
  }
  const failed = await updateProfile(ctx, supabase, userId, {
    department: parsed.data.department,
    programme: parsed.data.programme,
    graduation_year: parsed.data.graduationYear,
    campus: parsed.data.campus,
  });
  if (failed) return failed;
  return advance(ctx, supabase, userId, 1, {});
}

// Step 2: profile basics (the photo uploads on its own through setProfileImage)
const profileStep = z.object({ username: usernameSchema, bio: bioSchema });

export async function saveProfileStep(formData: FormData): Promise<ActionResult> {
  const { ctx, supabase, userId } = await begin("onboarding.profile");
  if (!userId) return noSession();
  const parsed = profileStep.safeParse({ username: formText(formData, "username"), bio: formText(formData, "bio") });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input", user_id: userId });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const failed = await updateProfile(ctx, supabase, userId, { username: parsed.data.username, bio: parsed.data.bio });
  if (failed) return failed;
  return advance(ctx, supabase, userId, 2, {});
}

// Step 3: GitHub (skippable; the choice is only a note, the link itself lives in github_accounts)
export async function saveGithubStep(formData: FormData): Promise<ActionResult> {
  const { ctx, supabase, userId } = await begin("onboarding.github");
  if (!userId) return noSession();
  const raw = formText(formData, "choice");
  const choice = raw === "connected" || raw === "later" ? raw : "skipped";
  return advance(ctx, supabase, userId, 3, { github: choice });
}

// Step 4: skills (read-only until GitHub evidence exists)
export async function saveSkillsStep(): Promise<ActionResult> {
  const { ctx, supabase, userId } = await begin("onboarding.skills");
  if (!userId) return noSession();
  return advance(ctx, supabase, userId, 4, { skills_seen: true });
}

// Step 5: what you're looking for + recruiter visibility
export async function saveLookingForStep(formData: FormData): Promise<ActionResult> {
  const { ctx, supabase, userId } = await begin("onboarding.looking_for");
  if (!userId) return noSession();
  const parsed = lookingForSchema.safeParse(formList(formData, "lookingFor"));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input", user_id: userId });
    return fail("invalid_input", "Pick from the options shown.");
  }
  const failed = await updateProfile(ctx, supabase, userId, {
    looking_for: parsed.data,
    recruiter_visible: formData.get("recruiterVisible") === "on",
  });
  if (failed) return failed;
  return advance(ctx, supabase, userId, 5, {});
}

// Step 6: find your people, then finish
export async function finishOnboarding(): Promise<ActionResult> {
  const { ctx, supabase, userId } = await begin("onboarding.finish");
  if (!userId) return noSession();
  const { data, error } = await supabase.rpc("complete_onboarding");
  if (error) {
    ctx.done("error", { error_code: error.code, user_id: userId });
    return fail("unavailable", "Couldn't finish setting up. Try again.", { requestId: ctx.requestId });
  }
  if (data !== true) {
    ctx.done("refused", { error_code: "incomplete", user_id: userId });
    return fail("incomplete", "A few details are still missing: your username, department and batch. Go back and fill them in.");
  }
  ctx.done("ok", { user_id: userId, step: 6 });
  redirect("/onboarding/done");
}
