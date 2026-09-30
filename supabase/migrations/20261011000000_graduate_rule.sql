-- Phase 6 follow-up: graduates need no per-university setup (decisions.md 2026-10-02).
--
-- One platform rule decides who graduates: on and after 1 September (Pakistan time) every
-- student whose graduation year is that year or earlier becomes a graduate, at the next
-- nightly rollover. `universities.final_year_batch` stays only as an optional exception for a
-- university whose calendar differs; it replaces the rule for that university when set, and is
-- empty for all of them by default. The rule is versioned in platform_config ('graduates.rule').
insert into public.platform_config (key, version, value, reason)
values ('graduates.rule', 1, '{"month": 9, "day": 1}'::jsonb,
        'Students graduate on 1 September of their graduation year (decisions.md 2026-10-02)');

comment on column public.universities.final_year_batch is
  'Optional exception: graduate students of this year or earlier at this university instead of following the platform rule (platform_config graduates.rule). Null for almost every university.';

drop function private.graduate_rollover();
create function private.graduate_rollover(p_today date default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rule jsonb := private.config('graduates.rule');
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Karachi')::date);
  v_year integer;
  v_count integer;
begin
  -- The newest graduation year that has already graduated under the rule.
  v_year := extract(year from v_today)::integer
            - case when v_today < make_date(extract(year from v_today)::integer, (v_rule->>'month')::integer, (v_rule->>'day')::integer)
                   then 1 else 0 end;
  update public.profiles p
     set status = 'graduate', graduated_at = now()
    from public.universities u
   where u.id = p.university_id
     and p.role = 'student'
     and p.status = 'active'
     and p.graduation_year is not null
     and p.graduation_year <= coalesce(u.final_year_batch, v_year);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.graduate_rollover(date) from public;
-- The existing cron job calls graduate_rollover() with no arguments, which still resolves.
