-- The ranked feed (PRD 5.28): hand-calculated scores, stage transitions, seed audience,
-- exploration slots, paging with no duplicates (also under concurrent inserts and after
-- the session expires), the 7-day window, hidden/muted/blocked/held posts left out,
-- diversity, and the pinned announcement above the list.
-- A, B, C, D study at NUTECH; E at FAST.
begin;
select plan(28);

insert into auth.users (id, email) values
  ('22000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('22000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('22000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('22000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk'),
  ('22000000-0000-0000-0000-00000000000e', 'e@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'fd_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '22000000-%';

create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('22000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_id), 'role', 'authenticated')::text, true);
end;
$$;
-- Posts inserted directly (the feed is under test, not create_post's cooldown).
create function pg_temp.post(p_author text, p_body text, p_audience text default 'university', p_stage text default 'full',
                             p_age interval default '0 minutes', p_type text default 'general') returns uuid language sql as $$
  insert into public.posts (author_id, university_id, audience, type, body, stage, created_at)
  select pg_temp.uid(p_author), p.university_id, p_audience::public.post_audience, p_type::public.post_type, p_body,
         p_stage::public.post_stage, now() - p_age
    from public.profiles p where p.user_id = pg_temp.uid(p_author)
  returning id
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
-- Hand-calculated scores
-- ---------------------------------------------------------------------------
-- 1. A fresh post, no answers, no comments, a stranger reading, age 0:
--    Q = (0 + 10 × 0.6) / (0 + 10) = 0.6; score = (0.15 + 0.6) × 1 × 1 × 1 / 2^1.5 = 0.265165
select set_config('test.s1', pg_temp.post('a', 'Plain post')::text, false);
select is(round(private.feed_score(pg_temp.v('s1'), pg_temp.uid('b')), 6), 0.265165, 'score of a fresh post for a stranger');

-- 2. Weighted Informative/Interesting 4 of 5 positive, Credible 1 of 2 negative, two
--    commenters (10+ chars), read by a friend who has already seen it:
--    Q = (4 + 6) / (5 + 10) × (1 − min(0.8, 2 × 0.5)) = 0.666667 × 0.2 = 0.133333
--    E = 0.5 × ln(1 + 2) = 0.549306; R = 1.4 (friend); D = 0.3 (seen)
--    score = (0.15 + 0.133333) × 1.549306 × 1.4 × 0.3 / 2^1.5 = 0.065184
select set_config('test.s2', pg_temp.post('a', 'Rich post')::text, false);
insert into public.post_survey_counts (post_id, dimension, assigned, ticks, crosses, weighted_ticks, weighted_crosses) values
  (pg_temp.v('s2'), 'informative', 3, 2, 1, 2, 1),
  (pg_temp.v('s2'), 'interesting', 2, 2, 0, 2, 0),
  (pg_temp.v('s2'), 'credible', 2, 1, 1, 1, 1);
insert into public.post_comments (post_id, author_id, body) values
  (pg_temp.v('s2'), pg_temp.uid('c'), 'This is really helpful'),
  (pg_temp.v('s2'), pg_temp.uid('d'), 'Great write-up, thanks'),
  (pg_temp.v('s2'), pg_temp.uid('d'), 'short');
insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('a'), pg_temp.uid('b'));
insert into public.post_views (post_id, user_id) values (pg_temp.v('s2'), pg_temp.uid('b'));
select is(round(private.feed_score(pg_temp.v('s2'), pg_temp.uid('b')), 6), 0.065184, 'score with survey, comments, friendship and seen');
select is(private.feed_score(pg_temp.v('s2'), pg_temp.uid('c')) > private.feed_score(pg_temp.v('s2'), pg_temp.uid('b')), true,
  'an unseen reader scores it higher than one who has seen it');
delete from public.friendships;
delete from public.post_views;

-- Older posts decay: the same post 10 hours old scores (2 / 12)^1.5 of a new one.
select set_config('test.s3', pg_temp.post('a', 'Old post', 'university', 'full', '10 hours')::text, false);
select is(round(private.feed_score(pg_temp.v('s3'), pg_temp.uid('b')) / private.feed_score(pg_temp.v('s1'), pg_temp.uid('b')), 4),
  round(power(2.0 / 12, 1.5), 4), 'time decay with gravity 1.5');

-- ---------------------------------------------------------------------------
-- Stages
-- ---------------------------------------------------------------------------
select set_config('test.st_full', pg_temp.post('b', 'Liked', 'university', 'seed')::text, false);
update public.post_stats set answers = 5, positives = 3 where post_id = pg_temp.v('st_full');
select set_config('test.st_limited', pg_temp.post('b', 'Quiet', 'university', 'seed', '3 hours')::text, false);
select set_config('test.st_boost', pg_temp.post('c', 'Big hit', 'global', 'full')::text, false);
update public.post_stats set answers = 10, positives = 6 where post_id = pg_temp.v('st_boost');
select set_config('test.st_demote', pg_temp.post('c', 'Dubious claim', 'university', 'full')::text, false);
insert into public.post_survey_counts (post_id, dimension, assigned, ticks, crosses) values (pg_temp.v('st_demote'), 'credible', 10, 6, 4);
select set_config('test.st_seed', pg_temp.post('d', 'Brand new', 'university', 'seed')::text, false);
select ok(private.feed_stage_job() >= 4, 'the stage job moves posts');
select results_eq($$ select stage::text from public.posts where id = pg_temp.v('st_full') $$, $$ values ('full'::text) $$,
  '5 answers with 60% positive: Seed → Full');
select results_eq($$ select stage::text from public.posts where id = pg_temp.v('st_limited') $$, $$ values ('limited'::text) $$,
  'over 2 hours with no trigger: Seed → Limited');
select results_eq($$ select stage::text from public.posts where id = pg_temp.v('st_boost') $$, $$ values ('global_boost'::text) $$,
  'a Global post with 10 answers at 60%: Global boost');
select results_eq($$ select stage::text from public.posts where id = pg_temp.v('st_demote') $$, $$ values ('demoted'::text) $$,
  '10 Credible answers with 40% negative: Demoted');
select results_eq($$ select stage::text from public.posts where id = pg_temp.v('st_seed') $$, $$ values ('seed'::text) $$,
  'a new post with no signal stays in Seed');
update public.post_stats set reports = 3 where post_id = pg_temp.v('st_full');
select results_eq($$ select stage::text from public.posts where id = pg_temp.v('st_full') $$, $$ values ('held'::text) $$,
  '3 reports hold a post at once');

-- ---------------------------------------------------------------------------
-- Who sees what in feed_page
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('e');
select is_empty($$ select 1 from public.feed_page('university') where post_id in (pg_temp.v('s1'), pg_temp.v('st_seed')) $$,
  'another university''s posts never enter the University Feed');
select pg_temp.as_user('b');
select is_empty($$ select 1 from public.feed_page('university') where post_id = pg_temp.v('st_full') $$, 'held posts are left out');
select is_empty($$ select 1 from public.feed_page('university') where post_id = pg_temp.v('st_seed') and rank % 5 <> 0 $$,
  'a Seed post doesn''t reach someone outside its seed audience (except an exploration slot)');
select pg_temp.as_user('d');
select isnt_empty($$ select 1 from public.feed_page('university') where post_id = pg_temp.v('st_seed') $$, 'but its author sees it');
reset role;
insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('b'), pg_temp.uid('d'));
set local role authenticated;
select pg_temp.as_user('b');
select isnt_empty($$ select 1 from public.feed_page('university') where post_id = pg_temp.v('st_seed') $$,
  'and so does the author''s friend (seed audience)');
reset role;
delete from public.friendships;
update public.posts set created_at = now() - interval '8 days' where id = pg_temp.v('s3');
set local role authenticated;
select is_empty($$ select 1 from public.feed_page('university') where post_id = pg_temp.v('s3') $$,
  'a post older than 7 days never appears in the ranked feed');
select public.hide_post(pg_temp.v('s1'), true);
select is_empty($$ select 1 from public.feed_page('university') where post_id = pg_temp.v('s1') $$, 'hidden posts are left out');
select public.mute_user('fd_c', true);
select is_empty($$ select 1 from public.feed_page('university') p join public.posts x on x.id = p.post_id where x.author_id = pg_temp.uid('c') $$,
  'muted authors are left out');
reset role;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('b'));
set local role authenticated;
select is_empty($$ select 1 from public.feed_page('university') p join public.posts x on x.id = p.post_id where x.author_id = pg_temp.uid('a') $$,
  'blocked authors are left out (either direction)');
reset role;
delete from public.blocks;
delete from public.user_mutes;
delete from public.post_hides;
delete from public.feed_sessions;

-- ---------------------------------------------------------------------------
-- Paging: no duplicates, no gaps, even with new posts arriving and the session expiring
-- ---------------------------------------------------------------------------
delete from public.posts;
select pg_temp.post(x, 'Post ' || x || ' ' || n, 'university', 'full', make_interval(mins => n * 7))
  from unnest(array['a', 'c', 'd']) as x, generate_series(1, 8) as n;
set local role authenticated;
select pg_temp.as_user('b');
create temporary table seen (post_id uuid, page integer, next_cursor text) on commit drop;
grant all on seen to authenticated;
insert into seen select post_id, 1, next_cursor from public.feed_page('university', 'all', null, 10);
-- A second tab opening the feed must not disturb this one's paging.
select count(*) from public.feed_page('university', 'all', null, 10);
-- New posts arrive mid-scroll; they must not shift the pages.
reset role;
select pg_temp.post('d', 'Arrived during scroll ' || n, 'university', 'full') from generate_series(1, 3) as n;
set local role authenticated;
insert into seen select post_id, 2, next_cursor from public.feed_page('university', 'all', (select max(next_cursor) from seen where page = 1), 10);
-- The session expires before page 3: re-ranked without what was already served.
reset role;
update public.feed_sessions set created_at = now() - interval '11 minutes';
set local role authenticated;
insert into seen select post_id, 3, next_cursor from public.feed_page('university', 'all', (select max(next_cursor) from seen where page = 2), 10);
select is((select count(*)::integer from seen), (select count(distinct post_id)::integer from seen), 'no post appears twice across pages');
select is((select count(*)::integer from seen where page in (1, 2)), 20, 'pages 1 and 2 are full');
select is_empty($$ select 1 from seen s join public.posts p on p.id = s.post_id where s.page in (1, 2) and p.body like 'Arrived during scroll%' $$,
  'posts that arrive mid-scroll don''t shift the session');
select ok((select count(*) from seen where page = 3) >= 4, 'after expiry the rest still come, including the new posts');

-- Diversity: no author twice in a row while others are available.
select is((select count(*)::integer from (
            select p.author_id, lag(p.author_id) over (order by f.rank) as prev
              from public.feed_page('university', 'all', null, 20) f join public.posts p on p.id = f.post_id) x
           where author_id = prev), 0, 'no author twice in a row');

-- Exploration: slot 5 goes to a fresh Seed post from outside the seed audience.
reset role;
select set_config('test.explore', pg_temp.post('a', 'Fresh seed', 'university', 'seed')::text, false);
set local role authenticated;
select results_eq($$ select post_id from public.feed_page('university', 'all', null, 20) where rank = 5 $$,
  $$ values (pg_temp.v('explore')) $$, 'every 5th slot tests a new Seed post');

-- The pinned announcement sits above the list and isn't ranked.
reset role;
insert into public.posts (author_id, university_id, audience, type, body, stage, pinned_until)
values (pg_temp.uid('a'), null, 'global', 'announcement', 'Welcome week', 'full', now() + interval '3 days');
select set_config('test.pin', (select id::text from public.posts where type = 'announcement'), false);
set local role authenticated;
select results_eq($$ select public.pinned_announcement() $$, $$ values (pg_temp.v('pin')) $$, 'the pinned announcement is returned on its own');
select is_empty($$ select 1 from public.feed_page('global', 'all', null, 20) where post_id = pg_temp.v('pin') $$,
  'and never inside the ranked list');

select * from finish();
rollback;
