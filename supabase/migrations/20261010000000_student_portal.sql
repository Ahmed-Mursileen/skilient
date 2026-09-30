-- Phase 6: student portal and learning layer (PRD 5.25, 5.27; decisions.md 2026-10-02).
--
-- Account status (active / graduate / deleting) with the nightly graduate rollover and the
-- 14-day deletion cooling-off; the nav badge counts, the progress card's next step and to-do
-- count, the getting-started checklist; tour and tip state; day-dismissals in ui_state; the
-- Opportunities hub reads (empty until jobs, competitions, fairs and ideas arrive in phases
-- 7-9); the feedback centre with its ops triage; the staff form for each university's
-- final-year batch.
--
-- Reads and writes go through security-definer functions in `private` (unexposed) with
-- security-invoker wrappers in `public`; every new table has RLS on and only owner reads.

-- ---------------------------------------------------------------------------
-- Account status
-- ---------------------------------------------------------------------------
create type public.account_status as enum ('active', 'graduate', 'deleting');

alter table public.profiles
  add column status public.account_status not null default 'active',
  add column graduated_at timestamptz,
  add column delete_after timestamptz,
  add constraint profiles_deleting_has_date check ((status = 'deleting') = (delete_after is not null));
comment on column public.profiles.status is
  'active, graduate (batch rolled over: no University Feed posts, no university-only ventures) or deleting (14-day cooling-off). Never written by the client.';
comment on column public.profiles.delete_after is 'End of the cooling-off; the account-deletion job removes the account after it.';
create index profiles_deleting_idx on public.profiles (delete_after) where status = 'deleting';

alter table public.universities add column final_year_batch smallint
  check (final_year_batch is null or final_year_batch between 1980 and 2100);
comment on column public.universities.final_year_batch is
  'The graduating year of the final-year batch. Students with graduation_year at or before it become graduates at the nightly rollover.';

-- The gate reads the status: a deleting account can only reach the cancel page.
create or replace function public.my_gate_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'has_profile', p.user_id is not null,
    'role', p.role,
    'university_id', p.university_id,
    'username', p.username,
    'onboarding_complete', coalesce(p.onboarding_complete, false),
    'onboarding_step', coalesce(o.step, 1),
    'agreement_version', v.version,
    'agreement_accepted', v.version is null or exists (
      select 1 from public.agreement_acceptances a
       where a.user_id = (select auth.uid()) and a.version = v.version
    ),
    'email_allowed', private.email_domain_allowed(),
    'status', coalesce(p.status, 'active')
  )
  from (select private.current_agreement_version() as version) v
  left join public.profiles p on p.user_id = (select auth.uid())
  left join public.onboarding_state o on o.user_id = (select auth.uid());
$$;

-- Graduates post to the Global Feed only and don't join university-only ventures (PRD 5.25).
-- Triggers rather than edits to the functions: they hold however the row is written. The
-- automatic "shipped" post of a completing venture is not the graduate posting.
create function private.graduate_post_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience = 'university' and new.type <> 'shipped'
     and exists (select 1 from public.profiles p where p.user_id = new.author_id and p.status = 'graduate') then
    raise exception 'graduates post to the Global Feed only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.graduate_post_guard() from public;
create trigger posts_graduate_guard before insert on public.posts
  for each row execute function private.graduate_post_guard();

create function private.graduate_venture_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if tg_table_name = 'application_threads' then
    v_user := new.candidate_id;
  else
    v_user := new.user_id;
  end if;
  if exists (select 1 from public.ventures v where v.id = new.venture_id and v.visibility = 'university')
     and exists (select 1 from public.profiles p where p.user_id = v_user and p.status = 'graduate') then
    raise exception 'graduates can''t join university-only ventures' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.graduate_venture_guard() from public;
create trigger venture_members_graduate_guard before insert on public.venture_members
  for each row execute function private.graduate_venture_guard();
create trigger application_threads_graduate_guard before insert on public.application_threads
  for each row execute function private.graduate_venture_guard();

-- Nightly rollover: a batch that the university's final-year batch has reached graduates.
create function private.graduate_rollover()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.profiles p
     set status = 'graduate', graduated_at = now()
    from public.universities u
   where u.id = p.university_id
     and u.final_year_batch is not null
     and p.role = 'student'
     and p.status = 'active'
     and p.graduation_year is not null
     and p.graduation_year <= u.final_year_batch;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.graduate_rollover() from public;
select cron.schedule('graduate-rollover', '10 19 * * *', $$select private.graduate_rollover()$$); -- 00:10 PKT

-- Leaderboards: deleting accounts are off every board; graduates leave the university boards
-- 12 months after graduating (the global board keeps them).
create or replace function private.board(p_scope text, p_department text, p_batch smallint)
returns table (user_id uuid, total numeric, tier public.ranking_tier, rank bigint, previous_rank bigint, place bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_university uuid := private.current_university_id();
  v_week date := private.last_snapshot_week();
begin
  if p_scope not in ('university', 'global') then
    raise exception 'choose university or global' using errcode = '22023';
  end if;
  return query
  with pop as (
    select s.user_id, s.total, s.tier, p.full_name
      from public.ranking_scores s
      join public.profiles p on p.user_id = s.user_id
     where s.ranked and not p.leaderboard_opt_out and p.role = 'student' and p.onboarding_complete
       and p.status <> 'deleting'
       and (p_scope = 'global'
            or (p.university_id = v_university
                and (p.status <> 'graduate' or p.graduated_at > now() - interval '12 months')
                and (p_department is null or p.department = p_department)
                and (p_batch is null or p.graduation_year = p_batch)))
  ), now_ranked as (
    select pop.*, rank() over (order by pop.total desc) as r,
           row_number() over (order by pop.total desc, pop.full_name, pop.user_id) as pos
      from pop
  ), prior as (
    select n.user_id, rank() over (order by n.total desc) as r
      from public.ranking_snapshots n
      join pop on pop.user_id = n.user_id
     where n.week = v_week and n.ranked
  )
  select nr.user_id, nr.total, nr.tier, nr.r, b.r, nr.pos
    from now_ranked nr
    left join prior b on b.user_id = nr.user_id;
end;
$$;
revoke all on function private.board(text, text, smallint) from public;

-- ---------------------------------------------------------------------------
-- Staff: the final-year batch of each university (accounts role, audited)
-- ---------------------------------------------------------------------------
create function private.ops_batches()
returns table (university_id uuid, name text, final_year_batch smallint, students bigint, graduates bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('accounts') then
    raise exception 'accounts staff only, with two-factor on' using errcode = '42501';
  end if;
  return query
  select u.id, u.name, u.final_year_batch,
         count(p.user_id) filter (where p.role = 'student'),
         count(p.user_id) filter (where p.status = 'graduate')
    from public.universities u
    left join public.profiles p on p.university_id = u.id
   group by u.id
   order by (u.final_year_batch is null), u.name;
end;
$$;
revoke all on function private.ops_batches() from public;
grant execute on function private.ops_batches() to authenticated;

create function private.ops_set_final_year_batch(p_university uuid, p_batch smallint, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_before smallint;
begin
  if not private.is_staff('accounts') then
    raise exception 'accounts staff only, with two-factor on' using errcode = '42501';
  end if;
  if p_batch is not null and p_batch not between 1980 and 2100 then
    raise exception 'enter a graduating year' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'give a reason of 3 to 500 characters' using errcode = '22023';
  end if;
  select final_year_batch into v_before from public.universities where id = p_university for update;
  if not found then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  update public.universities set final_year_batch = p_batch where id = p_university;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'university.final_year_batch', 'university', p_university::text, btrim(p_reason),
          jsonb_build_object('final_year_batch', v_before), jsonb_build_object('final_year_batch', p_batch));
end;
$$;
revoke all on function private.ops_set_final_year_batch(uuid, smallint, text) from public;
grant execute on function private.ops_set_final_year_batch(uuid, smallint, text) to authenticated;

create function public.ops_batches()
returns table (university_id uuid, name text, final_year_batch smallint, students bigint, graduates bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.ops_batches() $$;
create function public.ops_set_final_year_batch(p_university uuid, p_batch smallint, p_reason text)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.ops_set_final_year_batch(p_university, p_batch, p_reason) $$;

-- ---------------------------------------------------------------------------
-- Account deletion: 14-day cooling-off, then removal
-- ---------------------------------------------------------------------------
insert into public.notification_types (type, category, emailed) values
  ('deletion_requested', 'account', true),
  ('deletion_cancelled', 'account', true);

create function private.request_account_deletion()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_when timestamptz;
begin
  if exists (select 1 from public.staff_roles s where s.user_id = v_me) then
    raise exception 'staff accounts are removed by a super admin' using errcode = '55000';
  end if;
  update public.profiles set status = 'deleting', delete_after = now() + interval '14 days'
   where user_id = v_me and status <> 'deleting'
  returning delete_after into v_when;
  if not found then
    select delete_after into v_when from public.profiles where user_id = v_me and status = 'deleting';
    if not found then
      raise exception 'profile not found' using errcode = 'P0002';
    end if;
    return v_when; -- already requested: the same date
  end if;
  perform private.notify(v_me, null, 'deletion_requested', 'account', v_me,
                         jsonb_build_object('delete_after', v_when));
  return v_when;
end;
$$;
revoke all on function private.request_account_deletion() from public;
grant execute on function private.request_account_deletion() to authenticated;

-- Cancelling restores the account as it was: graduates stay graduates.
create function private.cancel_account_deletion()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  update public.profiles
     set status = case when graduated_at is not null then 'graduate'::public.account_status else 'active'::public.account_status end,
         delete_after = null
   where user_id = v_me and status = 'deleting';
  if not found then
    raise exception 'no deletion is pending' using errcode = '55000';
  end if;
  perform private.notify(v_me, null, 'deletion_cancelled', 'account', v_me);
end;
$$;
revoke all on function private.cancel_account_deletion() from public;
grant execute on function private.cancel_account_deletion() to authenticated;

-- While an account is being deleted, triggers that fire during the cascade (a member
-- leaving, an ownership hand-over) must not write notifications to or from it: the person
-- is going, and the rows would point at a user that no longer exists.
create or replace function private.notify(p_user uuid, p_actor uuid, p_type text, p_entity_type text, p_entity_id uuid,
                                          p_data jsonb default '{}'::jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor uuid := p_actor;
  v_going uuid := nullif(current_setting('skilient.deleting_user', true), '')::uuid;
begin
  if p_user is null or p_user = v_actor or p_user = v_going then
    return null;
  end if;
  if v_actor = v_going then
    v_actor := null;
  end if;
  if v_actor is not null and private.is_blocked(p_user, v_actor) then
    return null;
  end if;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, data)
  values (p_user, v_actor, p_type, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  if private.email_channel_for(p_user, p_type) = 'instant_email' then
    perform pgmq.send('notification_emails', jsonb_build_object('kind', 'instant', 'notification_id', v_id));
  end if;
  return v_id;
end;
$$;

-- One account, after its window. Ventures the person owns pass to the longest-standing other
-- member (or go, with nobody else on the team); images are queued for the storage worker;
-- deleting the auth user cascades the rest: their posts, messages, endorsements and
-- credentials go, notifications and reports keep only an empty actor, and the CV trigger
-- (`cv_on_delete`) leaves a revoked, content-wiped record.
create function private.delete_account(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v record;
  v_next uuid;
begin
  if not exists (select 1 from public.profiles p where p.user_id = p_user and p.status = 'deleting' and p.delete_after <= now()) then
    raise exception 'this account isn''t due for deletion' using errcode = '55000';
  end if;
  perform set_config('skilient.deleting_user', p_user::text, true);
  for v in select id from public.ventures where owner_id = p_user loop
    select m.user_id into v_next from public.venture_members m
     where m.venture_id = v.id and m.user_id <> p_user
     order by m.joined_at, m.user_id limit 1;
    if v_next is null then
      delete from public.ventures where id = v.id;
    else
      update public.ventures set owner_id = v_next where id = v.id;
      update public.application_threads set owner_id = v_next where venture_id = v.id and status = 'pending';
    end if;
  end loop;
  perform private.queue_storage_cleanup(o.bucket_id, o.name)
     from storage.objects o
    where o.bucket_id in ('avatars', 'credentials', 'cv-exports', 'feedback') and o.name like p_user::text || '/%';
  perform private.queue_storage_cleanup('chat-media', m.media_path)
     from public.chat_messages m
    where m.sender_id = p_user and m.media_path is not null;
  delete from auth.users where id = p_user;
end;
$$;
revoke all on function private.delete_account(uuid) from public;

create function private.account_deletion_run()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_done integer := 0;
begin
  for r in
    select p.user_id from public.profiles p
     where p.status = 'deleting' and p.delete_after <= now()
     order by p.delete_after limit 20
       for update skip locked
  loop
    begin
      perform private.delete_account(r.user_id);
      v_done := v_done + 1;
    exception when others then
      -- One stuck account never blocks the rest; it is retried next hour.
      raise warning 'account deletion failed for %: %', r.user_id, sqlerrm;
    end;
  end loop;
  return v_done;
end;
$$;
revoke all on function private.account_deletion_run() from public;
select cron.schedule('account-deletion', '17 * * * *', $$select private.account_deletion_run()$$);

create function public.request_account_deletion() returns timestamptz
  language sql volatile security invoker set search_path = '' as $$ select private.request_account_deletion() $$;
create function public.cancel_account_deletion() returns void
  language sql volatile security invoker set search_path = '' as $$ select private.cancel_account_deletion() $$;

-- ---------------------------------------------------------------------------
-- Small per-user UI state (day-dismissals), tours and first-visit tips
-- ---------------------------------------------------------------------------
create table public.ui_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
comment on table public.ui_state is 'Per-user interface state (e.g. the progress card dismissed for a day). Written only by set_ui_state().';

create table public.tour_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  tour_id text not null check (tour_id in ('student', 'faculty', 'recruiter', 'uni_admin')),
  step smallint not null default 0 check (step between 0 and 50),
  completed_at timestamptz,
  skipped_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, tour_id)
);
comment on table public.tour_progress is 'Guided tour progress (PRD 5.27). A row means the tour has started; completed_at or skipped_at means it will not start again.';

create table public.tips_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  tip_id text not null check (tip_id in ('opportunities', 'venture', 'cv', 'score', 'privacy')),
  seen_at timestamptz not null default now(),
  primary key (user_id, tip_id)
);
comment on table public.tips_seen is 'First-visit tip cards the user has dismissed (PRD 5.27).';

alter table public.ui_state enable row level security;
alter table public.tour_progress enable row level security;
alter table public.tips_seen enable row level security;
revoke all on table public.ui_state, public.tour_progress, public.tips_seen from anon, authenticated;
grant select on table public.ui_state, public.tour_progress, public.tips_seen to authenticated;
create policy ui_state_read_own on public.ui_state for select to authenticated using (user_id = (select auth.uid()));
create policy tour_progress_read_own on public.tour_progress for select to authenticated using (user_id = (select auth.uid()));
create policy tips_seen_read_own on public.tips_seen for select to authenticated using (user_id = (select auth.uid()));

create function private.set_ui_state(p_key text, p_value jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_key is null or p_key <> all (array['progress_card_dismissed_on', 'checklist_dismissed']) then
    raise exception 'unknown setting' using errcode = '22023';
  end if;
  if p_value is null or char_length(p_value::text) > 100 then
    raise exception 'that value is too long' using errcode = '22023';
  end if;
  insert into public.ui_state (user_id, key, value) values (v_me, p_key, p_value)
  on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function private.set_ui_state(text, jsonb) from public;
grant execute on function private.set_ui_state(text, jsonb) to authenticated;

-- {started, step, completed, skipped}
create function private.tour_state(p_tour text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('started', true, 'step', t.step, 'completed', t.completed_at is not null,
                               'skipped', t.skipped_at is not null)
       from public.tour_progress t where t.user_id = (select private.require_user()) and t.tour_id = p_tour),
    jsonb_build_object('started', false, 'step', 0, 'completed', false, 'skipped', false));
$$;
revoke all on function private.tour_state(text) from public;
grant execute on function private.tour_state(text) to authenticated;

create function private.save_tour(p_tour text, p_step integer, p_outcome text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_tour is null or p_tour <> all (array['student', 'faculty', 'recruiter', 'uni_admin']) then
    raise exception 'unknown tour' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome <> all (array['progress', 'completed', 'skipped']) then
    raise exception 'unknown outcome' using errcode = '22023';
  end if;
  if p_step is null or p_step not between 0 and 50 then
    raise exception 'unknown step' using errcode = '22023';
  end if;
  insert into public.tour_progress (user_id, tour_id, step, completed_at, skipped_at)
  values (v_me, p_tour, p_step, case when p_outcome = 'completed' then now() end, case when p_outcome = 'skipped' then now() end)
  on conflict (user_id, tour_id) do update
    set step = excluded.step,
        completed_at = coalesce(public.tour_progress.completed_at, excluded.completed_at),
        skipped_at = coalesce(public.tour_progress.skipped_at, excluded.skipped_at),
        updated_at = now();
end;
$$;
revoke all on function private.save_tour(text, integer, text) from public;
grant execute on function private.save_tour(text, integer, text) to authenticated;

create function private.restart_tour(p_tour text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.tour_progress where user_id = private.require_user() and tour_id = p_tour;
end;
$$;
revoke all on function private.restart_tour(text) from public;
grant execute on function private.restart_tour(text) to authenticated;

create function private.see_tip(p_tip text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_tip is null or p_tip <> all (array['opportunities', 'venture', 'cv', 'score', 'privacy']) then
    raise exception 'unknown tip' using errcode = '22023';
  end if;
  insert into public.tips_seen (user_id, tip_id) values (v_me, p_tip) on conflict do nothing;
end;
$$;
revoke all on function private.see_tip(text) from public;
grant execute on function private.see_tip(text) to authenticated;

create function public.set_ui_state(p_key text, p_value jsonb) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.set_ui_state(p_key, p_value) $$;
create function public.tour_state(p_tour text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.tour_state(p_tour) $$;
create function public.save_tour(p_tour text, p_step integer, p_outcome text) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.save_tour(p_tour, p_step, p_outcome) $$;
create function public.restart_tour(p_tour text) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.restart_tour(p_tour) $$;
create function public.see_tip(p_tip text) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.see_tip(p_tip) $$;

-- ---------------------------------------------------------------------------
-- Nav badges, the progress card and the getting-started checklist
-- ---------------------------------------------------------------------------
-- What the shell shows on each nav item. Ventures: applications to my ventures and invites
-- to me; Opportunities: recruiter contact requests (0 until phase 8).
create function private.nav_badges()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  return jsonb_build_object(
    'chat', private.unread_chat_count(),
    'notifications', (select count(*)::integer from public.notifications n where n.user_id = v_me and n.read_at is null),
    'friends', private.pending_friend_request_count(),
    'ventures',
      (select count(*)::integer from public.application_threads t where t.owner_id = v_me and t.status = 'pending')
      + (select count(*)::integer from public.venture_invites i where i.invitee_id = v_me and i.status = 'pending'),
    'opportunities', 0);
end;
$$;
revoke all on function private.nav_badges() from public;
grant execute on function private.nav_badges() to authenticated;

-- The progress card's to-do count: what is waiting on this student.
create function private.todo_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_friends integer := private.pending_friend_request_count();
  v_applications integer;
  v_invites integer;
  v_confirm integer;
  v_endorse integer;
begin
  select count(*)::integer into v_applications from public.application_threads t
   where t.owner_id = v_me and t.status = 'pending';
  select count(*)::integer into v_invites from public.venture_invites i
   where i.invitee_id = v_me and i.status = 'pending';
  -- Teammates' manual entries in my open ventures that I haven't confirmed.
  select count(*)::integer into v_confirm
    from public.contributions_with_status c
    join public.ventures v on v.id = c.venture_id and v.status in ('recruiting', 'in_progress')
   where c.user_id <> v_me and c.source = 'manual' and c.by_member and not c.confirmed_by_me
     and exists (select 1 from public.venture_members m where m.venture_id = c.venture_id and m.user_id = v_me);
  -- Completed ventures with teammates where I haven't endorsed anyone yet.
  select count(*)::integer into v_endorse
    from public.ventures v
    join public.venture_members me on me.venture_id = v.id and me.user_id = v_me
   where v.status = 'completed'
     and exists (select 1 from public.venture_members o where o.venture_id = v.id and o.user_id <> v_me)
     and not exists (select 1 from public.endorsements e where e.venture_id = v.id and e.endorser_id = v_me);
  return jsonb_build_object(
    'total', v_friends + v_applications + v_invites + v_confirm + v_endorse,
    'requests', v_friends, 'applications', v_applications, 'invites', v_invites,
    'confirm', v_confirm, 'endorse', v_endorse);
end;
$$;
revoke all on function private.todo_counts() from public;
grant execute on function private.todo_counts() to authenticated;

-- The single most valuable next step, from the tier's unmet requirements (the same rules
-- /me/score shows), in the order that unlocks the most: a peer-confirmed entry, then points,
-- ventures, endorsements, a completed venture, a level 3 skill. Templates only.
create function private.next_best_action()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  r jsonb := private.next_tier_requirements(v_me);
  v_next text := r->>'next';
  v_need jsonb := coalesce(r->'needs', '[]'::jsonb);
  v_first jsonb := v_need->0;
  v_target text := case when v_next is null then '' when v_next = 'raw' then 'get ranked' else 'reach ' || initcap(v_next) end;
  v_pending integer := (private.todo_counts()->>'total')::integer;
begin
  if v_next is null then
    return jsonb_build_object('key', 'top', 'title', 'You''re at the top tier',
      'body', 'Keep your momentum up: posting, helping your teams and staying active.', 'href', '/me/score');
  end if;
  if v_first is null then
    return jsonb_build_object('key', 'waiting', 'title', 'You meet every requirement to ' || v_target,
      'body', 'It shows after tonight''s ranking run.', 'href', '/me/score');
  end if;
  case v_first->>'key'
    when 'peer_verified_entries' then
      if not exists (select 1 from public.venture_members m where m.user_id = v_me) then
        return jsonb_build_object('key', 'join_venture', 'title', 'Join or start a venture',
          'body', 'Verified work starts with a team project. Find one to join or start your own.', 'href', '/ventures');
      elsif not exists (select 1 from public.contributions c where c.user_id = v_me and c.corrects_id is null) then
        return jsonb_build_object('key', 'log_contribution', 'title', 'Log your first contribution',
          'body', 'Write what you did on your venture, then ask a teammate to confirm it.', 'href', '/ventures');
      end if;
      return jsonb_build_object('key', 'get_confirmed', 'title', 'Get 1 teammate to confirm a contribution to ' || v_target,
        'body', 'A teammate''s confirmation turns your entry into verified work.', 'href', '/ventures');
    when 'points' then
      return jsonb_build_object('key', 'points', 'title', 'Earn ' || ceil((v_first->>'need')::numeric - (v_first->>'have')::numeric)
        || ' more points to ' || v_target, 'body', 'See where your points come from and what would add the most.', 'href', '/me/score');
    when 'active_ventures' then
      return jsonb_build_object('key', 'active_ventures', 'title', 'Get a confirmed contribution in ' || (v_first->>'need') || ' ventures',
        'body', 'Log work on each venture and ask a teammate to confirm it.', 'href', '/ventures');
    when 'counting_endorsements' then
      return jsonb_build_object('key', 'endorsements', 'title', 'Get ' || (v_first->>'need') || ' endorsements to ' || v_target,
        'body', 'Teammates can vouch for your skills from the Team tab of your venture.', 'href', '/me/work?tab=endorsements');
    when 'completed_ventures' then
      return jsonb_build_object('key', 'complete_venture', 'title', 'Complete a venture to ' || v_target,
        'body', 'Finished ventures count most toward your rank.', 'href', '/ventures');
    when 'max_level' then
      return jsonb_build_object('key', 'skill_level', 'title', 'Reach L' || (v_first->>'need') || ' in a skill',
        'body', 'A merged pull request or a confirmed contribution tagged with the skill gets you there.', 'href', '/me/skills');
    else
      if v_pending > 0 then
        return jsonb_build_object('key', 'todo', 'title', 'You have ' || v_pending || ' thing' || case when v_pending = 1 then '' else 's' end || ' waiting',
          'body', 'Requests, contributions to confirm and endorsements.', 'href', '/requests');
      end if;
      return jsonb_build_object('key', 'keep_going', 'title', 'Keep building toward ' || initcap(v_next),
        'body', 'Your score page shows exactly what is left.', 'href', '/me/score');
  end case;
end;
$$;
revoke all on function private.next_best_action() from public;
grant execute on function private.next_best_action() to authenticated;

-- Each item is computed from existing tables; nothing is stored. Points are what the
-- ranking formula in force pays for it (read from platform_config, never repeated here).
create function private.getting_started()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  f jsonb := (select value from private.ranking_formula());
  v_items jsonb;
begin
  v_items := jsonb_build_array(
    jsonb_build_object('key', 'profile', 'label', 'Finish your profile', 'href', '/settings/profile', 'points', null, 'note', null,
      'done', exists (select 1 from public.profiles p where p.user_id = v_me and p.bio is not null and p.avatar_path is not null)),
    jsonb_build_object('key', 'github', 'label', 'Connect GitHub', 'href', '/settings/github', 'points', null, 'note', null,
      'done', exists (select 1 from public.github_accounts g where g.user_id = v_me and g.revoked_at is null)),
    jsonb_build_object('key', 'l2', 'label', 'Reach your first L2 skill', 'href', '/me/skills',
      'points', (f->'skills'->'level_points'->>'2')::numeric, 'note', null,
      'done', exists (select 1 from public.user_skills s where s.user_id = v_me and s.level >= 2)),
    jsonb_build_object('key', 'venture', 'label', 'Join or start a venture', 'href', '/ventures',
      'points', (f->'work'->>'venture_points')::numeric, 'note', 'when it completes',
      'done', exists (select 1 from public.venture_members m where m.user_id = v_me)),
    jsonb_build_object('key', 'endorsement', 'label', 'Get your first endorsement', 'href', '/me/work?tab=endorsements',
      'points', (f->'endorsements'->>'points')::numeric, 'note', null,
      'done', exists (select 1 from public.endorsements e where e.endorsee_id = v_me and not e.hidden)),
    jsonb_build_object('key', 'cv', 'label', 'Build your CV', 'href', '/me/cv', 'points', null, 'note', null,
      'done', exists (select 1 from public.cv_records c where c.user_id = v_me)));
  return jsonb_build_object('items', v_items,
    'done', (select count(*)::integer from jsonb_array_elements(v_items) i where (i->>'done')::boolean),
    'total', jsonb_array_length(v_items));
end;
$$;
revoke all on function private.getting_started() from public;
grant execute on function private.getting_started() to authenticated;

create function public.nav_badges() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.nav_badges() $$;
create function public.todo_counts() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.todo_counts() $$;
create function public.next_best_action() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.next_best_action() $$;
create function public.getting_started() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.getting_started() $$;

-- ---------------------------------------------------------------------------
-- Opportunities hub reads (PRD 5.25)
-- ---------------------------------------------------------------------------
-- One read for every tab. Jobs and contact requests arrive with recruiters (phase 8),
-- competitions and hackathons and job fairs with universities (phase 9), project ideas with
-- teachers (phase 7); each of those phases fills its tab here and nothing else changes.
-- "For you" matches the student's L2+ skills and "looking for" line and is ordered by that
-- match alone: sponsorship must never be an input to its ordering (pgTAP 39 keeps the
-- function text free of it). Sponsored posts are labelled only on the Jobs tab.
create function private.opportunities(p_tab text, p_after integer default 0)
returns table (id uuid, kind text, title text, org_name text, detail text, href text, starts_at timestamptz, sponsored boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if p_tab is null or p_tab <> all (array['for_you', 'jobs', 'contact_requests', 'applications', 'competitions', 'job_fairs', 'ideas']) then
    raise exception 'unknown tab' using errcode = '22023';
  end if;
  return query
  select null::uuid, null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::boolean
   where false;
end;
$$;
revoke all on function private.opportunities(text, integer) from public;
grant execute on function private.opportunities(text, integer) to authenticated;

create function public.opportunities(p_tab text, p_after integer default 0)
returns table (id uuid, kind text, title text, org_name text, detail text, href text, starts_at timestamptz, sponsored boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.opportunities(p_tab, p_after) $$;

-- ---------------------------------------------------------------------------
-- Feedback centre (PRD 5.27)
-- ---------------------------------------------------------------------------
create type public.feedback_type as enum ('bug', 'idea', 'confusing', 'praise');
create type public.feedback_status as enum ('received', 'reviewing', 'planned', 'shipped', 'wont_do');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.feedback_type not null,
  body text not null check (char_length(btrim(body)) between 3 and 2000),
  screenshot_path text check (screenshot_path is null or screenshot_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  page text check (page is null or char_length(page) <= 200),
  device text check (device is null or char_length(device) <= 200),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  status public.feedback_status not null default 'received',
  staff_reply text check (staff_reply is null or char_length(staff_reply) <= 2000),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.feedback is 'Feedback from students (PRD 5.27). Written by submit_feedback(); triaged by staff through the feedback_* functions.';
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);
create index feedback_status_created_idx on public.feedback (status, created_at);
create index feedback_claimed_by_idx on public.feedback (claimed_by);

alter table public.feedback enable row level security;
revoke all on table public.feedback from anon, authenticated;
grant select on table public.feedback to authenticated;
create policy feedback_read_own on public.feedback for select to authenticated using (user_id = (select auth.uid()));

insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('feedback', 'Feedback replies', 'Skilient staff answer or update feedback you sent.', 10, 'digest', false);
insert into public.notification_types (type, category, emailed) values ('feedback_update', 'feedback', true);

-- Private bucket for screenshots: 5 MB, re-encoded WebP only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.feedback_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and (select count(*) from storage.objects o
           where o.bucket_id = 'feedback' and o.owner_id = (select auth.uid())::text) < 30;
$$;
revoke all on function private.feedback_upload_allowed(text) from public;
grant execute on function private.feedback_upload_allowed(text) to authenticated;

create policy feedback_files_read on storage.objects for select to authenticated
  using (bucket_id = 'feedback'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff())));
create policy feedback_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and private.feedback_upload_allowed(name));
-- Take back an upload that never became feedback.
create function private.feedback_file_unused(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.feedback f where f.screenshot_path = p_name);
$$;
revoke all on function private.feedback_file_unused(text) from public;
grant execute on function private.feedback_file_unused(text) to authenticated;
create policy feedback_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and owner_id = (select auth.uid())::text and private.feedback_file_unused(name));

create or replace function private.queue_storage_cleanup(p_bucket text, p_path text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.send('storage_cleanup', jsonb_build_object('bucket', p_bucket, 'path', p_path))
   where p_path is not null and p_bucket in ('post-media', 'chat-media', 'avatars', 'credentials', 'cv-exports', 'feedback');
$$;

-- Any staff role (moderator, trust reviewer, accounts, super admin), on a two-factor session.
create function private.require_any_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only, with two-factor on' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function private.require_any_staff() from public;

-- 10 a day; the screenshot must be the caller's own, freshly uploaded, unused file.
create function private.submit_feedback(p_type public.feedback_type, p_body text, p_screenshot text, p_page text,
                                        p_device text, p_version text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 3 and 2000 then
    raise exception 'write 3 to 2,000 characters' using errcode = '23514';
  end if;
  if (select count(*) from public.feedback f where f.user_id = v_me and f.created_at > now() - interval '1 day') >= 10 then
    raise exception 'you''ve sent 10 today; try again tomorrow' using errcode = '54000';
  end if;
  if p_screenshot is not null then
    if (storage.foldername(p_screenshot))[1] is distinct from v_me::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'feedback' and o.name = p_screenshot)
       or exists (select 1 from public.feedback f where f.screenshot_path = p_screenshot) then
      raise exception 'that screenshot isn''t available' using errcode = '22023';
    end if;
  end if;
  insert into public.feedback (user_id, type, body, screenshot_path, page, device, app_version)
  values (v_me, p_type, btrim(p_body), p_screenshot, left(p_page, 200), left(p_device, 200), left(p_version, 40))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.submit_feedback(public.feedback_type, text, text, text, text, text) from public;
grant execute on function private.submit_feedback(public.feedback_type, text, text, text, text, text) to authenticated;

create function private.my_feedback()
returns table (id uuid, type public.feedback_type, body text, status public.feedback_status, staff_reply text,
               created_at timestamptz, replied_at timestamptz, has_screenshot boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.type, f.body, f.status, f.staff_reply, f.created_at, f.replied_at, f.screenshot_path is not null
    from public.feedback f
   where f.user_id = (select private.require_user())
   order by f.created_at desc
   limit 50;
$$;
revoke all on function private.my_feedback() from public;
grant execute on function private.my_feedback() to authenticated;

-- Staff triage
create function private.feedback_queue(p_open boolean default true)
returns table (id uuid, type public.feedback_type, body text, status public.feedback_status, student_name text,
               student_username text, claimed_by_name text, claimed_by_me boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
begin
  return query
  select f.id, f.type, f.body, f.status, p.full_name, p.username, c.full_name, f.claimed_by = v_me, f.created_at
    from public.feedback f
    left join public.profiles p on p.user_id = f.user_id
    left join public.profiles c on c.user_id = f.claimed_by
   where case when p_open then f.status in ('received', 'reviewing', 'planned') else f.status in ('shipped', 'wont_do') end
   order by f.created_at
   limit 100;
end;
$$;
revoke all on function private.feedback_queue(boolean) from public;
grant execute on function private.feedback_queue(boolean) to authenticated;

create function private.feedback_case(p_id uuid)
returns table (id uuid, type public.feedback_type, body text, status public.feedback_status, staff_reply text,
               student_name text, student_username text, page text, device text, app_version text,
               screenshot_path text, claimed_by_name text, claimed_by_me boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
begin
  return query
  select f.id, f.type, f.body, f.status, f.staff_reply, p.full_name, p.username, f.page, f.device, f.app_version,
         f.screenshot_path, c.full_name, f.claimed_by = v_me, f.created_at
    from public.feedback f
    left join public.profiles p on p.user_id = f.user_id
    left join public.profiles c on c.user_id = f.claimed_by
   where f.id = p_id;
end;
$$;
revoke all on function private.feedback_case(uuid) from public;
grant execute on function private.feedback_case(uuid) to authenticated;

create function private.claim_feedback(p_id uuid, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  f public.feedback;
begin
  select * into f from public.feedback where id = p_id for update;
  if f.id is null then
    raise exception 'feedback not found' using errcode = 'P0002';
  end if;
  if p_claim then
    if f.claimed_by is not null and f.claimed_by <> v_me then
      raise exception 'someone else is handling this feedback' using errcode = '55000';
    end if;
    update public.feedback set claimed_by = v_me, claimed_at = now() where id = p_id;
  else
    if f.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this feedback' using errcode = '55000';
    end if;
    update public.feedback set claimed_by = null, claimed_at = null where id = p_id;
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_claim then 'feedback.claim' else 'feedback.release' end, 'feedback', p_id::text,
          case when p_claim then 'claimed to triage' else 'released' end,
          jsonb_build_object('claimed_by', f.claimed_by), jsonb_build_object('claimed_by', case when p_claim then v_me end));
end;
$$;
revoke all on function private.claim_feedback(uuid, boolean) from public;
grant execute on function private.claim_feedback(uuid, boolean) to authenticated;

-- Sets the status and an optional reply; the student is notified of any change.
create function private.respond_feedback(p_id uuid, p_status public.feedback_status, p_reply text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  f public.feedback;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select * into f from public.feedback where id = p_id for update;
  if f.id is null then
    raise exception 'feedback not found' using errcode = 'P0002';
  end if;
  if f.claimed_by is distinct from v_me then
    raise exception 'claim this feedback first' using errcode = '55000';
  end if;
  if v_reply is not null and char_length(v_reply) > 2000 then
    raise exception 'replies are up to 2,000 characters' using errcode = '23514';
  end if;
  if p_status = f.status and (v_reply is null or v_reply is not distinct from f.staff_reply) then
    raise exception 'nothing changed' using errcode = '55000';
  end if;
  update public.feedback
     set status = p_status,
         staff_reply = coalesce(v_reply, staff_reply),
         replied_at = case when v_reply is not null and v_reply is distinct from staff_reply then now() else replied_at end
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'feedback.respond', 'feedback', p_id::text, coalesce(v_reply, 'status change'),
          jsonb_build_object('status', f.status, 'reply', f.staff_reply), jsonb_build_object('status', p_status, 'reply', coalesce(v_reply, f.staff_reply)));
  perform private.notify(f.user_id, null, 'feedback_update', 'feedback', p_id,
                         jsonb_build_object('status', p_status, 'replied', v_reply is not null));
end;
$$;
revoke all on function private.respond_feedback(uuid, public.feedback_status, text) from public;
grant execute on function private.respond_feedback(uuid, public.feedback_status, text) to authenticated;

create function public.submit_feedback(p_type public.feedback_type, p_body text, p_screenshot text, p_page text,
                                       p_device text, p_version text)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.submit_feedback(p_type, p_body, p_screenshot, p_page, p_device, p_version) $$;
create function public.my_feedback()
returns table (id uuid, type public.feedback_type, body text, status public.feedback_status, staff_reply text,
               created_at timestamptz, replied_at timestamptz, has_screenshot boolean)
language sql stable security invoker set search_path = '' as $$ select * from private.my_feedback() $$;
create function public.feedback_queue(p_open boolean default true)
returns table (id uuid, type public.feedback_type, body text, status public.feedback_status, student_name text,
               student_username text, claimed_by_name text, claimed_by_me boolean, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.feedback_queue(p_open) $$;
create function public.feedback_case(p_id uuid)
returns table (id uuid, type public.feedback_type, body text, status public.feedback_status, staff_reply text,
               student_name text, student_username text, page text, device text, app_version text,
               screenshot_path text, claimed_by_name text, claimed_by_me boolean, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.feedback_case(p_id) $$;
create function public.claim_feedback(p_id uuid, p_claim boolean) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.claim_feedback(p_id, p_claim) $$;
create function public.respond_feedback(p_id uuid, p_status public.feedback_status, p_reply text) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.respond_feedback(p_id, p_status, p_reply) $$;

-- ---------------------------------------------------------------------------
-- Grants for every public wrapper: signed-in users only
-- ---------------------------------------------------------------------------
revoke all on function
  public.ops_batches(), public.ops_set_final_year_batch(uuid, smallint, text),
  public.request_account_deletion(), public.cancel_account_deletion(),
  public.set_ui_state(text, jsonb), public.tour_state(text), public.save_tour(text, integer, text),
  public.restart_tour(text), public.see_tip(text),
  public.nav_badges(), public.todo_counts(), public.next_best_action(), public.getting_started(),
  public.opportunities(text, integer),
  public.submit_feedback(public.feedback_type, text, text, text, text, text), public.my_feedback(),
  public.feedback_queue(boolean), public.feedback_case(uuid), public.claim_feedback(uuid, boolean),
  public.respond_feedback(uuid, public.feedback_status, text)
  from public, anon;
grant execute on function
  public.ops_batches(), public.ops_set_final_year_batch(uuid, smallint, text),
  public.request_account_deletion(), public.cancel_account_deletion(),
  public.set_ui_state(text, jsonb), public.tour_state(text), public.save_tour(text, integer, text),
  public.restart_tour(text), public.see_tip(text),
  public.nav_badges(), public.todo_counts(), public.next_best_action(), public.getting_started(),
  public.opportunities(text, integer),
  public.submit_feedback(public.feedback_type, text, text, text, text, text), public.my_feedback(),
  public.feedback_queue(boolean), public.feedback_case(uuid), public.claim_feedback(uuid, boolean),
  public.respond_feedback(uuid, public.feedback_status, text)
  to authenticated;
