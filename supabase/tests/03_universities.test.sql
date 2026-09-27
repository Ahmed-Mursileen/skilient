-- HEC universities and email domains (PRD 5.23 seed): data present, public read-only,
-- and the sync is idempotent and never touches ops-added domains.
begin;
select plan(16);

select cmp_ok((select count(*) from public.universities), '>=', 283::bigint, 'the HEC list is loaded');
select results_eq(
  $$ select u.name from public.universities u join public.university_domains d on d.university_id = u.id
      where d.domain = 'nutech.edu.pk' $$,
  $$ values ('National University of Technology (NUTECH)') $$,
  'NUTECH owns nutech.edu.pk'
);
select is(
  (select count(*) from public.university_domains where domain = 'preston.edu.pk'),
  2::bigint,
  'a shared domain maps to both universities'
);
select is_empty(
  $$ select domain from public.university_domains where domain <> lower(domain) $$,
  'every domain is stored lower-case'
);
select ok(
  exists (select 1 from public.personal_email_domains where domain = 'gmail.com'),
  'personal webmail domains are listed'
);

-- Anyone may read the reference data (the signup form's domain list)...
set local role anon;
select isnt_empty($$ select 1 from public.universities $$, 'anon can read universities');
select isnt_empty($$ select 1 from public.university_domains $$, 'anon can read university domains');
-- ...but nobody can change it over the API.
select throws_ok(
  $$ insert into public.university_domains (university_id, domain) select id, 'evil.com' from public.universities limit 1 $$,
  '42501', null, 'anon cannot add a domain'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.university_domains (university_id, domain) select id, 'evil.com' from public.universities limit 1 $$,
  '42501', null, 'a signed-in user cannot add a domain'
);
select throws_ok(
  $$ update public.universities set name = 'x' $$,
  '42501', null, 'a signed-in user cannot rename a university'
);
select throws_ok(
  $$ delete from public.university_domains $$,
  '42501', null, 'a signed-in user cannot delete domains'
);
select throws_ok(
  $$ select private.sync_hec_universities('[]'::jsonb) $$,
  '42501', null, 'a signed-in user cannot run the HEC sync'
);
reset role;

-- The sync is idempotent and only manages hec_seed rows.
insert into public.university_domains (university_id, domain, source)
select id, 'ops-added.edu.pk', 'ops' from public.universities where name = 'National University of Technology (NUTECH)';

select lives_ok(
  $$ select private.sync_hec_universities('[{"name":"National University of Technology (NUTECH)","slug":"national-university-of-technology-nutech","city":"Islamabad","province":"ICT","domains":["nutech.edu.pk","students.nutech.edu.pk"]}]'::jsonb) $$,
  'the sync runs'
);
select results_eq(
  $$ select d.domain, d.source from public.university_domains d join public.universities u on u.id = d.university_id
      where u.name = 'National University of Technology (NUTECH)' order by d.domain $$,
  $$ values ('nutech.edu.pk', 'hec_seed'), ('ops-added.edu.pk', 'ops'), ('students.nutech.edu.pk', 'hec_seed') $$,
  'the sync adds new seed domains and keeps ops-added ones'
);
select lives_ok(
  $$ select private.sync_hec_universities('[{"name":"National University of Technology (NUTECH)","slug":"national-university-of-technology-nutech","city":"Islamabad","province":"ICT","domains":["nutech.edu.pk"]}]'::jsonb) $$,
  'the sync runs again'
);
select results_eq(
  $$ select d.domain from public.university_domains d join public.universities u on u.id = d.university_id
      where u.name = 'National University of Technology (NUTECH)' order by d.domain $$,
  $$ values ('nutech.edu.pk'), ('ops-added.edu.pk') $$,
  'a seed domain removed from the file is removed; ops domains stay'
);

select * from finish();
rollback;
