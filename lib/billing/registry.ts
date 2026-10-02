/**
 * Every paid server action and the entitlement it needs (PRD 4b.4). Each one calls
 * `require_entitlement(key)` before it runs (through `rpcAction({ entitlement })` or `paymentRequired`), and the
 * SQL function it calls checks the same key again. tests/unit/billing-registry.test.ts fails the build when an
 * action that calls an entitlement-checked SQL function is missing here, and tests/worker/billing-registry.test.ts
 * calls every action below as a user without the entitlement and expects `payment_required`.
 */
export interface PaidAction {
  /** The log name passed to actionContext (also the registry id). */
  name: string;
  /** Module and export, for the tests. */
  module: "recruit" | "uni" | "cv";
  exportName: string;
  /** The SQL function the action calls (null for the CV refresh, which goes through cv-sign). */
  sql: string | null;
  key: string;
  subject: "user" | "org" | "university";
}

export const PAID_ACTIONS: readonly PaidAction[] = [
  { name: "recruit.create_shortlist", module: "recruit", exportName: "createShortlist", sql: "create_shortlist", key: "recruit.shortlists", subject: "org" },
  { name: "recruit.rename_shortlist", module: "recruit", exportName: "renameShortlist", sql: "rename_shortlist", key: "recruit.shortlists", subject: "org" },
  { name: "recruit.shortlist_add", module: "recruit", exportName: "addToShortlist", sql: "add_to_shortlist", key: "recruit.shortlists", subject: "org" },
  { name: "recruit.shortlist_reorder", module: "recruit", exportName: "reorderShortlist", sql: "reorder_shortlist", key: "recruit.shortlists", subject: "org" },
  { name: "recruit.add_note", module: "recruit", exportName: "addNote", sql: "add_note", key: "recruit.shortlists", subject: "org" },
  { name: "recruit.send_contact", module: "recruit", exportName: "sendContactRequest", sql: "send_contact_request", key: "contact.credits", subject: "org" },
  { name: "recruit.save_search", module: "recruit", exportName: "saveSearch", sql: "save_search", key: "recruit.saved_searches", subject: "org" },
  { name: "recruit.save_competition", module: "recruit", exportName: "saveCompetition", sql: "save_competition", key: "competitions.run", subject: "org" },
  { name: "recruit.create_token", module: "recruit", exportName: "createApiToken", sql: "create_api_token", key: "api.access", subject: "org" },
  { name: "recruit.create_webhook", module: "recruit", exportName: "createWebhook", sql: "create_webhook", key: "api.access", subject: "org" },
  { name: "uni.hackathon", module: "uni", exportName: "saveHackathon", sql: "save_hackathon", key: "uni.hackathons", subject: "university" },
  { name: "uni.fair", module: "uni", exportName: "saveFair", sql: "save_job_fair", key: "uni.job_fairs", subject: "university" },
  { name: "cv.refresh", module: "cv", exportName: "refreshCv", sql: null, key: "cv.refresh_on_demand", subject: "user" },
];

/**
 * SQL functions that check an entitlement but are reached by an action that isn't itself paid: reads that
 * answer "locked" for free plans, and writes whose paid part is checked elsewhere. Each says why.
 */
export const ENTITLEMENT_CHECKED_BUT_FREE: Record<string, string> = {
  publish_job: "Explore includes one live post; the slot limit is a count, not a paid feature",
  invite_org_member: "seats are a count on every plan, Explore included",
  reopen_paused_job: "slot count on every plan",
};
