-- Micro-survey (PRD 5.28): a reader's question never changes; one answer per reader per
-- post (changeable for 10 minutes, then final); no answer before a qualified view or
-- under 0.8 s; not on your own posts, announcements or polls; balanced dimensions; the
-- public line only from 3 ticks; anti-gaming weights; insights refused to free authors.
-- A posts; B..G read (all NUTECH).
begin;
select plan(38);

insert into auth.users (id, email, created_at)
select ('21000000-0000-0000-0000-00000000000' || x)::uuid, x || '@nutech.edu.pk', now() - interval '30 days'
  from unnest(array['a','b','c','d','e','f','9']) as x;
update public.profiles set onboarding_complete = true, username = 'sv_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '21000000-%';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '21000000-0000-0000-0000-00000000000' || p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('21000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.clear_rl() returns void language sql security definer as $$ delete from private.rate_limit_events $$;
create function pg_temp.weight(p_user text) returns numeric language sql security definer as $$
  select weight from public.micro_survey_responses where post_id = current_setting('test.p')::uuid and user_id = pg_temp.uid(p_user)
$$;
create function pg_temp.stats(p_col text) returns integer language plpgsql security definer as $$
declare v integer;
begin
  execute format('select %I from public.post_stats where post_id = $1', p_col) into v using current_setting('test.p')::uuid;
  return v;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

select is((select count(*)::integer from public.micro_survey_dimensions), 12, 'twelve dimensions');
select ok((select count(*) from public.micro_survey_questions where active) >= 25, 'about 25 questions at launch');
select is(private.config('survey.shares')->>'informative', '0.25', 'target shares come from platform_config');

set local role authenticated;
select pg_temp.as_user('a');
select set_config('test.p', public.create_post('{"type":"general","audience":"university","body":"How we built the robot arm"}')::text, false);
select pg_temp.clear_rl();
select set_config('test.poll', public.create_post('{"type":"poll","audience":"university","body":"Which lab?","poll":{"options":["1","2"],"days":1}}')::text, false);

-- Direct writes refused; counters unreadable
select throws_ok($$ insert into public.micro_survey_responses (post_id, user_id, question_id, dimension, answer, latency_ms, weight, locked_at)
                    values (pg_temp.v('p'), pg_temp.uid('a'), 1, 'informative', true, 5000, 1, now()) $$, '42501', null, 'answers are not inserted directly');
select throws_ok($$ insert into public.micro_survey_assignments (post_id, user_id, question_id, dimension) values (pg_temp.v('p'), pg_temp.uid('a'), 1, 'informative') $$,
  '42501', null, 'assignments are not inserted directly');
select throws_ok($$ select * from public.post_stats $$, '42501', null, 'post counters are not readable');
select throws_ok($$ select * from public.post_survey_counts $$, '42501', null, 'survey counts are not readable');
select throws_ok($$ insert into public.platform_config (key, version, value, reason) values ('x.y', 1, '1', 'nope') $$, '42501', null,
  'config is not writable over the API');

-- Not on your own post, nor on polls
select results_eq($$ select question_id from public.survey_for_posts(array[pg_temp.v('p')]) $$, $$ values (null::smallint) $$,
  'the author gets no question on her own post');
select pg_temp.as_user('b');
select results_eq($$ select question_id from public.survey_for_posts(array[pg_temp.v('poll')]) $$, $$ values (null::smallint) $$,
  'polls are not surveyed');

-- Assignment is fixed and balanced
select isnt((select question_id from public.survey_for_posts(array[pg_temp.v('p')])), null, 'B is assigned a question on first view');
select set_config('test.qb', (select question_id::text from public.micro_survey_assignments where post_id = pg_temp.v('p')), false);
select is((select question_id::text from public.survey_for_posts(array[pg_temp.v('p')])), current_setting('test.qb'),
  'the same question comes back on refresh');
select is((select question_id::text from public.survey_for_posts(array[pg_temp.v('p')])), current_setting('test.qb'),
  'and again');
select pg_temp.as_user('c');
select question_id from public.survey_for_posts(array[pg_temp.v('p')]);
reset role;
select set_eq($$ select dimension from public.micro_survey_assignments where post_id = pg_temp.v('p') $$,
  $$ values ('informative'::text), ('interesting'::text) $$, 'the first two readers get Informative and Interesting (25% targets each)');
set local role authenticated;
select pg_temp.as_user('d');
select question_id from public.survey_for_posts(array[pg_temp.v('p')]);
reset role;
select ok((select dimension from public.micro_survey_assignments where post_id = pg_temp.v('p') and user_id = pg_temp.uid('d'))
          in ('credible', 'appropriate'), 'the third reader gets a safety dimension (ties go to Credible and Appropriate)');
set local role authenticated;

-- Answering rules
select pg_temp.as_user('b');
select throws_ok($$ select public.answer_survey(pg_temp.v('p'), true, 2000) $$, '55000', null, 'no answer before a qualified view');
select is((select public.record_views(array[pg_temp.v('p'), pg_temp.v('poll')])), 2, 'B records two qualified views');
select is((select public.record_views(array[pg_temp.v('p')])), 0, 'a view counts once per reader');
select throws_ok($$ select public.answer_survey(pg_temp.v('p'), true, 500) $$, '55000', null, 'an answer under 0.8 s is refused');
select lives_ok($$ select public.answer_survey(pg_temp.v('p'), true, 2400) $$, 'B ticks');
select lives_ok($$ select public.answer_survey(pg_temp.v('p'), false, 2600) $$, 'and may change it within 10 minutes');
select results_eq($$ select my_answer, can_change from public.survey_for_posts(array[pg_temp.v('p')]) $$, $$ values (false, true) $$,
  'the change is stored');
select is((select count(*)::integer from public.micro_survey_responses where post_id = pg_temp.v('p')), 1, 'still one answer per reader');
reset role;
update public.micro_survey_responses set locked_at = now() - interval '1 second' where user_id = pg_temp.uid('b');
set local role authenticated;
select throws_ok($$ select public.answer_survey(pg_temp.v('p'), true, 3000) $$, '23505', null, 'after 10 minutes the answer is final');
select pg_temp.as_user('c');
select is_empty($$ select 1 from public.micro_survey_responses where user_id = pg_temp.uid('b') $$, 'C cannot read B''s answer');
select throws_ok($$ select public.answer_survey(pg_temp.v('poll'), true, 3000) $$, 'P0002', null, 'no answer without an assigned question');

-- Weights: a friend of the author counts 0.5; a new account 0.5
reset role;
insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('a'), pg_temp.uid('c'));
update auth.users set created_at = now() - interval '1 day' where id = pg_temp.uid('d');
set local role authenticated;
select public.record_views(array[pg_temp.v('p')]);
select public.answer_survey(pg_temp.v('p'), true, 1500);
select is(pg_temp.weight('c'), 0.5::numeric, 'a friend of the author counts at 0.5');
select pg_temp.as_user('d');
select public.record_views(array[pg_temp.v('p')]);
select public.answer_survey(pg_temp.v('p'), true, 1500);
select is(pg_temp.weight('d'), 0.5::numeric, 'an account under 3 days old counts at 0.5');
select pg_temp.as_user('b');
select is(pg_temp.stats('answers'), 3, 'the counters see three answers');
select is(pg_temp.stats('views'), 3, 'and three qualified views');

-- Public line: nothing below 3 ticks on a public dimension (a fresh post, so earlier
-- random assignments can't add to the count)
select pg_temp.as_user('a');
select pg_temp.clear_rl();
select set_config('test.p2', public.create_post('{"type":"general","audience":"university","body":"Second post"}')::text, false);
reset role;
insert into public.micro_survey_assignments (post_id, user_id, question_id, dimension)
select pg_temp.v('p2'), u, (select id from public.micro_survey_questions where dimension = 'informative' limit 1), 'informative'
  from unnest(array[pg_temp.uid('e'), pg_temp.uid('f'), pg_temp.uid('9')]) as u;
insert into public.micro_survey_responses (post_id, user_id, question_id, dimension, answer, latency_ms, weight, locked_at)
select pg_temp.v('p2'), u, (select id from public.micro_survey_questions where dimension = 'informative' limit 1), 'informative', true, 2000, 1, now()
  from unnest(array[pg_temp.uid('e'), pg_temp.uid('f')]) as u;
set local role authenticated;
select pg_temp.as_user('b');
select results_eq($$ select public_line from public.survey_for_posts(array[pg_temp.v('p2')]) $$, $$ values ('{}'::jsonb) $$,
  'no public line at 2 ticks');
reset role;
insert into public.micro_survey_responses (post_id, user_id, question_id, dimension, answer, latency_ms, weight, locked_at)
values (pg_temp.v('p2'), pg_temp.uid('9'), (select id from public.micro_survey_questions where dimension = 'informative' limit 1), 'informative', true, 2000, 1, now());
set local role authenticated;
select results_eq($$ select (public_line->'informative'->>'count')::integer, public_line->'informative'->>'phrase' from public.survey_for_posts(array[pg_temp.v('p2')]) $$,
  $$ values (3, 'find this informative'::text) $$, 'from 3 raw ticks the public line shows');
select results_eq($$ select public_line ? 'interesting' from public.survey_for_posts(array[pg_temp.v('p2')]) $$, $$ values (false) $$,
  'only the parts that reached 3');

-- Appropriate crosses from non-friends flag the post
reset role;
insert into public.micro_survey_assignments (post_id, user_id, question_id, dimension)
select pg_temp.v('poll'), u, (select id from public.micro_survey_questions where dimension = 'appropriate' limit 1), 'appropriate'
  from unnest(array[pg_temp.uid('e'), pg_temp.uid('f'), pg_temp.uid('9')]) as u;
insert into public.micro_survey_responses (post_id, user_id, question_id, dimension, answer, latency_ms, weight, locked_at)
select pg_temp.v('poll'), u, (select id from public.micro_survey_questions where dimension = 'appropriate' limit 1), 'appropriate', false, 2000, 1, now()
  from unnest(array[pg_temp.uid('e'), pg_temp.uid('f'), pg_temp.uid('9')]) as u;
select is((select appropriate_flags from public.post_stats where post_id = pg_temp.v('poll')), 3,
  '3 Appropriate crosses from non-friends are counted for the /ops soft signal');

-- Insights: author only, and paid
set local role authenticated;
select pg_temp.as_user('b');
select throws_ok($$ select * from public.post_insights(pg_temp.v('p')) $$, '42501', null, 'a reader can''t read insights');
select pg_temp.as_user('a');
select throws_ok($$ select * from public.post_insights(pg_temp.v('p')) $$, '42501', 'post insights come with Student Pro',
  'a free author calling insights directly is refused');

-- Config is versioned: rows can't be edited
reset role;
select throws_ok($$ update public.platform_config set value = '{}' where key = 'survey.shares' $$, '42501', null,
  'config rows are never edited; a new version is added instead');

set local role anon;
select throws_ok($$ select public.record_views(array[gen_random_uuid()]) $$, '42501', null, 'signed-out visitors record nothing');
reset role;

select * from finish();
rollback;
