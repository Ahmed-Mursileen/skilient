-- Phase 10 (billing), part 0: enum values used by later billing migrations. Added in their own
-- migration because a new enum value can't be used in the transaction that adds it.

-- Job posts over the plan's live-post limit are paused (hidden from students, never deleted);
-- the recruiter chooses which to reopen (PRD 4b.6).
alter type public.job_status add value if not exists 'paused';
