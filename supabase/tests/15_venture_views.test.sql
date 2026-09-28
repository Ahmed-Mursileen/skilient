-- Read functions for the venture screens: team cards, browse, profile ventures.
-- A and B study at NUTECH, C at FAST.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('91000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('91000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('91000000-0000-0000-0000-00000000000c', 'c@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'vw_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '91000000-%';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select set_config('test.pub', public.create_venture('{"type":"project","title":"Open robots","description":"d",
  "roles":[{"title":"Designer","slots":1}]}')::text, false);
select set_config('test.uni', public.create_venture('{"type":"project","title":"Campus only","description":"d","visibility":"university"}')::text, false);
select set_config('test.hidden', public.create_venture('{"type":"project","title":"Hidden","description":"d","visibility":"unlisted"}')::text, false);
select set_config('test.startup', public.create_venture('{"type":"startup","title":"Chai Co","description":"d"}')::text, false);

select pg_temp.as_user('91000000-0000-0000-0000-00000000000c');
select results_eq($$ select username, full_name, avatar_path, is_owner, profile_visible from public.venture_team(pg_temp.v('pub')) $$,
  $$ values (null::text, 'Student A'::text, null::text, true, false) $$,
  'another university sees a public venture''s team by name only while the member''s profile is university-only');
reset role;
update public.profiles set visibility = 'global' where user_id = '91000000-0000-0000-0000-00000000000a';
set local role authenticated;
select results_eq($$ select username, profile_visible from public.venture_team(pg_temp.v('pub')) $$,
  $$ values ('vw_a'::text, true) $$, 'the full card (profile link) once the member''s profile is global');
reset role;
update public.profiles set visibility = 'university' where user_id = '91000000-0000-0000-0000-00000000000a';
set local role authenticated;
select pg_temp.as_user('91000000-0000-0000-0000-00000000000b');
select results_eq($$ select username, profile_visible from public.venture_team(pg_temp.v('pub')) $$,
  $$ values ('vw_a'::text, true) $$, 'a classmate gets the full card of a university-only profile');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.venture_team(pg_temp.v('uni')) $$, 'but not a university-only venture''s team');
select results_eq($$ select title from public.browse_ventures('project') order by title $$,
  $$ values ('Open robots'::text) $$, 'browse lists only what they can see, never unlisted');
select results_eq($$ select title from public.browse_ventures('startup') $$, $$ values ('Chai Co'::text) $$,
  'browse is per type');

select pg_temp.as_user('91000000-0000-0000-0000-00000000000b');
select results_eq($$ select title from public.browse_ventures('project') order by title $$,
  $$ values ('Campus only'::text), ('Open robots'::text) $$, 'a classmate also sees the university-only one');
select results_eq($$ select title from public.browse_ventures('project', p_open_roles => true) $$,
  $$ values ('Open robots'::text) $$, 'filtering by open roles');
select results_eq($$ select open_slots, members from public.browse_ventures('project', p_open_roles => true) $$,
  $$ values (1, 1) $$, 'with open slots and team size');
select results_eq($$ select title from public.profile_ventures('91000000-0000-0000-0000-00000000000a') order by title $$,
  $$ values ('Campus only'::text), ('Chai Co'::text), ('Open robots'::text) $$,
  'a profile lists the ventures the viewer can see, never unlisted ones');

select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select is((select count(*)::integer from public.profile_ventures('91000000-0000-0000-0000-00000000000a')), 4,
  'the owner sees all of hers, unlisted included');

select pg_temp.as_user('91000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.application_people(array['91000000-0000-0000-0000-00000000000a'::uuid]) $$,
  'no card for someone you share no application with');
select public.apply_to_venture(pg_temp.v('pub'), 'hello');
select results_eq($$ select username from public.application_people(array['91000000-0000-0000-0000-00000000000a'::uuid]) $$,
  $$ values ('vw_a'::text) $$, 'the owner''s card once you have applied');

set local role anon;
select throws_ok($$ select * from public.browse_ventures('project') $$, '42501', null, 'signed-out visitors browse nothing');
reset role;

select * from finish();
rollback;
