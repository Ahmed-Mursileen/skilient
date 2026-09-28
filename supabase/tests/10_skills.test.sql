-- Skill taxonomy (PRD 5.5): loaded from the YAML, readable by signed-in users only,
-- written by nobody but the sync migrations; retiring keeps the row.
begin;
select plan(9);

select ok((select count(*) from public.skills where retired_at is null) >= 150, 'the taxonomy is loaded');
select is((select parent_id from public.skills where id = 'nextjs'), 'react', 'parents are set');
select ok((select detectors ? 'imports' from public.skills where id = 'react'), 'detectors are stored expanded');

insert into auth.users (id, email) values ('60000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk');

set local role anon;
select throws_ok($$ select 1 from public.skills $$, '42501', null, 'signed-out visitors cannot read the taxonomy');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "60000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select name from public.skills where id = 'python'), 'Python', 'a student reads the taxonomy');
select throws_ok($$ insert into public.skills (id, name, category, taxonomy_version) values ('x', 'X', 'tool', 1) $$,
  '42501', null, 'a student cannot add a skill');
select throws_ok($$ update public.skills set name = 'Snake' where id = 'python' $$, '42501', null, 'a student cannot rename a skill');
select throws_ok($$ select private.sync_skills(9, '[]') $$, '42501', null, 'a student cannot sync the taxonomy');

reset role;
select private.sync_skills(2, (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'category', category,
  'parent', parent_id, 'detectors', detectors)) from public.skills where id <> 'jquery'));
select is((select retired_at is not null from public.skills where id = 'jquery'), true,
  'a skill dropped from the taxonomy is retired, not deleted');

select * from finish();
rollback;
