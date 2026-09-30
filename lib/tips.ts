/**
 * First-visit tip cards (PRD 5.27): two lines on what a page is for, with "Show me more"
 * expanding inline. Ids match public.tips_seen's check constraint. Client-safe.
 */
export const TIP_IDS = ["opportunities", "venture", "cv", "score", "privacy"] as const;
export type TipId = (typeof TIP_IDS)[number];

export const TIPS: Record<TipId, { title: string; body: string; more: string }> = {
  opportunities: {
    title: "How Opportunities works",
    body: "Roles, requests and competitions are matched to skills you have proof of. Nothing here is ordered by who pays.",
    more: "Recruiters see only what your privacy settings allow, and you decide who can contact you. Sponsored roles are marked on the Jobs tab only; they never change your For you list.",
  },
  venture: {
    title: "What a venture is",
    body: "A venture is a project you build with a team. Log what you do, and a teammate's confirmation makes it count.",
    more: "Finished ventures count most toward your rank. Members can endorse each other's skills once the work is done, and the owner marks the venture complete.",
  },
  cv: {
    title: "Your verified CV",
    body: "Everything on it is checked and signed, so a recruiter can confirm it wasn't edited. You choose which sections to show.",
    more: "Each version has a code anyone can look up at the verify page. Share links open your newest version; revoking one stops it working straight away.",
  },
  score: {
    title: "How your score works",
    body: "Only you see your points. Others see your tier and rank, never the number.",
    more: "Proof (verified work, skills, endorsements, credentials) never fades. Momentum does when you're inactive. The page below shows the evidence behind every point.",
  },
  privacy: {
    title: "Your privacy controls",
    body: "You decide who sees your profile, whether recruiters can find you and whether you appear on leaderboards.",
    more: "Changes apply straight away. Blocking someone hides you from each other everywhere; you can undo it here.",
  },
};
