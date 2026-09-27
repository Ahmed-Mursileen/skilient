import { redirect } from "next/navigation";

/** proxy.ts sends people to their saved step; this only catches a direct visit without it. */
export default function OnboardingIndex() {
  redirect("/onboarding/university");
}
