# Product analytics (PostHog)

PRD 10 "Product analytics", "Session replays and heatmaps", "Privacy rules"; phase 13 slice 1. Setup steps are in
`docs/setup-checklist.md` "Phase 13".

## How it works

- **Server events** come from the database. Triggers in `supabase/migrations/20261104000000_analytics.sql` call
  `private.track()` in the same transaction as the change, which puts one message on pgmq `analytics`. The
  `analytics-worker` Edge Function (woken each minute) sends them to PostHog EU in one batch call, retries a failed batch
  up to 5 times, and drops events listed in `analytics.muted_events` (`/ops/config`). Unsent events are purged after 7
  days. A server action, a job, a webhook and the API all produce the same event, and no request waits on PostHog.
- **Browser events** are page views, `$identify` and the five landing events. `components/analytics/analytics-loader.tsx`
  loads `posthog-js` once the page is idle and sends to `/ingest` on our own domain (rewritten to PostHog EU in
  `next.config.ts`; `proxy.ts` skips it). Without `NEXT_PUBLIC_POSTHOG_KEY` nothing loads.
- **Identity:** `posthog.identify(<internal uuid>, { role, university_id })` once per browser and account
  (`components/analytics/analytics-identity.tsx`). Signup week, plan and tier are set on the person by the server. Sign-out
  calls `posthog.reset()` and clears PostHog's localStorage (`lib/auth/channel.ts`). No analytics cookie.
- **Account deletion:** deleting an account queues `delete_person`; an hour later the worker deletes the person, their
  events and their recordings through PostHog's API (`POSTHOG_PERSONAL_API_KEY`, scope `person:write`). A failed deletion
  is retried hourly and never dropped.

## What PostHog may see

Ids (the user uuid, university id), enums, counts and booleans. Never names, emails, usernames, GitHub logins or content.

- Every browser event passes `scrubEvent` (`lib/analytics/privacy.ts`): only the allowed events leave; URLs keep origin
  and path only, with `/profile/<username>`, `/cv/<username>` and `/verify/<code>` replaced; page titles and any value
  containing "@" are dropped.
- The worker re-checks server events: flat properties only, strings of at most 64 characters without spaces or "@".
- **Replays:** 20% of sessions. All text, inputs and text-bearing attributes (alt, title, aria-label, meta content)
  masked; links scrubbed like URLs; every user-uploaded image and anything marked `data-ph-block` blocked; head metadata
  and scripts left out. Never recorded: `/chat`, venture chat, `/ops`, sign-in, sign-up, password reset, `/auth`,
  `/settings/billing|security|account`, `/billing`, `/org|uni/billing`, `/org|uni/join`, `/uni/claim`, `/fairs/invite`,
  CV share links, `/verify/<code>`, request confirm and unsubscribe, event check-in. Recording pauses on those routes
  (client-side navigation included) and anything still buffered is dropped there.
- **Heatmaps:** marketing pages, `/feed`, `/opportunities` and onboarding only.

## Events

### Browser

| Event | When | Properties |
| --- | --- | --- |
| `$pageview` | Every page, including client-side navigation | (PostHog's own, scrubbed) |
| `signup_start` | A live university email submitted on the landing page | `source` (hero, final) |
| `uni_detected` | The email field recognised a live university | `source`, `university_id` |
| `uni_not_live` | It recognised a university that isn't live, or an unknown domain | `source`, `known` |
| `uni_requested` | "Request your university" sent | `known` |
| `org_cta_click` | A call to action on an organisation page | `cta`, `page` |

### Server (outbox)

| Event | Source | Properties | Person |
| --- | --- | --- | --- |
| `account_created` | `profiles` insert | `role` | `$set` role, university_id; `$set_once` signup_week |
| `email_verified` | `auth.users` confirmed (once) | — | |
| `agreement_accepted` | first `agreement_acceptances` row | `version` | |
| `onboarding_step` | `onboarding_state.step` rises (once per step) | `step`, `role` | |
| `onboarding_completed` | `onboarding_state.completed_at` set (once) | `role` | |
| `tour_completed`, `tour_skipped` | `tour_progress` | `tour` (+ `step` when skipped) | |
| `github_connected` | `github_accounts` insert (once) | — | |
| `first_l2_skill` | first skill at L2 or above (once) | `level` | |
| `contribution_logged` | manual `contributions` insert | `kind` | |
| `cv_exported` | `cv_pdf_exports` insert | `template` | |
| `post_created` | `posts` insert | `type`, `audience` | |
| `survey_answered` | `micro_survey_responses` insert | `dimension` | |
| `comment_added` | `post_comments` insert | `reply` | |
| `chat_message_sent` | `chat_messages` insert | `thread_type`, `image` | |
| `feedback_sent` | `feedback` insert | `type` | |
| `venture_created` | `ventures` insert | `type`, `visibility` | |
| `venture_joined` | `venture_members` insert (not the owner's row) | `team_role` | |
| `venture_completed` | `ventures.status` → completed, one per member | `type`, `owner` | |
| `contact_request_sent` | `contact_requests` insert (the recruiter) | — | |
| `contact_request_accepted` | status → accepted (the student) | — | |
| `application_stage_changed` | `job_applications` insert (student) or stage change (whoever moved it) | `from`, `to` | |
| `hire_confirmed` | `hires` insert (the recruiter) | `kind`, `job_type` | |
| `subscription_started` | `subscriptions` insert (whoever started it) | `subject_type`, `plan_id`, `status`, `gateway`, `live` | `$set` plan (students) |
| `subscription_cancelled` | cancel at period end, or cancelled | same | |
| `$set` | university or role changed; tier changed | — | `$set` university_id, role / tier |

The list is `SERVER_EVENTS` in `lib/analytics/events.ts`; `tests/unit/analytics.test.ts` fails if it and the migration
disagree. A new event: add a trigger that calls `private.track()`, add the name to `SERVER_EVENTS` and a row here.

## Dashboards (build in PostHog; every insight filterable by the person property `university_id`)

1. **Activation:** persons with `onboarding_completed`, then `github_connected` or `venture_joined` within 7 days; weekly
   by signup week.
2. **DAU / WAU / MAU:** unique persons with any event (Trends, "Unique users", daily/weekly/monthly).
3. **Retention:** D1 / D7 / D30 retention by signup cohort (start event `account_created`, return event any event).
4. **Signup funnel:** `$pageview` on `/` → `uni_detected` → `signup_start` → `account_created` → `email_verified` →
   `agreement_accepted` → `onboarding_completed`.
5. **Survey answer rate:** `survey_answered` per weekly active student (formula: survey_answered ÷ unique users).
6. **Feed health:** share of posts reaching Full comes from our database (`/ops/metrics`); PostHog shows `post_created`
   and `comment_added` per active user.
7. **Time to first recruiter contact:** funnel `account_created` → `contact_request_accepted`, time to convert.
8. **Pro conversion:** funnel `account_created` → `subscription_started` where `plan_id` is a student Pro plan.

Business metrics (MRR, hires, evidence levels, rank distribution, queue backlogs) stay in `/ops/metrics`.
