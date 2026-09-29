-- Phase 4 slice 5: the ranking engine (PRD 5.13 formula v1, 5.17 tiers; decisions.md 2026-09-30).
--
-- Score = Proof (work, verified skills, endorsements, credentials; never decays) + Momentum
-- (content quality, consistency, citizenship; decays) + adjustments (penalties, upheld gains).
-- One SQL function per component returns its capped points and the evidence behind them;
-- compute_ranking() puts them together. Every weight lives in platform_config
-- 'ranking.formula'; its version is the formula version every score records.
--
-- The nightly run is a small state machine (ranking_runs): 03:07 PKT starts it and the
-- per-minute ranking-step job does one stage, or one batch of 500 students, per transaction:
-- rings → students (compute, rapid-gain hold, publish) → percentiles and tiers → Sunday
-- snapshot. A procedure that commits between batches can't pin its search_path, which the
-- advisors gate requires, so each step is its own committed call instead. Decay is computed
-- from the data in each run (days since the last activity, less the student's university's
-- exam days), so a rerun gives the same numbers.

-- ---------------------------------------------------------------------------
-- Formula v1
-- ---------------------------------------------------------------------------
insert into public.platform_config (key, version, value, reason) values
  ('ranking.formula', 1, $json${
    "caps": {"work": 1125, "skills": 500, "endorsements": 375, "credentials": 125, "momentum": 375},
    "work": {"venture_points": 150, "creator": 1.3, "member": 1.0, "unconfirmed_entry": 0.25, "pr_points": 10, "pr_cap": 200},
    "complexity": {"base": 0.8, "span": 0.5, "min_team": 2, "team_range": 4, "min_weeks": 1, "weeks_range": 15, "max_tags": 8, "max_extra_deliverables": 3},
    "skills": {"level_points": {"2": 15, "3": 20, "4": 25}, "span_categories": 3, "span_bonus": 0.1},
    "endorsements": {"points": 15, "mutual": 0.5, "tier_weights": {"none": 0.5, "raw": 0.5, "spark": 0.7, "flare": 0.9, "shine": 1.1, "radiant": 1.3, "luminary": 1.5}},
    "credentials": {"points": 40, "recognised": 1.5},
    "momentum": {"content_cap": 175, "min_answers": 5, "min_non_friends": 3, "consistency_cap": 120, "week_points": 10, "weeks": 12,
                 "citizenship_cap": 80, "join_points": 4, "join_cap": 40, "join_hours": 72, "confirm_points": 2, "confirm_cap": 40},
    "decay": {"grace_days": 14, "weekly": 0.02, "floor": 0.4},
    "penalties": {"low": 50, "medium": 150, "high": 300, "months": 12},
    "tiers": {"spark": 100, "flare": 250, "shine": 500, "radiant": 1000, "luminary": 2000, "flare_ventures": 2, "flare_endorsements": 3,
              "shine_completed": 1, "shine_level": 3, "radiant_top": 0.1, "luminary_top": 0.02, "drop_days": 14},
    "rings": {"window_days": 180},
    "rapid_gain": {"points": 150, "completions": 2, "completion_days": 7},
    "batch_size": 500
  }$json$::jsonb, 'PRD 5.13 formula v1 with the phase 4 answers (decisions.md 2026-09-30)');

-- The formula in force: its version is the formula version.
create function private.ranking_formula()
returns table (version integer, value jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.version, c.value from public.platform_config c
   where c.key = 'ranking.formula' and c.effective_at <= now()
   order by c.effective_at desc, c.version desc
   limit 1;
$$;
revoke all on function private.ranking_formula() from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create type public.ranking_tier as enum ('raw', 'spark', 'flare', 'shine', 'radiant', 'luminary');
create type public.anti_gaming_kind as enum ('ring', 'rapid_gain');
create type public.ranking_adjustment_kind as enum ('penalty', 'rapid_gain');

-- Exam periods pause Momentum decay for that university's students (PRD 5.13). Entered by
-- `accounts` staff in /ops until university admins arrive (phase 9); none are seeded.
create table public.exam_periods (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- At most 45 days, both ends included.
  check (ends_on >= starts_on and ends_on - starts_on < 45)
);
comment on table public.exam_periods is 'Exam periods (PRD 5.13): decay pauses on these days. Written only by staff functions.';
create index exam_periods_university_idx on public.exam_periods (university_id, starts_on);
create index exam_periods_created_by_idx on public.exam_periods (created_by);

-- What Work needs about a completed venture, frozen at completion (decisions.md 2026-09-30):
-- the owner at completion (creator 1.3x), the complexity inputs and each member's units.
create table public.venture_completions (
  venture_id uuid primary key references public.ventures (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  completed_at timestamptz not null,
  team_size smallint not null check (team_size between 0 and 6),
  weeks numeric(7, 2) not null check (weeks >= 0),
  skill_tags smallint not null check (skill_tags >= 0),
  deliverables smallint not null check (deliverables >= 0),
  verified_members smallint not null check (verified_members >= 0),
  -- Completed before this migration: recorded from the venture as it stood then.
  backfilled boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.venture_completions is 'Complexity inputs and the creator of each completed venture, frozen at completion (PRD 5.13 Work).';
create index venture_completions_owner_idx on public.venture_completions (owner_id);

create table public.venture_completion_members (
  venture_id uuid not null references public.venture_completions (venture_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Verified GitHub entries count once per active day (PKT); peer-verified manual entries 1
  -- each; unconfirmed entries a fraction (formula work.unconfirmed_entry).
  github_days integer not null default 0 check (github_days >= 0),
  verified_entries integer not null default 0 check (verified_entries >= 0),
  unconfirmed_entries integer not null default 0 check (unconfirmed_entries >= 0),
  primary key (venture_id, user_id)
);
comment on table public.venture_completion_members is 'Each member''s contribution units at completion, for the verified share (PRD 5.13).';
create index venture_completion_members_user_idx on public.venture_completion_members (user_id);

-- One row per student: the published score. held_total is a computed score waiting on a
-- rapid-gain review; the published columns stay at the day before until it's decided.
create table public.ranking_scores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  formula_version integer not null,
  components jsonb not null,
  proof numeric(8, 2) not null,
  momentum numeric(8, 2) not null,
  adjustments numeric(8, 2) not null,
  total numeric(8, 2) not null check (total >= 0),
  -- At least one peer-verified contribution; others show "not ranked yet".
  ranked boolean not null,
  tier public.ranking_tier,
  -- The highest tier met on the last run, before the 14-day drop rule.
  tier_met public.ranking_tier,
  percentile double precision check (percentile is null or percentile between 0 and 1),
  below_since date,
  momentum_peak numeric(8, 2) not null default 0,
  held boolean not null default false,
  held_total numeric(8, 2),
  computed_at timestamptz not null,
  published_at timestamptz not null,
  -- tier and percentile change only in the tiers stage, so every endorsement in a run is
  -- weighed by the endorser's tier from the previous run.
  check (held = (held_total is not null))
);
comment on table public.ranking_scores is
  'Published ranking per student (PRD 5.13). The owner reads the full row; others see tier and rank through functions.';
create index ranking_scores_ranked_total_idx on public.ranking_scores (total desc) where ranked;

create table public.ranking_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The PKT Sunday the snapshot was taken.
  week date not null,
  formula_version integer not null,
  -- Points per component only (the evidence lists stay on ranking_scores).
  components jsonb not null,
  total numeric(8, 2) not null,
  ranked boolean not null,
  tier public.ranking_tier,
  percentile double precision,
  primary key (user_id, week)
);
comment on table public.ranking_snapshots is 'Weekly ranking history for weekly change and appeals (PRD 5.13). Owner-read.';
create index ranking_snapshots_week_idx on public.ranking_snapshots (week);

-- Automated flags for a trust reviewer (PRD 5.13 anti-gaming): endorsement rings (their
-- endorsements count 0 while open or upheld) and rapid gains (the published score is held
-- while open; upheld records a negative adjustment).
create table public.anti_gaming_flags (
  id uuid primary key default gen_random_uuid(),
  kind public.anti_gaming_kind not null,
  user_id uuid references auth.users (id) on delete cascade,
  members uuid[] not null check (cardinality(members) >= 1),
  endorsement_ids uuid[] not null default '{}',
  detail jsonb not null default '{}'::jsonb,
  status public.review_flag_status not null default 'open',
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 2000),
  -- Rapid gain: when a nightly run acted on the decision.
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'rapid_gain') = (user_id is not null)),
  check ((status = 'open') = (reviewed_at is null))
);
comment on table public.anti_gaming_flags is 'Ring and rapid-gain flags for trust reviewers (PRD 5.13). Staff read through functions.';
create unique index anti_gaming_flags_one_open_gain on public.anti_gaming_flags (user_id)
  where kind = 'rapid_gain' and status = 'open';
create index anti_gaming_flags_user_idx on public.anti_gaming_flags (user_id);
create index anti_gaming_flags_open_idx on public.anti_gaming_flags (created_at) where status = 'open';
create index anti_gaming_flags_members_idx on public.anti_gaming_flags using gin (members);
create index anti_gaming_flags_endorsements_idx on public.anti_gaming_flags using gin (endorsement_ids);
create index anti_gaming_flags_claimed_by_idx on public.anti_gaming_flags (claimed_by) where claimed_by is not null;
create index anti_gaming_flags_reviewed_by_idx on public.anti_gaming_flags (reviewed_by) where reviewed_by is not null;

-- Penalties (upheld reports, by severity; last 12 months) and upheld rapid gains (a negative
-- adjustment equal to the held gain).
create table public.ranking_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.ranking_adjustment_kind not null,
  severity text check (severity in ('low', 'medium', 'high')),
  points numeric(8, 2) check (points < 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  case_id uuid references public.report_cases (id) on delete set null,
  flag_id uuid references public.anti_gaming_flags (id) on delete set null,
  staff_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'penalty') = (severity is not null)),
  check ((kind = 'rapid_gain') = (points is not null))
);
comment on table public.ranking_adjustments is 'Penalties and upheld rapid gains (PRD 5.13). Written only by staff functions.';
create index ranking_adjustments_user_idx on public.ranking_adjustments (user_id, created_at);
create index ranking_adjustments_case_idx on public.ranking_adjustments (case_id) where case_id is not null;
create index ranking_adjustments_flag_idx on public.ranking_adjustments (flag_id) where flag_id is not null;
create index ranking_adjustments_staff_idx on public.ranking_adjustments (staff_id) where staff_id is not null;

create table public.ranking_runs (
  id bigint generated always as identity primary key,
  -- The PKT date of the run; one per day.
  run_on date not null unique,
  -- Every student in a run is scored as of this moment, whichever batch they fall in.
  as_of timestamptz not null,
  formula_version integer not null,
  formula jsonb not null,
  stage text not null default 'rings' check (stage in ('rings', 'students', 'tiers', 'snapshot', 'done', 'failed')),
  cursor uuid,
  students integer not null default 0,
  held integer not null default 0,
  steps integer not null default 0,
  job_run_id uuid references public.job_runs (id) on delete set null,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((stage in ('done', 'failed')) = (finished_at is not null))
);
comment on table public.ranking_runs is 'Nightly ranking runs, advanced one committed step at a time by the ranking-step job.';
create index ranking_runs_open_idx on public.ranking_runs (id) where finished_at is null;
create index ranking_runs_job_run_idx on public.ranking_runs (job_run_id);

alter table public.exam_periods enable row level security;
alter table public.venture_completions enable row level security;
alter table public.venture_completion_members enable row level security;
alter table public.ranking_scores enable row level security;
alter table public.ranking_snapshots enable row level security;
alter table public.anti_gaming_flags enable row level security;
alter table public.ranking_adjustments enable row level security;
alter table public.ranking_runs enable row level security;
revoke all on table public.exam_periods, public.venture_completions, public.venture_completion_members,
  public.ranking_scores, public.ranking_snapshots, public.anti_gaming_flags, public.ranking_adjustments,
  public.ranking_runs from anon, authenticated;

-- The owner reads their own score and history (the /me/score page); everyone else goes
-- through functions that return tier and rank only.
grant select on table public.ranking_scores, public.ranking_snapshots to authenticated;
create policy ranking_scores_owner_read on public.ranking_scores for select to authenticated
  using (user_id = (select auth.uid()));
create policy ranking_snapshots_owner_read on public.ranking_snapshots for select to authenticated
  using (user_id = (select auth.uid()));
-- Students see their own university's exam periods (the /me/score pause notice); accounts
-- staff see all of them.
grant select on table public.exam_periods to authenticated;
create policy exam_periods_read on public.exam_periods for select to authenticated
  using (university_id = (select private.current_university_id()) or (select private.is_staff('accounts')));
-- venture_completions, venture_completion_members, anti_gaming_flags, ranking_adjustments and
-- ranking_runs: no grants; read only by the functions below.

-- ---------------------------------------------------------------------------
-- Completed ventures: frozen at completion, and backfilled for earlier ones
-- ---------------------------------------------------------------------------
create function private.record_venture_completion(p_venture uuid, p_backfilled boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or v.status <> 'completed' then
    return;
  end if;
  insert into public.venture_completions (venture_id, owner_id, completed_at, team_size, weeks, skill_tags, deliverables,
                                          verified_members, backfilled)
  values (v.id, v.owner_id, v.completed_at,
          (select count(*) from public.venture_members m where m.venture_id = v.id),
          round(greatest(extract(epoch from (v.completed_at - v.created_at)), 0) / 604800.0, 2),
          cardinality(v.skill_ids),
          (select count(*) from public.venture_deliverables d where d.venture_id = v.id),
          private.verified_contributors(v.id),
          p_backfilled)
  on conflict (venture_id) do nothing;
  if not found then
    return;
  end if;
  -- Each current member's original entries, with the peer-verified state of their newest
  -- version (GitHub entries made after the venture started are verified already).
  insert into public.venture_completion_members (venture_id, user_id, github_days, verified_entries, unconfirmed_entries)
  select v.id, m.user_id,
         count(distinct (o.created_at at time zone 'Asia/Karachi')::date) filter (where o.source = 'github' and o.verified),
         count(*) filter (where o.source = 'manual' and o.verified),
         count(*) filter (where o.id is not null and not o.verified)
    from public.venture_members m
    left join lateral (
      select x.id, x.source, x.created_at,
             ((x.source = 'github' and not x.before_venture)
               or exists (select 1 from public.contribution_confirmations k where k.contribution_id = cur.id)) as verified
        from public.contributions x
        cross join lateral (
          select c.id from public.contributions c
           where c.id = x.id or c.corrects_id = x.id
           order by c.created_at desc, (c.id = x.id)
           limit 1
        ) cur
       where x.venture_id = v.id and x.user_id = m.user_id and x.corrects_id is null
    ) o on true
   where m.venture_id = v.id
   group by m.user_id;
end;
$$;
revoke all on function private.record_venture_completion(uuid, boolean) from public;

create function private.ventures_record_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform private.record_venture_completion(new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.ventures_record_completion() from public;
create trigger ventures_record_completion after update of status on public.ventures
  for each row execute function private.ventures_record_completion();

select private.record_venture_completion(v.id, true) from public.ventures v where v.status = 'completed';

-- Complexity = base + span x the average of four 0-1 terms: team size, weeks, skill tags and
-- deliverables beyond the first (decisions.md 2026-09-30).
create function private.venture_complexity(p_team integer, p_weeks numeric, p_tags integer, p_deliverables integer, p_f jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (x->>'base')::numeric + (x->>'span')::numeric * (
           least(1, greatest(0, (p_team - (x->>'min_team')::numeric) / (x->>'team_range')::numeric))
         + least(1, greatest(0, (p_weeks - (x->>'min_weeks')::numeric) / (x->>'weeks_range')::numeric))
         + least(p_tags, (x->>'max_tags')::integer)::numeric / (x->>'max_tags')::numeric
         + least(greatest(p_deliverables - 1, 0), (x->>'max_extra_deliverables')::integer)::numeric
             / (x->>'max_extra_deliverables')::numeric
         ) / 4
    from (select p_f->'complexity' as x) c;
$$;
revoke all on function private.venture_complexity(integer, numeric, integer, integer, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Post quality index: the feed's Q (one definition, used by the feed and by Momentum)
-- ---------------------------------------------------------------------------
create function private.post_quality(p_post uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sc jsonb := coalesce(private.config('feed.score'), '{}'::jsonb);
  v_k numeric := coalesce((sc->>'bayes_k')::numeric, 10);
  v_mean numeric := coalesce((sc->>'platform_mean')::numeric, 0.6);
  v_pos numeric;
  v_total numeric;
  v_cred_rate numeric;
begin
  -- Bayesian average of weighted positives on Informative and Interesting, reduced by the
  -- Credible negative rate.
  select coalesce(sum(weighted_ticks), 0), coalesce(sum(weighted_ticks + weighted_crosses), 0) into v_pos, v_total
    from public.post_survey_counts where post_id = p_post and dimension in ('informative', 'interesting');
  select case when sum(ticks + crosses) > 0 then sum(crosses)::numeric / sum(ticks + crosses) else 0 end into v_cred_rate
    from public.post_survey_counts where post_id = p_post and dimension = 'credible';
  return (v_pos + v_k * v_mean) / (v_total + v_k)
         * (1 - least(coalesce((sc->>'credible_penalty_max')::numeric, 0.8),
                      coalesce((sc->>'credible_penalty_factor')::numeric, 2) * coalesce(v_cred_rate, 0)));
end;
$$;
revoke all on function private.post_quality(uuid) from public;

create or replace function private.feed_score(p_post uuid, p_viewer uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.posts;
  sc jsonb := coalesce(private.config('feed.score'), '{}'::jsonb);
  rc jsonb := coalesce(private.config('feed.relevance'), '{}'::jsonb);
  dc jsonb := coalesce(private.config('feed.diversity'), '{}'::jsonb);
  pc jsonb := coalesce(private.config('feed.placement'), '{}'::jsonb);
  q numeric;
  e numeric;
  r numeric := 1;
  d numeric := 1;
  v_commenters numeric;
  v_overlap integer;
  a public.profiles;
  v public.profiles;
  v_age numeric;
  v_score numeric;
begin
  select * into p from public.posts where id = p_post;
  if not found then
    return 0;
  end if;
  if exists (select 1 from public.user_mutes m where m.user_id = p_viewer and m.muted_id = p.author_id) then
    return 0;
  end if;
  select * into a from public.profiles where user_id = p.author_id;
  select * into v from public.profiles where user_id = p_viewer;

  q := private.post_quality(p_post);

  -- E: 0.5 × ln(1 + distinct commenters); friends of the author count half; short comments
  -- and the author don't count.
  select coalesce(sum(case when private.are_friends(x.author_id, p.author_id) then coalesce((sc->>'friend_commenter')::numeric, 0.5) else 1 end), 0)
    into v_commenters
    from (select distinct c.author_id from public.post_comments c
           where c.post_id = p_post and c.deleted_at is null and c.author_id <> p.author_id
             and char_length(c.body) >= coalesce((sc->>'min_comment_chars')::integer, 10)) x;
  e := coalesce((sc->>'conversation')::numeric, 0.5) * ln(1 + v_commenters);

  -- R: relevance to this reader, multiplied and capped.
  if private.are_friends(p.author_id, p_viewer) then
    r := r * coalesce((rc->>'friend')::numeric, 1.4);
  end if;
  if p.venture_id is not null and exists (select 1 from public.venture_follows f where f.venture_id = p.venture_id and f.user_id = p_viewer) then
    r := r * coalesce((rc->>'follows_venture')::numeric, 1.4);
  end if;
  if a.department is not null and a.department = v.department and a.graduation_year = v.graduation_year then
    r := r * coalesce((rc->>'same_program')::numeric, 1.2);
  end if;
  if a.graduation_year is not null and a.graduation_year = v.graduation_year then
    r := r * coalesce((rc->>'same_batch')::numeric, 1.1);
  end if;
  select count(*) into v_overlap
    from public.user_skills sa join public.user_skills sv on sv.skill_id = sa.skill_id
   where sa.user_id = p.author_id and sv.user_id = p_viewer and sa.level >= 1 and sv.level >= 1;
  r := r * least(coalesce((rc->>'skills_max')::numeric, 1.3), 1 + coalesce((rc->>'skills_step')::numeric, 0.1) * v_overlap);
  r := least(r, coalesce((rc->>'cap')::numeric, 2.0));

  -- D: already seen.
  if exists (select 1 from public.post_views pv where pv.post_id = p_post and pv.user_id = p_viewer) then
    d := d * coalesce((dc->>'seen')::numeric, 0.3);
  end if;

  v_age := greatest(extract(epoch from (now() - p.created_at)) / 3600, 0);
  v_score := (coalesce((sc->>'base')::numeric, 0.15) + q) * (1 + e) * r * d
             / power(v_age + 2, coalesce((sc->>'gravity')::numeric, 1.5));

  -- Stage placement.
  if p.stage = 'limited' and not private.in_seed_audience(p_post, p_viewer) then
    v_score := v_score * coalesce((pc->>'limited_outside_seed')::numeric, 0.4);
  elsif p.stage = 'global_boost' then
    v_score := v_score * coalesce((pc->>'global_boost')::numeric, 1.5);
  elsif p.stage = 'demoted' then
    v_score := v_score * coalesce((pc->>'demoted')::numeric, 0.3);
  end if;
  if p.type = 'shipped' and p.created_at > now() - make_interval(hours => coalesce((pc->>'shipped_boost_hours')::integer, 24)) then
    v_score := v_score * coalesce((pc->>'shipped_boost')::numeric, 1.5);
  end if;
  return v_score;
end;
$$;

-- ---------------------------------------------------------------------------
-- Components: each returns {points, ...evidence}
-- ---------------------------------------------------------------------------
-- The student's original entries whose newest version is peer-verified.
create function private.verified_entries(p_user uuid)
returns table (entry_id uuid, venture_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.venture_id
    from public.contributions o
   where o.user_id = p_user and o.corrects_id is null
     and ((o.source = 'github' and not o.before_venture)
          or exists (
            select 1 from public.contribution_confirmations k
             where k.contribution_id = (
               select c.id from public.contributions c
                where c.id = o.id or c.corrects_id = o.id
                order by c.created_at desc, (c.id = o.id)
                limit 1)));
$$;
revoke all on function private.verified_entries(uuid) from public;

-- Work: completed ventures (150 x complexity x role x verified share) that pass every
-- completion rule, plus counted pull requests (10 each, up to 200). Cap 1,125.
create function private.score_work(p_user uuid, p_f jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w jsonb := p_f->'work';
  v_unconf numeric := (p_f->'work'->>'unconfirmed_entry')::numeric;
  v_ventures jsonb;
  v_vsum numeric;
  v_prs integer;
  v_pr_items jsonb;
  v_pr_points numeric;
begin
  with mine as (
    select c.venture_id, c.owner_id, c.completed_at, c.team_size, c.weeks, c.skill_tags, c.deliverables,
           m.github_days + m.verified_entries + v_unconf * m.unconfirmed_entries as units
      from public.venture_completion_members m
      join public.venture_completions c on c.venture_id = m.venture_id
      join public.ventures v on v.id = c.venture_id and v.status = 'completed'
     where m.user_id = p_user
       and c.team_size >= 2 and c.deliverables >= 1 and c.verified_members >= 2
  ), calc as (
    select mine.*,
           (select percentile_cont(0.5) within group (order by x.github_days + x.verified_entries + v_unconf * x.unconfirmed_entries)
              from public.venture_completion_members x where x.venture_id = mine.venture_id)::numeric as median,
           private.venture_complexity(mine.team_size, mine.weeks, mine.skill_tags, mine.deliverables, p_f) as complexity,
           mine.owner_id is not distinct from p_user as creator
      from mine
  ), pts as (
    select calc.*,
           case when median = 0 then (case when units > 0 then 1 else 0 end) else least(1, units / median) end as share
      from calc
  ), vp as (
    select pts.*,
           (w->>'venture_points')::numeric * complexity
             * (case when creator then (w->>'creator')::numeric else (w->>'member')::numeric end) * share as points
      from pts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'venture_id', venture_id, 'completed_at', completed_at, 'creator', creator, 'complexity', round(complexity, 3),
           'units', units, 'median', median, 'share', round(share, 3), 'points', round(points, 2))
           order by completed_at, venture_id), '[]'::jsonb),
         coalesce(sum(points), 0)
    into v_ventures, v_vsum
    from vp;

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object('repo', r.repo_full_name, 'number', r.number, 'merged_at', r.merged_at)
                            order by r.merged_at desc), '[]'::jsonb)
    into v_prs, v_pr_items
    from public.github_pull_requests r
   where r.user_id = p_user and r.counted;
  v_pr_points := least((w->>'pr_cap')::numeric, v_prs * (w->>'pr_points')::numeric);

  return jsonb_build_object(
    'points', round(least((p_f->'caps'->>'work')::numeric, v_vsum + v_pr_points), 2),
    'ventures', v_ventures,
    'prs', jsonb_build_object('count', v_prs, 'points', v_pr_points, 'items', v_pr_items));
end;
$$;
revoke all on function private.score_work(uuid, jsonb) from public;

-- Verified skills: per skill L2 15, L3 20, L4 25; +10% for spanning 3+ categories. Cap 500.
create function private.score_skills(p_user uuid, p_f jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb := p_f->'skills';
  v_items jsonb;
  v_sum numeric;
  v_categories integer;
  v_bonus boolean;
begin
  select coalesce(jsonb_agg(jsonb_build_object('skill_id', x.skill_id, 'level', x.level, 'points', x.points)
                            order by x.level desc, x.skill_id), '[]'::jsonb),
         coalesce(sum(x.points), 0),
         count(distinct x.category)::integer
    into v_items, v_sum, v_categories
    from (
      select u.skill_id, u.level, k.category, coalesce((s->'level_points'->>u.level::text)::numeric, 0) as points
        from public.user_skills u
        join public.skills k on k.id = u.skill_id
       where u.user_id = p_user and u.level >= 2
    ) x;
  v_bonus := v_categories >= (s->>'span_categories')::integer;
  return jsonb_build_object(
    'points', round(least((p_f->'caps'->>'skills')::numeric,
                          v_sum * (1 + case when v_bonus then (s->>'span_bonus')::numeric else 0 end)), 2),
    'categories', v_categories, 'bonus', v_bonus, 'items', v_items);
end;
$$;
revoke all on function private.score_skills(uuid, jsonb) from public;

-- Endorsements: 15 x the endorser's tier weight (from the previous run) x 0.5 when the pair
-- endorse each other x 0 in an open or upheld ring. Hidden ones don't count. Cap 375.
create function private.score_endorsements(p_user uuid, p_f jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e jsonb := p_f->'endorsements';
  v_items jsonb;
  v_sum numeric;
  v_counting integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'endorser_id', x.endorser_id, 'skill_id', x.skill_id, 'venture_id', x.venture_id,
           'weight', x.weight, 'mutual', x.mutual, 'ring', x.ring, 'points', round(x.points, 2))
           order by x.created_at, x.id), '[]'::jsonb),
         coalesce(sum(x.points), 0),
         count(*) filter (where x.points > 0)::integer
    into v_items, v_sum, v_counting
    from (
      select y.*,
             (e->>'points')::numeric * y.weight
               * (case when y.mutual then (e->>'mutual')::numeric else 1 end)
               * (case when y.ring then 0 else 1 end) as points
        from (
          select n.id, n.endorser_id, n.skill_id, n.venture_id, n.created_at,
                 coalesce((e->'tier_weights'->>coalesce(rs.tier::text, 'none'))::numeric, (e->'tier_weights'->>'none')::numeric) as weight,
                 exists (select 1 from public.endorsements b where b.endorser_id = p_user and b.endorsee_id = n.endorser_id) as mutual,
                 exists (select 1 from public.anti_gaming_flags f
                          where f.kind = 'ring' and f.status in ('open', 'upheld') and f.endorsement_ids @> array[n.id]) as ring
            from public.endorsements n
            left join public.ranking_scores rs on rs.user_id = n.endorser_id
           where n.endorsee_id = p_user and not n.hidden
        ) y
    ) x;
  return jsonb_build_object('points', round(least((p_f->'caps'->>'endorsements')::numeric, v_sum), 2),
                            'counting', v_counting, 'items', v_items);
end;
$$;
revoke all on function private.score_endorsements(uuid, jsonb) from public;

-- Credentials: 40 per approved, unexpired certificate, 1.5x for a recognised issuer. Cap 125.
create function private.score_credentials(p_user uuid, p_f jsonb, p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c jsonb := p_f->'credentials';
  v_items jsonb;
  v_sum numeric;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'recognised', x.recognised, 'points', x.points)
                            order by x.created_at, x.id), '[]'::jsonb),
         coalesce(sum(x.points), 0)
    into v_items, v_sum
    from (
      select k.id, k.created_at, k.recognised_issuer_id is not null as recognised,
             (c->>'points')::numeric * (case when k.recognised_issuer_id is not null then (c->>'recognised')::numeric else 1 end) as points
        from public.credentials k
       where k.user_id = p_user and k.status = 'approved' and (k.expires_on is null or k.expires_on >= p_today)
    ) x;
  return jsonb_build_object('points', round(least((p_f->'caps'->>'credentials')::numeric, v_sum), 2), 'items', v_items);
end;
$$;
revoke all on function private.score_credentials(uuid, jsonb, date) from public;

-- Days in exam periods of a university after p_after, up to and including p_through.
create function private.exam_days(p_university uuid, p_after date, p_through date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct d.day)::integer
    from public.exam_periods e
    cross join lateral generate_series(greatest(e.starts_on, p_after + 1), least(e.ends_on, p_through), interval '1 day') as d(day)
   where e.university_id = p_university and e.ends_on > p_after and e.starts_on <= p_through;
$$;
revoke all on function private.exam_days(uuid, date, date) from public;

-- Momentum: content quality (175), consistency (120), citizenship (80), capped at 375, then
-- decayed: 2% a full inactive week after day 14 (exam days don't count), never below 40%
-- of the peak and never above what was earned.
create function private.score_momentum(p_user uuid, p_f jsonb, p_as_of timestamptz, p_prev_peak numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m jsonb := p_f->'momentum';
  dc jsonb := p_f->'decay';
  v_today date := (p_as_of at time zone 'Asia/Karachi')::date;
  v_week0 timestamp := date_trunc('week', p_as_of at time zone 'Asia/Karachi');
  v_university uuid;
  v_posts jsonb;
  v_n integer;
  v_avg numeric;
  v_content numeric;
  v_weeks integer;
  v_consistency numeric;
  v_joins integer;
  v_confirms integer;
  v_citizenship numeric;
  v_raw numeric;
  v_last timestamptz;
  v_last_day date;
  v_exam integer := 0;
  v_inactive integer := 0;
  v_decay_weeks integer := 0;
  v_factor numeric := 1;
  v_peak numeric;
  v_points numeric;
begin
  select p.university_id into v_university from public.profiles p where p.user_id = p_user;

  -- Content quality: posts with enough answers, enough of them from people who aren't the
  -- author's friends. Average index x log2(1 + posts).
  select coalesce(jsonb_agg(jsonb_build_object('post_id', q.id, 'index', round(q.idx, 2)) order by q.created_at, q.id), '[]'::jsonb),
         count(*)::integer, avg(q.idx)
    into v_posts, v_n, v_avg
    from (
      select p.id, p.created_at, private.post_quality(p.id) * 100 as idx
        from public.posts p
       where p.author_id = p_user and p.removed_at is null and p.created_at <= p_as_of
         and (select count(*) from public.micro_survey_responses r where r.post_id = p.id and r.created_at <= p_as_of)
               >= (m->>'min_answers')::integer
         and (select count(*) from public.micro_survey_responses r
               where r.post_id = p.id and r.created_at <= p_as_of and r.user_id <> p_user
                 and not private.are_friends(r.user_id, p_user)) >= (m->>'min_non_friends')::integer
    ) q;
  v_content := case when v_n > 0 then least((m->>'content_cap')::numeric, v_avg * log(2::numeric, (1 + v_n)::numeric)) else 0 end;

  -- Consistency: 10 per active ISO week (PKT) of the last 12: a contribution, a verified pull
  -- request or a post.
  select count(distinct date_trunc('week', a.t at time zone 'Asia/Karachi'))::integer into v_weeks
    from (
      select c.created_at as t from public.contributions c where c.user_id = p_user and c.corrects_id is null
      union all
      select r.merged_at from public.github_pull_requests r where r.user_id = p_user and r.counted
      union all
      select p.created_at from public.posts p where p.author_id = p_user and p.removed_at is null
    ) a
   where a.t <= p_as_of
     and (a.t at time zone 'Asia/Karachi') >= v_week0 - make_interval(weeks => (m->>'weeks')::integer - 1);
  v_consistency := least((m->>'consistency_cap')::numeric, v_weeks * (m->>'week_points')::numeric);

  -- Citizenship: join requests answered within 72 hours, teammates' entries confirmed.
  select count(*)::integer into v_joins
    from public.application_threads a
   where a.owner_id = p_user and a.status in ('accepted', 'declined') and a.decided_at <= p_as_of
     and a.decided_at - a.created_at <= make_interval(hours => (m->>'join_hours')::integer);
  select count(*)::integer into v_confirms
    from public.contribution_confirmations k
   where k.confirmer_id = p_user and k.created_at <= p_as_of;
  v_citizenship := least((m->>'citizenship_cap')::numeric,
                         least((m->>'join_cap')::numeric, v_joins * (m->>'join_points')::numeric)
                         + least((m->>'confirm_cap')::numeric, v_confirms * (m->>'confirm_points')::numeric));

  v_raw := least((p_f->'caps'->>'momentum')::numeric, v_content + v_consistency + v_citizenship);

  -- Decay: the clock restarts with a post, a contribution logged or confirmed, a verified
  -- pull request or an answered join request.
  select max(t) into v_last
    from (
      select max(p.created_at) as t from public.posts p where p.author_id = p_user and p.removed_at is null and p.created_at <= p_as_of
      union all
      select max(c.created_at) from public.contributions c where c.user_id = p_user and c.created_at <= p_as_of
      union all
      select max(k.created_at) from public.contribution_confirmations k where k.confirmer_id = p_user and k.created_at <= p_as_of
      union all
      select max(r.merged_at) from public.github_pull_requests r where r.user_id = p_user and r.counted and r.merged_at <= p_as_of
      union all
      select max(a.decided_at) from public.application_threads a
       where a.owner_id = p_user and a.status in ('accepted', 'declined') and a.decided_at <= p_as_of
    ) x;
  if v_last is not null then
    v_last_day := (v_last at time zone 'Asia/Karachi')::date;
    if v_university is not null then
      v_exam := private.exam_days(v_university, v_last_day, v_today);
    end if;
    v_inactive := greatest(0, (v_today - v_last_day) - v_exam);
    v_decay_weeks := greatest(0, floor((v_inactive - (dc->>'grace_days')::integer) / 7.0))::integer;
    v_factor := greatest(0, 1 - (dc->>'weekly')::numeric * v_decay_weeks);
  end if;
  v_peak := greatest(coalesce(p_prev_peak, 0), v_raw);
  v_points := round(least(v_raw, greatest(v_raw * v_factor, (dc->>'floor')::numeric * v_peak)), 2);

  return jsonb_build_object(
    'points', v_points,
    'raw', round(v_raw, 2),
    'peak', round(v_peak, 2),
    'content', jsonb_build_object('points', round(v_content, 2), 'average', round(coalesce(v_avg, 0), 2), 'posts', v_posts),
    'consistency', jsonb_build_object('points', v_consistency, 'weeks', v_weeks),
    'citizenship', jsonb_build_object('points', v_citizenship, 'joins', v_joins, 'confirmations', v_confirms),
    'decay', jsonb_build_object(
      'last_active', v_last, 'inactive_days', v_inactive, 'exam_days', v_exam, 'weeks', v_decay_weeks,
      'factor', v_factor,
      'exam_today', v_university is not null and exists (
        select 1 from public.exam_periods e where e.university_id = v_university and v_today between e.starts_on and e.ends_on)));
end;
$$;
revoke all on function private.score_momentum(uuid, jsonb, timestamptz, numeric) from public;

-- Penalties within the last 12 months by severity, and upheld gains.
create function private.score_adjustments(p_user uuid, p_f jsonb, p_as_of timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_sum numeric;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'severity', x.severity, 'case_id', x.case_id,
                                               'flag_id', x.flag_id, 'created_at', x.created_at, 'points', x.points)
                            order by x.created_at, x.id), '[]'::jsonb),
         coalesce(sum(x.points), 0)
    into v_items, v_sum
    from (
      select a.id, a.kind, a.severity, a.case_id, a.flag_id, a.created_at,
             case when a.kind = 'penalty' then -(p_f->'penalties'->>a.severity)::numeric else a.points end as points
        from public.ranking_adjustments a
       where a.user_id = p_user and a.created_at <= p_as_of
         and (a.kind <> 'penalty' or a.created_at > p_as_of - make_interval(months => (p_f->'penalties'->>'months')::integer))
    ) x;
  return jsonb_build_object('points', v_sum, 'items', v_items);
end;
$$;
revoke all on function private.score_adjustments(uuid, jsonb, timestamptz) from public;

-- Everything a student's score is made of, as of a moment. Pure over the data: the same
-- inputs give the same result (the peak of Momentum comes from the previous run).
create function private.compute_ranking(p_user uuid, p_as_of timestamptz default now(), p_f jsonb default null,
                                        p_prev_peak numeric default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_f, (select value from private.ranking_formula()));
  v_work jsonb;
  v_skills jsonb;
  v_endorsements jsonb;
  v_credentials jsonb;
  v_momentum jsonb;
  v_adjustments jsonb;
  v_proof numeric;
  v_facts jsonb;
begin
  v_work := private.score_work(p_user, f);
  v_skills := private.score_skills(p_user, f);
  v_endorsements := private.score_endorsements(p_user, f);
  v_credentials := private.score_credentials(p_user, f, (p_as_of at time zone 'Asia/Karachi')::date);
  v_momentum := private.score_momentum(p_user, f, p_as_of,
                                       coalesce(p_prev_peak, (select s.momentum_peak from public.ranking_scores s where s.user_id = p_user), 0));
  v_adjustments := private.score_adjustments(p_user, f, p_as_of);
  v_proof := (v_work->>'points')::numeric + (v_skills->>'points')::numeric + (v_endorsements->>'points')::numeric
             + (v_credentials->>'points')::numeric;
  -- What the tiers need beyond points (PRD 5.13; decisions.md 2026-09-30).
  select jsonb_build_object(
           'peer_verified_entries', (select count(*) from private.verified_entries(p_user)),
           'active_ventures', (select count(distinct x.venture_id) from private.verified_entries(p_user) x
                                 join public.ventures v on v.id = x.venture_id and v.status in ('in_progress', 'completed')),
           'counting_endorsements', (v_endorsements->>'counting')::integer,
           'completed_ventures', jsonb_array_length(v_work->'ventures'),
           'max_level', coalesce((select max(u.level) from public.user_skills u where u.user_id = p_user), 0),
           'teacher_endorsement', false,
           'hire', false)
    into v_facts;
  return jsonb_build_object(
    'work', v_work, 'skills', v_skills, 'endorsements', v_endorsements, 'credentials', v_credentials,
    'momentum', v_momentum, 'adjustments', v_adjustments, 'facts', v_facts,
    'proof', round(v_proof, 2),
    'total', greatest(0, round(v_proof + (v_momentum->>'points')::numeric + (v_adjustments->>'points')::numeric, 2)),
    'as_of', p_as_of);
end;
$$;
revoke all on function private.compute_ranking(uuid, timestamptz, jsonb, numeric) from public;

-- Points per component only: for snapshots and flag details.
create function private.ranking_points(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('work', p->'work'->'points', 'skills', p->'skills'->'points',
                            'endorsements', p->'endorsements'->'points', 'credentials', p->'credentials'->'points',
                            'momentum', p->'momentum'->'points', 'adjustments', p->'adjustments'->'points', 'total', p->'total');
$$;
revoke all on function private.ranking_points(jsonb) from public;

-- ---------------------------------------------------------------------------
-- Rings: a group where every pair endorsed each other within 180 days of each other is a
-- ring only when none of the ventures they endorsed through has outside evidence
-- (decisions.md 2026-09-30). Pairs and larger groups; one flag per connected group.
-- ---------------------------------------------------------------------------
create function private.venture_outside_evidence(p_venture uuid, p_endorsee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.ventures v
            where v.id = p_venture and v.status = 'completed'
              and exists (select 1 from public.venture_deliverables d where d.venture_id = v.id))
      or exists (
           select 1 from public.contributions c
            where c.venture_id = p_venture and c.user_id = p_endorsee and c.source = 'github');
$$;
revoke all on function private.venture_outside_evidence(uuid, uuid) from public;

create function private.detect_rings(p_f jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window numeric := (p_f->'rings'->>'window_days')::numeric * 86400;
  g record;
  f public.anti_gaming_flags;
  v_new uuid[];
  v_id uuid;
  v_matched uuid[] := '{}';
  v_n integer := 0;
begin
  for g in
    with recursive pairs as (
      select least(a.endorser_id, a.endorsee_id) as u1, greatest(a.endorser_id, a.endorsee_id) as u2
        from public.endorsements a
        join public.endorsements b on b.endorser_id = a.endorsee_id and b.endorsee_id = a.endorser_id
       where abs(extract(epoch from (a.created_at - b.created_at))) <= v_window
       group by 1, 2
    ), suspicious as (
      select p.u1, p.u2, array_agg(e.id order by e.id) as ids
        from pairs p
        join public.endorsements e
          on (e.endorser_id = p.u1 and e.endorsee_id = p.u2) or (e.endorser_id = p.u2 and e.endorsee_id = p.u1)
       group by p.u1, p.u2
      having not bool_or(private.venture_outside_evidence(e.venture_id, e.endorsee_id))
    ), edges as (
      select u1 as a, u2 as b from suspicious
      union
      select u2, u1 from suspicious
    ), reach (node, other) as (
      select a, a from edges
      union
      select r.node, e.b from reach r join edges e on e.a = r.other
    ), roots as (
      select node, min(other::text) as root from reach group by node
    ), grouped as (
      select array_agg(node order by node) as members from roots group by root
    )
    select gd.members,
           (select array_agg(distinct x order by x)
              from suspicious s cross join lateral unnest(s.ids) as x
             where s.u1 = any (gd.members)) as ids
      from grouped gd
  loop
    -- Endorsements a reviewer already decided on stay decided.
    v_new := array(
      select x from unnest(g.ids) as x
       where not exists (select 1 from public.anti_gaming_flags d
                          where d.kind = 'ring' and d.status in ('cleared', 'upheld') and d.endorsement_ids @> array[x]));
    if cardinality(v_new) = 0 then
      continue;
    end if;
    select * into f from public.anti_gaming_flags
     where kind = 'ring' and status = 'open' and members && g.members
     order by created_at
     limit 1;
    if f.id is not null then
      -- An open flag follows the group as it is today.
      update public.anti_gaming_flags
         set members = g.members, endorsement_ids = v_new, updated_at = now()
       where id = f.id and (members, endorsement_ids) is distinct from (g.members, v_new);
      v_matched := v_matched || f.id;
    else
      insert into public.anti_gaming_flags (kind, members, endorsement_ids, detail)
      values ('ring', g.members, v_new, jsonb_build_object('window_days', p_f->'rings'->'window_days'))
      returning id into v_id;
      v_matched := v_matched || v_id;
      v_n := v_n + 1;
    end if;
  end loop;
  -- A group that gained outside evidence (or merged into another flag's group) is no longer
  -- a ring on its own.
  update public.anti_gaming_flags
     set status = 'cleared', reviewed_at = now(), claimed_by = null, claimed_at = null, updated_at = now(),
         reason = 'Closed automatically: these endorsements are no longer a ring on their own'
   where kind = 'ring' and status = 'open' and not (id = any (v_matched));
  return v_n;
end;
$$;
revoke all on function private.detect_rings(jsonb) from public;

-- ---------------------------------------------------------------------------
-- One student in a nightly run: compute, then publish or hold a rapid gain
-- ---------------------------------------------------------------------------
create function private.ranking_apply(p_run public.ranking_runs, p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f jsonb := p_run.formula;
  rg jsonb := p_run.formula->'rapid_gain';
  old public.ranking_scores;
  c jsonb;
  v_total numeric;
  v_ranked boolean;
  v_decided public.anti_gaming_flags;
  v_baseline numeric;
  v_known jsonb;
  v_new_ventures integer;
  v_new_points numeric;
  v_exempt numeric;
  v_completions integer;
  v_gain numeric;
begin
  select * into old from public.ranking_scores where user_id = p_user for update;
  c := private.compute_ranking(p_user, p_run.as_of, f, coalesce(old.momentum_peak, 0));
  v_total := (c->>'total')::numeric;
  v_ranked := (c->'facts'->>'peer_verified_entries')::integer >= 1;

  -- The first computation is exempt from the rapid-gain check.
  if old.user_id is null then
    insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked,
                                       momentum_peak, computed_at, published_at)
    values (p_user, p_run.formula_version, c, (c->>'proof')::numeric, (c->'momentum'->>'points')::numeric,
            (c->'adjustments'->>'points')::numeric, v_total, v_ranked, (c->'momentum'->>'peak')::numeric, now(), now());
    return false;
  end if;

  -- While a rapid-gain flag is open the published score stays at the day before.
  if exists (select 1 from public.anti_gaming_flags g where g.kind = 'rapid_gain' and g.user_id = p_user and g.status = 'open') then
    update public.ranking_scores set held = true, held_total = v_total, computed_at = now() where user_id = p_user;
    return true;
  end if;

  -- A formula change is exempt too: everyone moves in the same recompute.
  if old.formula_version = p_run.formula_version then
    v_baseline := old.total;
    v_known := coalesce(old.components->'work'->'ventures', '[]'::jsonb);
    -- A gain a reviewer cleared since the last run counts from now on.
    select * into v_decided from public.anti_gaming_flags g
     where g.kind = 'rapid_gain' and g.user_id = p_user and g.status = 'cleared' and g.applied_at is null
     order by g.reviewed_at desc
     limit 1;
    if v_decided.id is not null then
      v_baseline := greatest(v_baseline, (v_decided.detail->>'to_total')::numeric);
      v_known := v_known || coalesce(v_decided.detail->'ventures', '[]'::jsonb);
    end if;
    select count(*)::integer, coalesce(sum((v->>'points')::numeric), 0) into v_new_ventures, v_new_points
      from jsonb_array_elements(c->'work'->'ventures') v
     where not exists (select 1 from jsonb_array_elements(v_known) k where k->>'venture_id' = v->>'venture_id');
    -- New completions (every completion rule passed, or they wouldn't count) are exempt,
    -- unless the student is in an open ring.
    v_exempt := least(v_new_points, greatest(0, (c->'work'->>'points')::numeric - (old.components->'work'->>'points')::numeric));
    if exists (select 1 from public.anti_gaming_flags g where g.kind = 'ring' and g.status = 'open' and g.members @> array[p_user]) then
      v_exempt := 0;
    end if;
    select count(*)::integer into v_completions
      from jsonb_array_elements(c->'work'->'ventures') v
     where (v->>'completed_at')::timestamptz > p_run.as_of - make_interval(days => (rg->>'completion_days')::integer);
    v_gain := v_total - v_baseline - v_exempt;
    if v_gain > (rg->>'points')::numeric or (v_new_ventures > 0 and v_completions > (rg->>'completions')::integer) then
      update public.anti_gaming_flags set applied_at = now()
       where kind = 'rapid_gain' and user_id = p_user and status <> 'open' and applied_at is null;
      insert into public.anti_gaming_flags (kind, user_id, members, detail)
      values ('rapid_gain', p_user, array[p_user], jsonb_build_object(
        'reason', case when v_gain > (rg->>'points')::numeric then 'gain' else 'completions' end,
        'from_total', v_baseline, 'to_total', v_total, 'gain', v_total - v_baseline, 'exempt', v_exempt,
        'completions', v_completions, 'run_on', p_run.run_on,
        'from', private.ranking_points(old.components), 'to', private.ranking_points(c),
        'ventures', c->'work'->'ventures'));
      update public.ranking_scores set held = true, held_total = v_total, computed_at = now() where user_id = p_user;
      return true;
    end if;
  end if;

  update public.anti_gaming_flags set applied_at = now()
   where kind = 'rapid_gain' and user_id = p_user and status <> 'open' and applied_at is null;
  update public.ranking_scores
     set formula_version = p_run.formula_version, components = c, proof = (c->>'proof')::numeric,
         momentum = (c->'momentum'->>'points')::numeric, adjustments = (c->'adjustments'->>'points')::numeric,
         total = v_total, ranked = v_ranked,
         momentum_peak = (c->'momentum'->>'peak')::numeric, held = false, held_total = null,
         computed_at = now(), published_at = now()
   where user_id = p_user;
  return false;
end;
$$;
revoke all on function private.ranking_apply(public.ranking_runs, uuid) from public;

-- ---------------------------------------------------------------------------
-- Percentiles and tiers (all ranked students on the platform, in one statement each)
-- ---------------------------------------------------------------------------
-- The highest tier met, each tier needing its own milestone and every one below it.
create function private.tier_met(p_ranked boolean, p_total numeric, p_percentile double precision, p_facts jsonb, p_f jsonb)
returns public.ranking_tier
language plpgsql
immutable
set search_path = ''
as $$
declare
  t jsonb := p_f->'tiers';
  v_pct numeric := coalesce(p_percentile, 0)::numeric;
begin
  if not coalesce(p_ranked, false) then
    return null;
  end if;
  if p_total < (t->>'spark')::numeric or coalesce((p_facts->>'peer_verified_entries')::integer, 0) < 1 then
    return 'raw';
  end if;
  if p_total < (t->>'flare')::numeric
     or coalesce((p_facts->>'active_ventures')::integer, 0) < (t->>'flare_ventures')::integer
     or coalesce((p_facts->>'counting_endorsements')::integer, 0) < (t->>'flare_endorsements')::integer then
    return 'spark';
  end if;
  if p_total < (t->>'shine')::numeric
     or coalesce((p_facts->>'completed_ventures')::integer, 0) < (t->>'shine_completed')::integer
     or coalesce((p_facts->>'max_level')::integer, 0) < (t->>'shine_level')::integer then
    return 'flare';
  end if;
  if p_total < (t->>'radiant')::numeric or v_pct < 1 - (t->>'radiant_top')::numeric then
    return 'shine';
  end if;
  if p_total < (t->>'luminary')::numeric or v_pct < 1 - (t->>'luminary_top')::numeric
     or not (coalesce((p_facts->>'teacher_endorsement')::boolean, false) or coalesce((p_facts->>'hire')::boolean, false)) then
    return 'radiant';
  end if;
  return 'luminary';
end;
$$;
revoke all on function private.tier_met(boolean, numeric, double precision, jsonb, jsonb) from public;

-- Rising is immediate; a tier drops only after 14 straight days failing it, to the highest
-- tier still met (exam periods don't pause this clock).
create function private.assign_percentiles_and_tiers(p_on date, p_f jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_drop integer := (p_f->'tiers'->>'drop_days')::integer;
  v_n integer;
begin
  update public.ranking_scores s
     set percentile = r.pr
    from (select user_id, percent_rank() over (order by total) as pr from public.ranking_scores where ranked) r
   where s.user_id = r.user_id and s.percentile is distinct from r.pr;
  update public.ranking_scores set percentile = null where not ranked and percentile is not null;
  with x as (
    select s.user_id, s.tier, s.below_since,
           private.tier_met(s.ranked, s.total, s.percentile, s.components->'facts', p_f) as met
      from public.ranking_scores s
  )
  update public.ranking_scores s
     set tier_met = x.met,
         tier = case when x.met is null then null
                     when x.tier is null or x.met >= x.tier then x.met
                     when x.below_since is not null and p_on - x.below_since >= v_drop then x.met
                     else x.tier end,
         below_since = case when x.met is null or x.tier is null or x.met >= x.tier then null
                            when x.below_since is null then p_on
                            when p_on - x.below_since >= v_drop then null
                            else x.below_since end
    from x
   where s.user_id = x.user_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.assign_percentiles_and_tiers(date, jsonb) from public;

create function private.take_ranking_snapshot(p_on date)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.ranking_snapshots (user_id, week, formula_version, components, total, ranked, tier, percentile)
  select s.user_id, p_on, s.formula_version, private.ranking_points(s.components), s.total, s.ranked, s.tier, s.percentile
    from public.ranking_scores s
  on conflict (user_id, week) do update
     set formula_version = excluded.formula_version, components = excluded.components, total = excluded.total,
         ranked = excluded.ranked, tier = excluded.tier, percentile = excluded.percentile;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.take_ranking_snapshot(date) from public;

-- ---------------------------------------------------------------------------
-- The nightly run
-- ---------------------------------------------------------------------------
create function private.ranking_start(p_as_of timestamptz default now())
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_on date := (p_as_of at time zone 'Asia/Karachi')::date;
  f record;
  v_id bigint;
begin
  select * into f from private.ranking_formula();
  if f.version is null then
    raise exception 'ranking.formula is not set' using errcode = '55000';
  end if;
  insert into public.ranking_runs (run_on, as_of, formula_version, formula)
  values (v_on, p_as_of, f.version, f.value)
  on conflict (run_on) do nothing
  returning id into v_id;
  if v_id is not null then
    update public.ranking_runs
       set job_run_id = public.job_run_start('ranking-nightly', jsonb_build_object('run_on', v_on, 'formula_version', f.version))
     where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function private.ranking_start(timestamptz) from public;

-- One committed step of the oldest unfinished run: returns the stage it moved to (null
-- when there's nothing to do).
create function private.ranking_step()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.ranking_runs;
  v_batch integer;
  v_user uuid;
  v_last uuid;
  v_n integer := 0;
  v_held integer := 0;
  v_stage text;
begin
  select * into r from public.ranking_runs where finished_at is null order by id limit 1 for update skip locked;
  if not found then
    return null;
  end if;
  v_stage := r.stage;
  begin
    if r.stage = 'rings' then
      perform private.detect_rings(r.formula);
      v_stage := 'students';
    elsif r.stage = 'students' then
      v_batch := coalesce((r.formula->>'batch_size')::integer, 500);
      for v_user in
        select p.user_id from public.profiles p
         where p.role = 'student' and p.onboarding_complete and (r.cursor is null or p.user_id > r.cursor)
         order by p.user_id
         limit v_batch
      loop
        if private.ranking_apply(r, v_user) then
          v_held := v_held + 1;
        end if;
        v_n := v_n + 1;
        v_last := v_user;
      end loop;
      if v_n < v_batch then
        v_stage := 'tiers';
      end if;
    elsif r.stage = 'tiers' then
      perform private.assign_percentiles_and_tiers(r.run_on, r.formula);
      v_stage := case when extract(isodow from r.run_on) = 7 then 'snapshot' else 'done' end;
    elsif r.stage = 'snapshot' then
      perform private.take_ranking_snapshot(r.run_on);
      v_stage := 'done';
    end if;
  exception when others then
    update public.ranking_runs
       set stage = 'failed', error = left(sqlerrm, 2000), finished_at = now(), steps = steps + 1
     where id = r.id;
    if r.job_run_id is not null then
      perform public.job_run_finish(r.job_run_id, 'failed', r.students, sqlerrm);
    end if;
    return 'failed';
  end;
  update public.ranking_runs
     set stage = v_stage,
         cursor = case when v_stage = 'students' then v_last end,
         students = students + v_n, held = held + v_held, steps = steps + 1,
         finished_at = case when v_stage = 'done' then now() end
   where id = r.id;
  if v_stage = 'done' and r.job_run_id is not null then
    perform public.job_run_finish(r.job_run_id, 'succeeded', r.students + v_n);
  end if;
  return v_stage;
end;
$$;
revoke all on function private.ranking_step() from public;

-- A whole run in one transaction: for pgTAP and for a manual rerun from the SQL editor.
create function private.ranking_run_all(p_as_of timestamptz default now())
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stage text;
  i integer := 0;
begin
  perform private.ranking_start(p_as_of);
  loop
    v_stage := private.ranking_step();
    i := i + 1;
    exit when v_stage is null or v_stage in ('done', 'failed') or i > 100000;
  end loop;
  return v_stage;
end;
$$;
revoke all on function private.ranking_run_all(timestamptz) from public;

select cron.schedule('ranking-nightly', '7 22 * * *', $$select private.ranking_start()$$); -- 03:07 PKT
select cron.schedule('ranking-step', '* * * * *', $$select private.ranking_step()$$);

-- ---------------------------------------------------------------------------
-- Penalties: Remove, Clear, Unlist and Warn in /ops take a severity (decisions.md 2026-09-30)
-- ---------------------------------------------------------------------------
drop function public.resolve_case(uuid, text, text);
drop function private.resolve_case(uuid, text, text);
create function private.resolve_case(p_case uuid, p_action text, p_reason text, p_severity text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_moderator();
  c public.report_cases;
  v_status public.report_case_status;
  v_before jsonb;
  v_after jsonb := '{}'::jsonb;
  v_notice text;
  v_severity text := case when p_action = 'dismiss' then null else p_severity end;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '23514';
  end if;
  select * into c from public.report_cases where id = p_case for update;
  if c.id is null or c.status <> 'open' then
    raise exception 'this case is already closed' using errcode = '55000';
  end if;
  if c.claimed_by is distinct from v_me then
    raise exception 'claim the case first' using errcode = '55000';
  end if;
  if p_action <> 'dismiss' and (v_severity is null or v_severity not in ('low', 'medium', 'high')) then
    raise exception 'choose a severity: low, medium or high' using errcode = '22023';
  end if;
  v_before := jsonb_build_object('status', c.status, 'target_type', c.target_type, 'target_id', c.target_id);

  if p_action = 'dismiss' then
    v_status := 'dismissed';
    if c.target_type = 'post' then
      update public.post_stats set reports = 0, updated_at = now() where post_id = c.target_id;
      update public.posts p set stage = coalesce(private.compute_stage(p.id), 'seed'), stage_changed_at = now()
       where p.id = c.target_id and p.stage = 'held';
    end if;
  elsif p_action = 'remove' then
    v_status := 'removed';
    v_notice := 'removed';
    if c.target_type = 'post' then
      update public.posts set removed_at = now(), removed_by = v_me where id = c.target_id and removed_at is null;
    elsif c.target_type = 'comment' then
      update public.post_comments set deleted_at = coalesce(deleted_at, now()), body = '', pinned = false, removed_by = v_me
       where id = c.target_id;
    elsif c.target_type = 'message' then
      update public.chat_messages
         set deleted_at = coalesce(deleted_at, now()), body = '', media_path = null, media_width = null, media_height = null,
             removed_by = v_me
       where id = c.target_id;
      delete from public.chat_pins where message_id = c.target_id;
    else
      raise exception 'use "clear bio and photo" for a profile or "unlist" for a venture' using errcode = '22023';
    end if;
    v_after := jsonb_build_object('removed', true);
  elsif p_action = 'clear_profile' then
    if c.target_type <> 'profile' then
      raise exception 'only a profile''s bio and photo can be cleared' using errcode = '22023';
    end if;
    v_status := 'removed';
    v_notice := 'cleared';
    select v_before || jsonb_build_object('bio', p.bio, 'avatar_path', p.avatar_path) into v_before
      from public.profiles p where p.user_id = c.target_id;
    update public.profiles set bio = null, avatar_path = null where user_id = c.target_id;
    v_after := jsonb_build_object('bio', null, 'avatar_path', null);
  elsif p_action = 'unlist' then
    if c.target_type <> 'venture' then
      raise exception 'only a venture can be unlisted' using errcode = '22023';
    end if;
    v_status := 'removed';
    v_notice := 'unlisted';
    select v_before || jsonb_build_object('visibility', v.visibility) into v_before from public.ventures v where v.id = c.target_id;
    update public.ventures set visibility = 'unlisted' where id = c.target_id;
    v_after := jsonb_build_object('visibility', 'unlisted');
  elsif p_action = 'warn' then
    v_status := 'warned';
    if c.owner_id is null then
      raise exception 'there''s no one to warn' using errcode = '22023';
    end if;
    insert into public.sanctions (user_id, kind, reason, staff_id, case_id) values (c.owner_id, 'warn', btrim(p_reason), v_me, c.id);
    perform private.notify(c.owner_id, null, 'moderation_warning', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  else
    raise exception 'choose dismiss, remove, clear, unlist or warn' using errcode = '22023';
  end if;

  if v_notice is not null then
    perform private.notify(c.owner_id, null, 'content_removed', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'action', v_notice,
                                              'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  end if;

  -- An upheld report costs the owner points for 12 months (PRD 5.13 penalties).
  if v_severity is not null and c.owner_id is not null then
    insert into public.ranking_adjustments (user_id, kind, severity, reason, case_id, staff_id)
    values (c.owner_id, 'penalty', v_severity, btrim(p_reason), c.id, v_me);
    v_after := v_after || jsonb_build_object('severity', v_severity);
  end if;

  update public.report_cases
     set status = v_status, resolved_by = v_me, resolved_at = now(), resolution_reason = btrim(p_reason)
   where id = p_case;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'report.' || p_action, 'report_case', p_case::text, btrim(p_reason), v_before,
          v_after || jsonb_build_object('status', v_status));
end;
$$;
revoke all on function private.resolve_case(uuid, text, text, text) from public;
grant execute on function private.resolve_case(uuid, text, text, text) to authenticated;
create function public.resolve_case(p_case uuid, p_action text, p_reason text, p_severity text default null)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.resolve_case(p_case, p_action, p_reason, p_severity) $$;
revoke all on function public.resolve_case(uuid, text, text, text) from public, anon;
grant execute on function public.resolve_case(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- /ops: ranking flags (trust reviewers, two-factor), every step audited
-- ---------------------------------------------------------------------------
create function private.ranking_flag_queue(p_status text default 'open')
returns table (id uuid, kind public.anti_gaming_kind, member_names text[], gain numeric, from_total numeric, to_total numeric,
               endorsements integer, status public.review_flag_status, claimed_by_name text, claimed_by_me boolean,
               created_at timestamptz, reviewed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
begin
  return query
  select f.id, f.kind,
         array(select p.full_name from unnest(f.members) as m(uid) join public.profiles p on p.user_id = m.uid order by p.full_name),
         (f.detail->>'gain')::numeric, (f.detail->>'from_total')::numeric, (f.detail->>'to_total')::numeric,
         cardinality(f.endorsement_ids), f.status, cp.full_name, f.claimed_by = v_me, f.created_at, f.reviewed_at
    from public.anti_gaming_flags f
    left join public.profiles cp on cp.user_id = f.claimed_by
   where (p_status = 'open' and f.status = 'open')
      or (p_status = 'reviewed' and f.status <> 'open' and f.reviewed_at > now() - interval '30 days')
   order by case when p_status = 'open' then f.created_at end asc, f.reviewed_at desc
   limit 200;
end;
$$;

create function private.ranking_flag_case(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  f public.anti_gaming_flags;
begin
  select * into f from public.anti_gaming_flags where id = p_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', f.id, 'kind', f.kind, 'status', f.status, 'detail', f.detail, 'reason', f.reason,
    'created_at', f.created_at, 'reviewed_at', f.reviewed_at,
    'claimed_by_name', (select p.full_name from public.profiles p where p.user_id = f.claimed_by),
    'claimed_by_me', f.claimed_by = v_me,
    'is_member', v_me = any (f.members),
    'reviewer_name', (select p.full_name from public.profiles p where p.user_id = f.reviewed_by),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', p.full_name, 'username', p.username,
                                          'university', u.name, 'total', s.total, 'tier', s.tier)
                       order by p.full_name)
        from unnest(f.members) as m(uid)
        join public.profiles p on p.user_id = m.uid
        left join public.universities u on u.id = p.university_id
        left join public.ranking_scores s on s.user_id = p.user_id), '[]'::jsonb),
    'endorsements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'endorser', er.full_name, 'endorsee', ee.full_name, 'skill', k.name, 'venture', v.title,
               'venture_status', v.status, 'deliverables', (select count(*) from public.venture_deliverables d where d.venture_id = v.id),
               'hidden', e.hidden, 'created_at', e.created_at)
               order by e.created_at, e.id)
        from public.endorsements e
        join public.profiles er on er.user_id = e.endorser_id
        join public.profiles ee on ee.user_id = e.endorsee_id
        join public.skills k on k.id = e.skill_id
        join public.ventures v on v.id = e.venture_id
       where e.id = any (f.endorsement_ids)), '[]'::jsonb));
end;
$$;

create function private.claim_ranking_flag(p_id uuid, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  f public.anti_gaming_flags;
begin
  select * into f from public.anti_gaming_flags where id = p_id for update;
  if f.id is null or f.status <> 'open' then
    raise exception 'this flag isn''t waiting for review' using errcode = '55000';
  end if;
  if v_me = any (f.members) then
    raise exception 'you can''t review a flag about yourself' using errcode = '42501';
  end if;
  if p_claim then
    if f.claimed_by is not null and f.claimed_by <> v_me then
      raise exception 'someone else is reviewing this flag' using errcode = '55000';
    end if;
    update public.anti_gaming_flags set claimed_by = v_me, claimed_at = now(), updated_at = now() where id = p_id;
  else
    if f.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this flag' using errcode = '55000';
    end if;
    update public.anti_gaming_flags set claimed_by = null, claimed_at = null, updated_at = now() where id = p_id;
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_claim then 'ranking_flag.claim' else 'ranking_flag.release' end, 'anti_gaming_flag', p_id::text,
          case when p_claim then 'claimed to review' else 'released' end,
          jsonb_build_object('claimed_by', f.claimed_by), jsonb_build_object('claimed_by', case when p_claim then v_me end));
end;
$$;

-- Clear (a ring's endorsements count again; a held gain counts from the next run) or uphold
-- (a ring stays at 0; a held gain becomes a negative adjustment of the same size).
create function private.review_ranking_flag(p_id uuid, p_uphold boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  f public.anti_gaming_flags;
  v_status public.review_flag_status := case when coalesce(p_uphold, false) then 'upheld' else 'cleared' end;
  v_gain numeric;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select * into f from public.anti_gaming_flags where id = p_id for update;
  if f.id is null or f.status <> 'open' then
    raise exception 'this flag isn''t waiting for review' using errcode = '55000';
  end if;
  if f.claimed_by is distinct from v_me then
    raise exception 'claim the flag before deciding' using errcode = '55000';
  end if;
  update public.anti_gaming_flags
     set status = v_status, reviewed_by = v_me, reviewed_at = now(), reason = left(btrim(p_reason), 2000),
         claimed_by = null, claimed_at = null, updated_at = now()
   where id = p_id;
  v_gain := (f.detail->>'gain')::numeric;
  if f.kind = 'rapid_gain' and v_status = 'upheld' and v_gain > 0 then
    insert into public.ranking_adjustments (user_id, kind, points, reason, flag_id, staff_id)
    values (f.user_id, 'rapid_gain', -v_gain, left(btrim(p_reason), 2000), f.id, v_me);
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'ranking_flag.' || case when v_status = 'upheld' then 'uphold' else 'clear' end, 'anti_gaming_flag', p_id::text,
          btrim(p_reason), jsonb_build_object('status', f.status, 'kind', f.kind),
          jsonb_build_object('status', v_status, 'adjustment', case when f.kind = 'rapid_gain' and v_status = 'upheld' then -v_gain end));
end;
$$;

-- ---------------------------------------------------------------------------
-- /ops: exam periods (accounts staff, two-factor), audited
-- ---------------------------------------------------------------------------
create function private.require_accounts()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('accounts') then
    raise exception 'accounts staff only, with two-factor on' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function private.require_accounts() from public;

create function private.exam_period_list()
returns table (id uuid, university_id uuid, university_name text, starts_on date, ends_on date, reason text,
               created_by_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  return query
  select e.id, e.university_id, u.name, e.starts_on, e.ends_on, e.reason, p.full_name, e.created_at
    from public.exam_periods e
    join public.universities u on u.id = e.university_id
    left join public.profiles p on p.user_id = e.created_by
   order by e.starts_on desc, u.name
   limit 300;
end;
$$;

create function private.add_exam_period(p_university uuid, p_starts date, p_ends date, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_id uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then
    raise exception 'the end date must be on or after the start date' using errcode = '22023';
  end if;
  if p_ends - p_starts >= 45 then
    raise exception 'an exam period can be at most 45 days' using errcode = '22023';
  end if;
  if not exists (select 1 from public.universities u where u.id = p_university) then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.exam_periods e
              where e.university_id = p_university and e.starts_on <= p_ends and e.ends_on >= p_starts) then
    raise exception 'this overlaps an exam period already entered for that university' using errcode = '23514';
  end if;
  insert into public.exam_periods (university_id, starts_on, ends_on, reason, created_by)
  values (p_university, p_starts, p_ends, btrim(p_reason), v_me)
  returning id into v_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, after)
  values (v_me, 'exam_period.add', 'exam_period', v_id::text, btrim(p_reason),
          jsonb_build_object('university_id', p_university, 'starts_on', p_starts, 'ends_on', p_ends));
  return v_id;
end;
$$;

create function private.remove_exam_period(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  e public.exam_periods;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  delete from public.exam_periods where id = p_id returning * into e;
  if e.id is null then
    raise exception 'exam period not found' using errcode = 'P0002';
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before)
  values (v_me, 'exam_period.remove', 'exam_period', p_id::text, btrim(p_reason),
          jsonb_build_object('university_id', e.university_id, 'starts_on', e.starts_on, 'ends_on', e.ends_on, 'reason', e.reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (security invoker) and grants
-- ---------------------------------------------------------------------------
revoke all on function
  private.ranking_flag_queue(text), private.ranking_flag_case(uuid), private.claim_ranking_flag(uuid, boolean),
  private.review_ranking_flag(uuid, boolean, text), private.exam_period_list(),
  private.add_exam_period(uuid, date, date, text), private.remove_exam_period(uuid, text)
  from public;
grant execute on function
  private.ranking_flag_queue(text), private.ranking_flag_case(uuid), private.claim_ranking_flag(uuid, boolean),
  private.review_ranking_flag(uuid, boolean, text), private.exam_period_list(),
  private.add_exam_period(uuid, date, date, text), private.remove_exam_period(uuid, text)
  to authenticated;

create function public.ranking_flag_queue(p_status text default 'open')
returns table (id uuid, kind public.anti_gaming_kind, member_names text[], gain numeric, from_total numeric, to_total numeric,
               endorsements integer, status public.review_flag_status, claimed_by_name text, claimed_by_me boolean,
               created_at timestamptz, reviewed_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.ranking_flag_queue(p_status) $$;
create function public.ranking_flag_case(p_id uuid) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.ranking_flag_case(p_id) $$;
create function public.claim_ranking_flag(p_id uuid, p_claim boolean) returns void
  language sql security invoker set search_path = '' as $$ select private.claim_ranking_flag(p_id, p_claim) $$;
create function public.review_ranking_flag(p_id uuid, p_uphold boolean, p_reason text) returns void
  language sql security invoker set search_path = '' as $$ select private.review_ranking_flag(p_id, p_uphold, p_reason) $$;
create function public.exam_period_list()
returns table (id uuid, university_id uuid, university_name text, starts_on date, ends_on date, reason text,
               created_by_name text, created_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.exam_period_list() $$;
create function public.add_exam_period(p_university uuid, p_starts date, p_ends date, p_reason text) returns uuid
  language sql security invoker set search_path = '' as $$ select private.add_exam_period(p_university, p_starts, p_ends, p_reason) $$;
create function public.remove_exam_period(p_id uuid, p_reason text) returns void
  language sql security invoker set search_path = '' as $$ select private.remove_exam_period(p_id, p_reason) $$;

revoke all on function
  public.ranking_flag_queue(text), public.ranking_flag_case(uuid), public.claim_ranking_flag(uuid, boolean),
  public.review_ranking_flag(uuid, boolean, text), public.exam_period_list(),
  public.add_exam_period(uuid, date, date, text), public.remove_exam_period(uuid, text)
  from public, anon;
grant execute on function
  public.ranking_flag_queue(text), public.ranking_flag_case(uuid), public.claim_ranking_flag(uuid, boolean),
  public.review_ranking_flag(uuid, boolean, text), public.exam_period_list(),
  public.add_exam_period(uuid, date, date, text), public.remove_exam_period(uuid, text)
  to authenticated;
