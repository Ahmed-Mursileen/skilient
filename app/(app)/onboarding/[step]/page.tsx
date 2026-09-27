import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WizardFrame } from "@/components/onboarding/wizard-frame";
import { onboardingStepNumber } from "@/lib/auth/gate";
import type { UniversityRef } from "@/lib/auth/email-domain";
import { emailDomain } from "@/lib/auth/email-domain";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getGithubOverview, GITHUB_OUTCOMES } from "@/lib/data/github";
import { getClassmates } from "@/lib/data/profiles";
import { githubApp } from "@/lib/github/config";
import type { LookingFor } from "@/lib/profile/options";
import { createClient } from "@/lib/supabase/server";
import { GithubStep, LookingForStep, PeopleStep, ProfileStep, SkillsStep, UniversityStep } from "./steps";

export const metadata: Metadata = { title: "Set up your profile" };

/** Copy from PRD 5.27's onboarding table: what each step is, and why it's asked. */
const STEPS = {
  1: { title: "Your university details", why: "Puts you in your university feed, leaderboards and job fairs." },
  2: { title: "Your profile basics", why: "How classmates and recruiters recognise you." },
  3: { title: "Connect GitHub", why: "Your code becomes verified skill evidence." },
  4: { title: "Your skills", why: "Shows how proof works from day one." },
  5: { title: "What you're looking for", why: "Drives \"For you\" and whether recruiters can find you." },
  6: { title: "Find your people", why: "So your feed isn't empty." },
} as const;

export default async function OnboardingStepPage({ params, searchParams }: PageProps<"/onboarding/[step]">) {
  const { step: slug } = await params;
  const query = await searchParams;
  const step = onboardingStepNumber(slug) as keyof typeof STEPS | null;
  if (!step) notFound();

  const user = await getCurrentUser();
  if (!user) notFound();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("university_id, department, programme, graduation_year, campus, username, bio, looking_for, recruiter_visible")
    .eq("user_id", user.id)
    .single();

  let body: React.ReactNode = null;
  if (step === 1) {
    // Universities that own this student's email domain (usually one; a shared domain gives a choice).
    const { data: owners } = await supabase
      .from("university_domains")
      .select("universities!inner(id, name)")
      .eq("domain", emailDomain(user.email) ?? "")
      .in("kind", ["student", "both"]);
    const choices: UniversityRef[] = (owners ?? [])
      .map((o) => ({ id: o.universities.id, name: o.universities.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const current = choices.find((c) => c.id === profile?.university_id) ?? null;
    body = (
      <UniversityStep
        university={current}
        choices={choices}
        department={profile?.department ?? null}
        programme={profile?.programme ?? null}
        graduationYear={profile?.graduation_year ?? null}
        campus={profile?.campus ?? null}
      />
    );
  } else if (step === 2) {
    body = <ProfileStep fullName={user.fullName} username={profile?.username ?? null} bio={profile?.bio ?? null} avatarUrl={user.avatarUrl} />;
  } else if (step === 3) {
    const { account, sync } = await getGithubOverview(user.id, false);
    const outcome = typeof query.github === "string" ? (GITHUB_OUTCOMES[query.github] ?? null) : null;
    body = <GithubStep configured={githubApp() !== null} account={account} sync={sync} outcome={outcome} />;
  } else if (step === 4) {
    body = <SkillsStep />;
  } else if (step === 5) {
    body = (
      <LookingForStep
        lookingFor={(profile?.looking_for ?? []) as LookingFor[]}
        recruiterVisible={profile?.recruiter_visible ?? false}
      />
    );
  } else {
    body = <PeopleStep classmates={await getClassmates()} universityName={user.universityName} />;
  }

  return (
    <WizardFrame step={step} title={STEPS[step].title} why={STEPS[step].why}>
      {body}
    </WizardFrame>
  );
}
