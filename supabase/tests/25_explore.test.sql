-- Explore (PRD 5.10): people search shows card fields to everyone signed in, photo and
-- skills only where the profile is visible; never the searcher or anyone blocked; at
-- least 2 characters; friendship state in the same row. Venture search hides unlisted,
-- other universities' University-only ventures and blocked owners.
-- A, B, D study at NUTECH, C at FAST.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('25000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('25000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('25000000-0000-0000-0000-00000000000c', 'c@nu.edu.pk'),
  ('25000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'zx_' || right(user_id::text, 1),
       department = 'Computer Science', graduation_year = 2027, avatar_path = user_id::text || '/a.webp'
 where user_id::text like '25000000-%';
update public.profiles set full_name = 'Zainab Qureshi' where user_id = '25000000-0000-0000-0000-00000000000a';
update public.profiles set full_name = 'Zaid Qadir' where user_id = '25000000-0000-0000-0000-00000000000b';
update public.profiles set full_name = 'Zara Qasim', department = 'Electrical Engineering' where user_id = '25000000-0000-0000-0000-00000000000c';
update public.profiles set full_name = 'Zohaib Quraishi' where user_id = '25000000-0000-0000-0000-00000000000d';
insert into public.user_skills (user_id, skill_id, level) values
  ('25000000-0000-0000-0000-00000000000b', 'python', 3),
  ('25000000-0000-0000-0000-00000000000c', 'python', 2);

create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('25000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_id), 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated;

select set_config('test.c_uni', (select u.name from public.universities u join public.profiles p on p.university_id = u.id
                                   where p.user_id = pg_temp.uid('c')), false);
insert into public.friend_requests (sender_id, receiver_id) values (pg_temp.uid('a'), pg_temp.uid('d'));
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('d'), pg_temp.uid('b'));

set local role authenticated;
select pg_temp.as_user('a');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from public.profiles_public_card $$, '42501', null, 'the card table is still not readable directly');
select is_empty($$ select * from public.search_people('z') $$, 'one character lists nobody');
select results_eq($$ select username from public.search_people('za') order by username $$,
  $$ values ('zx_b'::text), ('zx_c') $$, 'part of a name finds people, never the searcher');
select results_eq($$ select username, friendship from public.search_people('qur') $$,
  $$ values ('zx_d'::text, 'request_sent'::text) $$, 'with the friendship state');
select is((select username from public.search_people('zx_c') limit 1), 'zx_c', 'an exact username comes first');
select results_eq($$ select university from public.search_people('zara') $$,
  $$ values (current_setting('test.c_uni')) $$, 'other universities are discoverable, with their university');
select results_eq($$ select avatar_path, skills from public.search_people('zara') $$,
  $$ values (null::text, '{}'::text[]) $$, 'but a University-only profile elsewhere shows no photo or skills');
select results_eq($$ select avatar_path is not null, skills from public.search_people('zaid') $$,
  $$ values (true, '{Python}'::text[]) $$, 'a visible profile shows its photo and skills');
select results_eq($$ select username from public.search_people('za', null, 'python') order by username $$,
  $$ values ('zx_b'::text) $$, 'the skill filter only matches skills you could see');
select results_eq($$ select username from public.search_people('za', 'electrical') $$, $$ values ('zx_c'::text) $$, 'department filter');
select results_eq($$ select username from public.search_people('computer science') order by username $$,
  $$ values ('zx_b'::text), ('zx_d') $$, 'department words match');
select results_eq($$ select username from public.search_people('z%') $$, $$ select null::text where false $$,
  'LIKE wildcards are just characters');
select pg_temp.as_user('d');
select is_empty($$ select * from public.search_people('zaid') $$, 'someone you blocked never appears');
select pg_temp.as_user('b');
select is_empty($$ select * from public.search_people('zohaib') $$, 'nor someone who blocked you');
select results_eq($$ select friendship from public.search_people('zohaib', null, null, null, 0) union all
                    select 'x' where false $$, $$ select 'x'::text where false $$, 'blocked either way, even by exact name');

-- ---------------------------------------------------------------------------
-- Ventures
-- ---------------------------------------------------------------------------
select pg_temp.as_user('c');
select set_config('test.pub', public.create_venture('{"type":"project","title":"Solar kiosk","description":"Off-grid charging"}')::text, false);
select set_config('test.uni', public.create_venture('{"type":"project","title":"Solar campus map","description":"d","visibility":"university"}')::text, false);
select set_config('test.hid', public.create_venture('{"type":"project","title":"Solar secret","description":"d","visibility":"unlisted"}')::text, false);
select pg_temp.as_user('a');
select results_eq($$ select title from public.search_ventures('sol', 'project') $$, $$ values ('Solar kiosk'::text) $$,
  'another university''s University-only and unlisted ventures stay hidden');
select results_eq($$ select title from public.search_ventures('charging', 'project') $$, $$ values ('Solar kiosk'::text) $$,
  'description words match');
select is_empty($$ select * from public.search_ventures('solar', 'startup') $$, 'the tab picks the type');
select pg_temp.as_user('c');
select results_eq($$ select count(*)::integer from public.search_ventures('solar', 'project') $$, $$ values (2) $$,
  'the owner''s university sees its University-only venture (still not unlisted)');
reset role;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('c'));
set local role authenticated;
select pg_temp.as_user('a');
select is_empty($$ select * from public.search_ventures('solar', 'project') $$, 'a blocked owner''s ventures never appear');

select * from finish();
rollback;
