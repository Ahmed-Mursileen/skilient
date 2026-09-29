-- Tiers on 1,000 synthetic students (PRD 5.13 "Done when"): points plus each tier's
-- milestone, every tier below included; Radiant and Luminary by percentile across every
-- ranked student on the platform; a tier drops only after 14 straight days failing it.
begin;
select plan(24);

-- S1-S1000 score 2.5 x i (2.5 ... 2,500), all distinct; everyone meets every milestone except
-- where noted. 50 more students are not ranked yet.
insert into auth.users (id, email)
select ('93300000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'tier' || i || '@nutech.edu.pk'
  from generate_series(1, 1050) i;

create function pg_temp.s(i integer) returns uuid language sql immutable as $$
  select ('93300000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
$$;
create function pg_temp.f() returns jsonb language sql stable as $$ select value from private.ranking_formula() $$;
create function pg_temp.tier(i integer) returns text language sql stable as $$
  select tier::text from public.ranking_scores where user_id = pg_temp.s(i)
$$;
create function pg_temp.count_tier(p text) returns integer language sql stable as $$
  select count(*)::integer from public.ranking_scores
   where user_id::text like '93300000-%' and tier is not distinct from p::public.ranking_tier
$$;

insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked,
                                   computed_at, published_at)
select pg_temp.s(i), 1,
       jsonb_build_object('facts', jsonb_build_object(
         'peer_verified_entries', 1, 'active_ventures', 2, 'counting_endorsements', 3,
         -- S300-S309 have no completed venture; S950-S954 have no skill at L3+: both stop at Flare.
         'completed_ventures', case when i between 300 and 309 then 0 else 1 end,
         'max_level', case when i between 950 and 954 then 2 else 3 end,
         -- Only S990 and up have a teacher endorsement (Luminary needs one or a hire).
         'teacher_endorsement', i >= 990, 'hire', false)),
       2.5 * i, 0, 0, 2.5 * i, i <= 1000, now(), now()
  from generate_series(1, 1050) i;

select lives_ok($$ select private.assign_percentiles_and_tiers(date '2026-12-01', pg_temp.f()) $$, 'tiers assign in one pass');

select is(pg_temp.count_tier(null), 50, 'students without a peer-verified contribution have no tier');
select is(pg_temp.count_tier('raw'), 39, 'Raw: under 100 points (S1-S39)');
select is(pg_temp.count_tier('spark'), 60, 'Spark: 100-249 points (S40-S99)');
select is(pg_temp.count_tier('flare'), 115, 'Flare: 250-499 points (S100-S199), plus 15 who miss a Shine milestone');
select is(pg_temp.count_tier('shine'), 691, 'Shine: 500+ points outside the top 10% (S200-S900 less S300-S309)');
select is(pg_temp.count_tier('radiant'), 84, 'Radiant: the top 10% (S901-S1000) less S950-S954 and the Luminaries');
select is(pg_temp.count_tier('luminary'), 11, 'Luminary: top 2% with a teacher endorsement (S990-S1000)');

select is(pg_temp.tier(900), 'shine', 'S900 is just outside the top 10%: 899/999 = 0.8999');
select is(pg_temp.tier(901), 'radiant', 'S901 is just inside it: 900/999 = 0.9009');
select is(pg_temp.tier(980), 'radiant', 'S980 is just outside the top 2%: 979/999 = 0.97998');
select is(pg_temp.tier(989), 'radiant', 'S989 is in the top 2% but has no teacher endorsement');
select is(pg_temp.tier(952), 'flare', 'a top-10% student with no L3 skill stops at Flare (every lower milestone is needed)');
select is((select percentile from public.ranking_scores where user_id = pg_temp.s(1000)), 1::double precision, 'the top student''s percentile is 1');
select is((select count(*)::integer from public.ranking_scores where user_id::text like '93300000-%' and not ranked and percentile is not null), 0,
  'unranked students get no percentile and don''t count in anyone else''s');

-- Ties share a percentile.
update public.ranking_scores set total = 2500 where user_id = pg_temp.s(999);
select private.assign_percentiles_and_tiers(date '2026-12-01', pg_temp.f());
select is((select percentile from public.ranking_scores where user_id = pg_temp.s(999)),
          (select percentile from public.ranking_scores where user_id = pg_temp.s(1000)), 'tied totals share a percentile');

-- ---------------------------------------------------------------------------
-- Hysteresis: S250 (Shine at 625 points) falls to 300 points (Flare).
-- ---------------------------------------------------------------------------
update public.ranking_scores set total = 300 where user_id = pg_temp.s(250);
select private.assign_percentiles_and_tiers(date '2026-12-02', pg_temp.f());
select is(pg_temp.tier(250), 'shine', 'day 1 below Shine: still Shine');
select is((select row(tier_met, below_since)::text from public.ranking_scores where user_id = pg_temp.s(250)), '(flare,2026-12-02)',
  'the clock starts on the first day below');
select private.assign_percentiles_and_tiers(date '2026-12-15', pg_temp.f());
select is(pg_temp.tier(250), 'shine', 'day 14 below: still Shine');
select private.assign_percentiles_and_tiers(date '2026-12-16', pg_temp.f());
select is(pg_temp.tier(250), 'flare', 'after 14 straight days below, it drops to the highest tier still met');

-- Rising is immediate; a recovery inside the 14 days resets the clock.
update public.ranking_scores set total = 625 where user_id = pg_temp.s(250);
select private.assign_percentiles_and_tiers(date '2026-12-17', pg_temp.f());
select is(pg_temp.tier(250), 'shine', 'rising is immediate');
update public.ranking_scores set total = 120 where user_id = pg_temp.s(250);
select private.assign_percentiles_and_tiers(date '2026-12-18', pg_temp.f());
update public.ranking_scores set total = 625 where user_id = pg_temp.s(250);
select private.assign_percentiles_and_tiers(date '2026-12-25', pg_temp.f());
select is((select below_since from public.ranking_scores where user_id = pg_temp.s(250)), null::date, 'meeting the tier again clears the clock');
update public.ranking_scores set total = 120 where user_id = pg_temp.s(250);
select private.assign_percentiles_and_tiers(date '2026-12-26', pg_temp.f());
select private.assign_percentiles_and_tiers(date '2027-01-09', pg_temp.f());
select is(pg_temp.tier(250), 'spark', 'a drop goes straight to the highest tier still met (Shine to Spark)');

-- Losing the last peer-verified contribution: no tier at once.
update public.ranking_scores set ranked = false where user_id = pg_temp.s(500);
select private.assign_percentiles_and_tiers(date '2027-01-10', pg_temp.f());
select is(pg_temp.tier(500), null, 'a student who is no longer ranked has no tier');

select * from finish();
rollback;
