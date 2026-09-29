-- Phase 3, slice 9: reports and a minimal /ops moderation queue (PRD 5.12, 5.26 queues
-- and moderation only; decisions.md 2026-09-28: dismiss, remove content and warn now,
-- suspend and ban in phase 11 with the emergency procedure until then).
--
-- Reports on posts, comments, messages, profiles and ventures: one per reporter and
-- target, 60 s between reports, a snapshot copied at report time, and for a message up
-- to 10 earlier messages the reporter chooses (copied too; staff never read a thread).
-- Reports on the same target form one case in the queue. Post reports raise
-- post_stats.reports (3 hold the post, slice 6); 3 Appropriate crosses from non-friends
-- open a soft-signal case. Moderators (two-factor) claim a case, then dismiss, remove the
-- content or warn its owner; every staff write lands in ops_audit_log with a reason.

create type public.report_target as enum ('post', 'comment', 'message', 'profile', 'venture');
create type public.report_reason as enum ('spam', 'harassment', 'inappropriate', 'misinformation', 'impersonation', 'other');
create type public.report_case_status as enum ('open', 'dismissed', 'removed', 'warned');
create type public.sanction_kind as enum ('warn', 'suspend', 'ban', 'throttle');

create table public.report_cases (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target not null,
  target_id uuid not null,
  owner_id uuid references auth.users (id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  reports integer not null default 0 check (reports >= 0),
  soft_signal boolean not null default false,
  status public.report_case_status not null default 'open',
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_reason text check (resolution_reason is null or char_length(resolution_reason) <= 2000),
  opened_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  unique (target_type, target_id),
  check ((status = 'open') = (resolved_at is null))
);
comment on table public.report_cases is 'Moderation queue: one case per reported target (PRD 5.12). Staff-only; written by functions.';
create index report_cases_queue_idx on public.report_cases (status, opened_at);
create index report_cases_owner_idx on public.report_cases (owner_id);
create index report_cases_claimed_by_idx on public.report_cases (claimed_by);
create index report_cases_resolved_by_idx on public.report_cases (resolved_by);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.report_cases (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
comment on table public.reports is 'One report per reporter and target (PRD 5.12). Written only by submit_report; staff read.';
create index reports_case_idx on public.reports (case_id, created_at);

-- The earlier messages a reporter attached, copied so a later edit or delete doesn't
-- erase the context (PRD 5.26: staff read chats only through this table).
create table public.report_messages (
  report_id uuid not null references public.reports (id) on delete cascade,
  message_id uuid not null,
  sender_id uuid references auth.users (id) on delete set null,
  body text not null,
  had_image boolean not null default false,
  sent_at timestamptz not null,
  is_reported boolean not null default false,
  primary key (report_id, message_id)
);
comment on table public.report_messages is 'Chat context attached to a report: the reported message and up to 10 earlier ones, as copies.';
create index report_messages_sender_idx on public.report_messages (sender_id);

create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.sanction_kind not null,
  until timestamptz,
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  staff_id uuid not null references auth.users (id) on delete restrict,
  case_id uuid references public.report_cases (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.sanctions is 'Warnings now; suspensions and bans in phase 11 (PRD 5.26). Written only by staff functions.';
create index sanctions_user_idx on public.sanctions (user_id, created_at desc);
create index sanctions_staff_idx on public.sanctions (staff_id);
create index sanctions_case_idx on public.sanctions (case_id);

alter table public.report_cases enable row level security;
alter table public.reports enable row level security;
alter table public.report_messages enable row level security;
alter table public.sanctions enable row level security;
revoke all on table public.report_cases, public.reports, public.report_messages, public.sanctions from anon, authenticated;
grant select on table public.report_cases, public.reports, public.report_messages, public.sanctions to authenticated;
-- Reporters see nothing back ("thanks, we'll review this"); moderators read everything.
create policy report_cases_staff_read on public.report_cases for select to authenticated
  using ((select private.is_staff('moderator')));
create policy reports_staff_read on public.reports for select to authenticated
  using ((select private.is_staff('moderator')));
create policy report_messages_staff_read on public.report_messages for select to authenticated
  using ((select private.is_staff('moderator')));
create policy sanctions_read on public.sanctions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff('moderator')));


-- ---------------------------------------------------------------------------
-- Removed content: hidden from everyone, the author included (PRD 5.12)
-- ---------------------------------------------------------------------------
alter table public.posts
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users (id) on delete set null;
create index posts_removed_by_idx on public.posts (removed_by);
alter table public.post_comments add column removed_by uuid references auth.users (id) on delete set null;
create index post_comments_removed_by_idx on public.post_comments (removed_by);
alter table public.chat_messages add column removed_by uuid references auth.users (id) on delete set null;
create index chat_messages_removed_by_idx on public.chat_messages (removed_by);

create or replace function private.can_view_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_post
       and p.removed_at is null
       and (
         p.author_id = (select auth.uid())
         or (
           (select auth.uid()) is not null
           and p.stage <> 'held'
           and not private.is_blocked_with(p.author_id)
           and (p.audience = 'global' or p.university_id = (select private.current_university_id()))
         )
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- Notifications to the owner (no staff name is shown)
-- ---------------------------------------------------------------------------
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  -- In-app by default: instant email stays for the four categories Ahmed chose (decisions.md 2026-09-28).
  ('account', 'Account and safety', 'Moderation decisions about your content and account.', 9, 'off', true);
insert into public.notification_types (type, category, emailed) values
  ('content_removed', 'account', true),
  ('moderation_warning', 'account', true);

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------
-- Opens (or reopens) the case for a target and returns it; a resolved case reopens when
-- a new report or signal arrives.
create function private.open_case(p_type public.report_target, p_target uuid, p_owner uuid, p_snapshot jsonb,
                                  p_report boolean, p_soft boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.report_cases (target_type, target_id, owner_id, snapshot, reports, soft_signal)
  values (p_type, p_target, p_owner, coalesce(p_snapshot, '{}'::jsonb), case when p_report then 1 else 0 end, p_soft)
  on conflict (target_type, target_id) do update
     set reports = public.report_cases.reports + case when p_report then 1 else 0 end,
         soft_signal = public.report_cases.soft_signal or p_soft,
         snapshot = case when excluded.snapshot = '{}'::jsonb then public.report_cases.snapshot else excluded.snapshot end,
         last_reported_at = now(),
         status = 'open', resolved_at = null, resolved_by = null, resolution_reason = null,
         claimed_by = case when public.report_cases.status = 'open' then public.report_cases.claimed_by end,
         claimed_at = case when public.report_cases.status = 'open' then public.report_cases.claimed_at end,
         opened_at = case when public.report_cases.status = 'open' then public.report_cases.opened_at else now() end
  returning id into v_id;
  return v_id;
end;
$$;

-- What the reporter saw, copied now so removed content stays reviewable.
create function private.report_snapshot(p_type public.report_target, p_target uuid)
returns table (owner_id uuid, snapshot jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select p.author_id, jsonb_build_object('body', p.body, 'type', p.type, 'audience', p.audience, 'author', a.full_name,
                                         'author_username', a.username, 'created_at', p.created_at,
                                         'images', (select count(*) from public.post_media m where m.post_id = p.id))
    from public.posts p join public.profiles a on a.user_id = p.author_id
   where p_type = 'post' and p.id = p_target
  union all
  select c.author_id, jsonb_build_object('body', c.body, 'post_id', c.post_id, 'author', a.full_name,
                                         'author_username', a.username, 'created_at', c.created_at)
    from public.post_comments c join public.profiles a on a.user_id = c.author_id
   where p_type = 'comment' and c.id = p_target
  union all
  select m.sender_id, jsonb_build_object('body', m.body, 'thread_type', t.type, 'author', a.full_name,
                                         'author_username', a.username, 'created_at', m.created_at, 'had_image', m.media_path is not null)
    from public.chat_messages m join public.chat_threads t on t.id = m.thread_id join public.profiles a on a.user_id = m.sender_id
   where p_type = 'message' and m.id = p_target
  union all
  select p.user_id, jsonb_build_object('author', p.full_name, 'author_username', p.username, 'bio', p.bio,
                                       'department', p.department, 'had_avatar', p.avatar_path is not null)
    from public.profiles p
   where p_type = 'profile' and p.user_id = p_target
  union all
  select v.owner_id, jsonb_build_object('title', v.title, 'body', v.description, 'venture_type', v.type,
                                        'author', o.full_name, 'author_username', o.username, 'created_at', v.created_at)
    from public.ventures v join public.profiles o on o.user_id = v.owner_id
   where p_type = 'venture' and v.id = p_target;
$$;

-- Whether the caller can see the thing they're reporting.
create function private.can_report(p_type public.report_target, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'post' then private.can_view_post(p_target)
    when 'comment' then exists (select 1 from public.post_comments c
                                 where c.id = p_target and c.deleted_at is null and private.can_view_post(c.post_id))
    when 'message' then exists (select 1 from public.chat_messages m
                                 where m.id = p_target and m.deleted_at is null
                                   and private.is_thread_member(m.thread_id) and not private.dm_blocked(m.thread_id))
    when 'profile' then exists (select 1 from public.profiles p where p.user_id = p_target and p.onboarding_complete)
    when 'venture' then private.can_view_venture(p_target)
  end;
$$;

create function private.submit_report(p_type public.report_target, p_target uuid, p_reason public.report_reason,
                                      p_detail text default null, p_messages uuid[] default '{}')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid;
  v_snapshot jsonb;
  v_case uuid;
  v_report uuid;
  v_msg public.chat_messages;
  v_attached integer;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_type is null or p_target is null or p_reason is null then
    raise exception 'choose a reason' using errcode = '22023';
  end if;
  if char_length(coalesce(p_detail, '')) > 500 then
    raise exception 'details are up to 500 characters' using errcode = '23514';
  end if;
  if not coalesce(private.can_report(p_type, p_target), false) then
    raise exception 'that isn''t available to report' using errcode = 'P0002';
  end if;
  select s.owner_id, s.snapshot into v_owner, v_snapshot from private.report_snapshot(p_type, p_target) s;
  if v_owner = v_me then
    raise exception 'you can''t report your own content' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_messages, '{}')) > 10 then
    raise exception 'attach up to 10 earlier messages' using errcode = '23514';
  end if;
  if cardinality(coalesce(p_messages, '{}')) > 0 and p_type <> 'message' then
    raise exception 'earlier messages go with a message report' using errcode = '22023';
  end if;
  if p_type = 'message' then
    select * into v_msg from public.chat_messages where id = p_target;
    select count(*) into v_attached
      from public.chat_messages m
     where m.id = any (p_messages) and m.thread_id = v_msg.thread_id and m.created_at < v_msg.created_at and m.deleted_at is null;
    if v_attached <> cardinality(coalesce(p_messages, '{}')) then
      raise exception 'attach only earlier messages from the same chat' using errcode = '22023';
    end if;
  end if;
  if exists (select 1 from public.reports r where r.reporter_id = v_me and r.target_type = p_type and r.target_id = p_target) then
    raise exception 'you''ve already reported this; we''ll review it' using errcode = '23505';
  end if;
  if not private.rate_limit('report:' || v_me::text, 1, interval '60 seconds') then
    raise exception 'wait a minute before sending another report' using errcode = '54000';
  end if;

  v_case := private.open_case(p_type, p_target, v_owner, v_snapshot, true);
  insert into public.reports (case_id, reporter_id, target_type, target_id, reason, detail)
  values (v_case, v_me, p_type, p_target, p_reason, nullif(btrim(coalesce(p_detail, '')), ''))
  returning id into v_report;

  if p_type = 'message' then
    insert into public.report_messages (report_id, message_id, sender_id, body, had_image, sent_at, is_reported)
    select v_report, m.id, m.sender_id, m.body, m.media_path is not null, m.created_at, m.id = p_target
      from public.chat_messages m
     where m.id = p_target or m.id = any (coalesce(p_messages, '{}'));
  end if;

  -- Distinct reporters on a post count toward Held (slice 6 trigger on post_stats).
  if p_type = 'post' then
    update public.post_stats set reports = reports + 1, updated_at = now() where post_id = p_target;
  end if;
end;
$$;

-- Soft signal: enough Appropriate crosses from non-friends put the post in the queue.
create function private.appropriate_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min integer := coalesce((private.config('survey.appropriate_flag_min') #>> '{}')::integer, 3);
  s record;
begin
  if new.appropriate_flags >= v_min and coalesce(old.appropriate_flags, 0) < v_min then
    select * into s from private.report_snapshot('post', new.post_id);
    perform private.open_case('post', new.post_id, s.owner_id, s.snapshot, false, true);
  end if;
  return null;
end;
$$;
create trigger post_stats_appropriate_signal after update of appropriate_flags on public.post_stats
  for each row execute function private.appropriate_signal();

-- ---------------------------------------------------------------------------
-- Staff: queue, case, claim, resolve (moderator with two-factor; audited)
-- ---------------------------------------------------------------------------
create function private.require_moderator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('moderator') then
    raise exception 'moderators only, with two-factor on' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;

create function private.ops_queue(p_status text default 'open')
returns table (id uuid, target_type public.report_target, reports integer, soft_signal boolean,
               reasons public.report_reason[], excerpt text, owner_name text, status public.report_case_status,
               claimed_by_name text, claimed_by_me boolean, opened_at timestamptz, last_reported_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_moderator();
  return query
  select c.id, c.target_type, c.reports, c.soft_signal,
         array(select distinct r.reason from public.reports r where r.case_id = c.id order by r.reason),
         left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 160),
         o.full_name, c.status, cb.full_name, c.claimed_by = (select auth.uid()), c.opened_at, c.last_reported_at
    from public.report_cases c
    left join public.profiles o on o.user_id = c.owner_id
    left join public.profiles cb on cb.user_id = c.claimed_by
   where (coalesce(p_status, 'open') = 'open' and c.status = 'open')
      or (p_status = 'resolved' and c.status <> 'open')
   order by case when c.status = 'open' then c.opened_at end asc nulls last, c.resolved_at desc nulls last
   limit 200;
end;
$$;

-- One case with its reports, attached chat context and the owner's history.
create function private.ops_case(p_case uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.report_cases;
begin
  perform private.require_moderator();
  select * into c from public.report_cases where id = p_case;
  if c.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', c.id, 'target_type', c.target_type, 'target_id', c.target_id, 'snapshot', c.snapshot,
    'reports_count', c.reports, 'soft_signal', c.soft_signal, 'status', c.status,
    'opened_at', c.opened_at, 'resolved_at', c.resolved_at, 'resolution_reason', c.resolution_reason,
    'resolved_by', (select full_name from public.profiles where user_id = c.resolved_by),
    'claimed_by', (select full_name from public.profiles where user_id = c.claimed_by),
    'claimed_by_me', c.claimed_by = (select auth.uid()),
    'owner', (select jsonb_build_object('name', p.full_name, 'username', p.username,
                'cases', (select count(*) from public.report_cases x where x.owner_id = c.owner_id and x.id <> c.id),
                'actioned', (select count(*) from public.report_cases x where x.owner_id = c.owner_id and x.status in ('removed', 'warned')),
                'warnings', (select count(*) from public.sanctions s where s.user_id = c.owner_id and s.kind = 'warn'))
                from public.profiles p where p.user_id = c.owner_id),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
                  'reason', r.reason, 'detail', r.detail, 'created_at', r.created_at, 'reporter', rp.full_name,
                  'reporter_reports', (select count(*) from public.reports y where y.reporter_id = r.reporter_id),
                  'reporter_upheld', (select count(*) from public.reports y join public.report_cases yc on yc.id = y.case_id
                                       where y.reporter_id = r.reporter_id and yc.status in ('removed', 'warned')))
                  order by r.created_at)
                  from public.reports r join public.profiles rp on rp.user_id = r.reporter_id where r.case_id = c.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
                  'message_id', m.message_id, 'body', m.body, 'had_image', m.had_image, 'sent_at', m.sent_at,
                  'is_reported', m.is_reported, 'sender', sp.full_name)
                  order by m.sent_at)
                  from (select distinct on (rm.message_id) rm.* from public.report_messages rm
                          join public.reports r on r.id = rm.report_id where r.case_id = c.id
                         order by rm.message_id) m
                  left join public.profiles sp on sp.user_id = m.sender_id), '[]'::jsonb)
  );
end;
$$;

create function private.claim_case(p_case uuid, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_moderator();
  c public.report_cases;
begin
  select * into c from public.report_cases where id = p_case for update;
  if c.id is null or c.status <> 'open' then
    raise exception 'this case is closed' using errcode = '55000';
  end if;
  if p_claim then
    if c.claimed_by is not null and c.claimed_by <> v_me then
      raise exception 'someone else is working on this case' using errcode = '55000';
    end if;
    update public.report_cases set claimed_by = v_me, claimed_at = now() where id = p_case;
  else
    if c.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this case' using errcode = '55000';
    end if;
    update public.report_cases set claimed_by = null, claimed_at = null where id = p_case;
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_claim then 'report.claim' else 'report.release' end, 'report_case', p_case::text,
          case when p_claim then 'claimed to review' else 'released' end,
          jsonb_build_object('claimed_by', c.claimed_by), jsonb_build_object('claimed_by', case when p_claim then v_me end));
end;
$$;

-- Dismiss, remove the content, or warn its owner. The case must be claimed by the caller.
create function private.resolve_case(p_case uuid, p_action text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_moderator();
  c public.report_cases;
  v_status public.report_case_status;
  v_before jsonb;
  v_after jsonb := '{}'::jsonb;
  v_thread uuid;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '23514';
  end if;
  select * into c from public.report_cases where id = p_case for update;
  if c.id is null or c.status <> 'open' then
    raise exception 'this case is already closed' using errcode = '55000';
  end if;
  if c.claimed_by is distinct from v_me then
    raise exception 'claim the case first' using errcode = '55000';
  end if;
  v_before := jsonb_build_object('status', c.status, 'target_type', c.target_type, 'target_id', c.target_id);

  if p_action = 'dismiss' then
    v_status := 'dismissed';
    -- A post held by reports goes back to its computed stage.
    if c.target_type = 'post' then
      update public.post_stats set reports = 0, updated_at = now() where post_id = c.target_id;
      update public.posts p set stage = coalesce(private.compute_stage(p.id), 'seed'), stage_changed_at = now()
       where p.id = c.target_id and p.stage = 'held';
    end if;
  elsif p_action = 'remove' then
    v_status := 'removed';
    if c.target_type = 'post' then
      update public.posts set removed_at = now(), removed_by = v_me where id = c.target_id and removed_at is null;
    elsif c.target_type = 'comment' then
      update public.post_comments set deleted_at = coalesce(deleted_at, now()), body = '', pinned = false, removed_by = v_me
       where id = c.target_id;
    elsif c.target_type = 'message' then
      update public.chat_messages
         set deleted_at = coalesce(deleted_at, now()), body = '', media_path = null, media_width = null, media_height = null,
             removed_by = v_me
       where id = c.target_id
      returning thread_id into v_thread;
      delete from public.chat_pins where message_id = c.target_id;
    else
      raise exception 'profiles and ventures can''t be removed here; warn the owner instead' using errcode = '22023';
    end if;
    v_after := jsonb_build_object('removed', true);
    perform private.notify(c.owner_id, null, 'content_removed', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'excerpt', left(coalesce(c.snapshot->>'body', ''), 120)));
  elsif p_action = 'warn' then
    v_status := 'warned';
    if c.owner_id is null then
      raise exception 'there''s no one to warn' using errcode = '22023';
    end if;
    insert into public.sanctions (user_id, kind, reason, staff_id, case_id) values (c.owner_id, 'warn', btrim(p_reason), v_me, c.id);
    perform private.notify(c.owner_id, null, 'moderation_warning', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  else
    raise exception 'choose dismiss, remove or warn' using errcode = '22023';
  end if;

  update public.report_cases
     set status = v_status, resolved_by = v_me, resolved_at = now(), resolution_reason = btrim(p_reason)
   where id = p_case;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'report.' || p_action, 'report_case', p_case::text, btrim(p_reason), v_before,
          v_after || jsonb_build_object('status', v_status));
end;
$$;

-- For the owner: what a moderation notification refers to (never who reported or acted).
create function private.my_moderation_notice(p_case uuid)
returns table (target_type public.report_target, excerpt text, status public.report_case_status, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.target_type, left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 200), c.status, c.resolution_reason
    from public.report_cases c
   where c.id = p_case and c.owner_id = (select auth.uid()) and c.status in ('removed', 'warned');
$$;

revoke all on function private.open_case(public.report_target, uuid, uuid, jsonb, boolean, boolean),
  private.report_snapshot(public.report_target, uuid), private.appropriate_signal() from public;
revoke all on function private.can_report(public.report_target, uuid),
  private.submit_report(public.report_target, uuid, public.report_reason, text, uuid[]),
  private.require_moderator(), private.ops_queue(text), private.ops_case(uuid), private.claim_case(uuid, boolean),
  private.resolve_case(uuid, text, text), private.my_moderation_notice(uuid) from public;
grant execute on function private.can_report(public.report_target, uuid),
  private.submit_report(public.report_target, uuid, public.report_reason, text, uuid[]),
  private.require_moderator(), private.ops_queue(text), private.ops_case(uuid), private.claim_case(uuid, boolean),
  private.resolve_case(uuid, text, text), private.my_moderation_notice(uuid) to authenticated;

create function public.submit_report(p_type public.report_target, p_target uuid, p_reason public.report_reason,
                                     p_detail text default null, p_messages uuid[] default '{}') returns void
  language sql volatile security invoker set search_path = ''
  as $$ select private.submit_report(p_type, p_target, p_reason, p_detail, p_messages) $$;
create function public.ops_queue(p_status text default 'open')
returns table (id uuid, target_type public.report_target, reports integer, soft_signal boolean,
               reasons public.report_reason[], excerpt text, owner_name text, status public.report_case_status,
               claimed_by_name text, claimed_by_me boolean, opened_at timestamptz, last_reported_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.ops_queue(p_status) $$;
create function public.ops_case(p_case uuid) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.ops_case(p_case) $$;
create function public.claim_case(p_case uuid, p_claim boolean) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.claim_case(p_case, p_claim) $$;
create function public.resolve_case(p_case uuid, p_action text, p_reason text) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.resolve_case(p_case, p_action, p_reason) $$;
create function public.my_moderation_notice(p_case uuid)
returns table (target_type public.report_target, excerpt text, status public.report_case_status, reason text)
  language sql stable security invoker set search_path = '' as $$ select * from private.my_moderation_notice(p_case) $$;

revoke all on function public.submit_report(public.report_target, uuid, public.report_reason, text, uuid[]),
  public.ops_queue(text), public.ops_case(uuid), public.claim_case(uuid, boolean), public.resolve_case(uuid, text, text),
  public.my_moderation_notice(uuid) from public, anon;
grant execute on function public.submit_report(public.report_target, uuid, public.report_reason, text, uuid[]),
  public.ops_queue(text), public.ops_case(uuid), public.claim_case(uuid, boolean), public.resolve_case(uuid, text, text),
  public.my_moderation_notice(uuid) to authenticated;

-- The restricted card also carries the user id, so a card can be reported (Explore
-- already lists card-level rows with ids).
drop function public.get_profile_card(text);
drop function private.get_profile_card(text);
create function private.get_profile_card(p_username text)
returns table (user_id uuid, username text, full_name text, department text, graduation_year smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id, c.username, c.full_name, c.department, c.graduation_year
    from public.profiles_public_card c
   where (select auth.uid()) is not null
     and c.username = lower(btrim(p_username))
     and not private.is_blocked_with(c.user_id);
$$;
revoke all on function private.get_profile_card(text) from public;
grant execute on function private.get_profile_card(text) to authenticated;
create function public.get_profile_card(p_username text)
returns table (user_id uuid, username text, full_name text, department text, graduation_year smallint)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_profile_card(p_username);
$$;
revoke all on function public.get_profile_card(text) from public, anon;
grant execute on function public.get_profile_card(text) to authenticated;
