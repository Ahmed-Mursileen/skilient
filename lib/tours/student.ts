import type { TourDefinition } from "@/lib/tours/types";

/**
 * The student tour (PRD 5.27): one coach mark per nav item, then the feedback button. Steps
 * whose anchor isn't on screen (Leaderboard on a phone, say) are skipped, so "Step x of y"
 * always counts what the person actually sees.
 */
export const studentTour: TourDefinition = {
  id: "student",
  startPath: "/feed",
  steps: [
    { anchor: "nav-home", title: "Home", body: "Your university feed: posts, announcements and your progress card." },
    { anchor: "nav-opportunities", title: "Opportunities", body: "Jobs, recruiter requests, competitions and hackathons matched to your verified skills." },
    { anchor: "nav-ventures", title: "Ventures", body: "Projects you build with others. Finished ventures count most toward your rank." },
    { anchor: "nav-chat", title: "Chat", body: "Messages with friends, teammates and recruiters." },
    { anchor: "nav-me", title: "Me", body: "Your profile, skills, CV and score. See exactly how your rank is calculated." },
    { anchor: "nav-explore", title: "Explore", body: "Search people, ventures and skills at your university and beyond." },
    { anchor: "nav-leaderboard", title: "Leaderboard", body: "Where you stand at your university and overall. Only rank and tier are public, never points." },
    { anchor: "nav-notifications", title: "Notifications", body: "Requests, endorsements and replies, in the app and by email as you choose." },
    { anchor: "nav-feedback", title: "Feedback", body: "Something confusing? Tell us here." },
  ],
};
