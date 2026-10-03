/**
 * Every analytics event Skilient sends (PRD 10 "Product analytics"; docs/analytics.md). Client-safe.
 *
 * Browser events are the landing events (PRD 5.1) and page views; their properties are typed here so
 * an unknown event or property fails typecheck. Server events are written by database triggers into
 * the outbox (supabase/migrations/*_analytics.sql) and sent by the analytics-worker; the list below
 * must match the migration (a unit test checks both ways). Properties are ids, enums, counts and
 * booleans only: never names, emails, usernames or content.
 */

export interface ClientEventProps {
  /** A live university email was submitted on the landing page; the visitor goes to /signup. */
  signup_start: { source: "hero" | "final" };
  /** The email field recognised a live university. */
  uni_detected: { source: "hero" | "final"; university_id: string | null };
  /** The email field recognised a university that isn't live yet (or an unknown one). */
  uni_not_live: { source: "hero" | "final"; known: boolean };
  /** "Request your university" was sent. */
  uni_requested: { known: boolean };
  /** A call to action on an organisation page (/recruiters, /universities, /faculty, /pricing, /about). */
  org_cta_click: { cta: string; page: string };
}

export type ClientEvent = keyof ClientEventProps;

export const CLIENT_EVENTS = ["signup_start", "uni_detected", "uni_not_live", "uni_requested", "org_cta_click"] as const satisfies readonly ClientEvent[];

/** Events the database writes (the outbox). `$set` updates person properties (plan, tier, university). */
export const SERVER_EVENTS = [
  "$set",
  "account_created",
  "email_verified",
  "agreement_accepted",
  "onboarding_step",
  "onboarding_completed",
  "tour_completed",
  "tour_skipped",
  "github_connected",
  "first_l2_skill",
  "contribution_logged",
  "cv_exported",
  "post_created",
  "survey_answered",
  "comment_added",
  "chat_message_sent",
  "feedback_sent",
  "venture_created",
  "venture_joined",
  "venture_completed",
  "contact_request_sent",
  "contact_request_accepted",
  "application_stage_changed",
  "hire_confirmed",
  "subscription_started",
  "subscription_cancelled",
] as const;

export type ServerEvent = (typeof SERVER_EVENTS)[number];

/** Person properties the browser sets on identify (plan, tier and signup week come from the server). */
export interface IdentifyTraits {
  role: string;
  university_id: string | null;
}
