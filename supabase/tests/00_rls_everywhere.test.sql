-- Guard: every table in the exposed schemas has RLS enabled (default deny).
begin;
select plan(2);

select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
  $$,
  'every public table has row level security enabled'
);

select is_empty(
  $$
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
       )
  $$,
  'every security definer function in public pins its search_path'
);

select * from finish();
rollback;
