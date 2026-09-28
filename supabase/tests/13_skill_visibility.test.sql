-- Who reads what about a skill (PRD 6): others see name, level and last used; the counts
-- behind a level are the owner's only, through my_skills().
begin;
select plan(8);

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('70000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk');
insert into public.user_skills (user_id, skill_id, level, active_days, lines, hits, repos, last_used_at) values
  ('70000000-0000-0000-0000-00000000000a', 'python', 2, 5, 900, 0, 2, now()),
  ('70000000-0000-0000-0000-00000000000b', 'java', 1, 0, 0, 0, 1, now());

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-00000000000b');
select is((select level from public.user_skills where user_id = '70000000-0000-0000-0000-00000000000a' and skill_id = 'python'),
  2::smallint, 'a classmate reads the level');
select isnt((select last_used_at from public.user_skills where user_id = '70000000-0000-0000-0000-00000000000a'), null,
  'and when it was last used');
select throws_ok($$ select lines from public.user_skills $$, '42501', null, 'but not the lines behind it');
select throws_ok($$ select active_days, hits, repos from public.user_skills $$, '42501', null, 'or the days, hits and repositories');
select results_eq($$ select skill_id, lines from public.my_skills() $$, $$ values ('java'::text, 0) $$,
  'my_skills() returns only the caller''s own skills');

select pg_temp.as_user('70000000-0000-0000-0000-00000000000a');
select results_eq($$ select skill_id, active_days, lines, repos from public.my_skills() $$,
  $$ values ('python'::text, 5, 900, 2) $$, 'the owner reads her counts');

set local role anon;
select throws_ok($$ select * from public.my_skills() $$, '42501', null, 'signed-out visitors cannot call my_skills()');
select throws_ok($$ select level from public.user_skills $$, '42501', null, 'or read levels');
reset role;

select * from finish();
rollback;
