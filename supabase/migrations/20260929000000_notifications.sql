-- Phase 3, slice 2: notifications (PRD 5.11; decisions.md 2026-09-28).
-- Notifications are written only by triggers (security definer, in `private`); users read
-- and mark their own through RLS and functions. Email follows a per-category preference:
-- instant (only four categories may), daily digest, or off. Instant emails and digests
-- go through the pgmq queue `notification_emails`, drained by the notify-worker Edge
-- Function (Resend), which pg_cron wakes each minute while there is work.

-- ---------------------------------------------------------------------------
-- Types and categories (a lookup table, so later slices add types with an insert)
-- ---------------------------------------------------------------------------
create type public.email_channel as enum ('instant_email', 'digest', 'off');

create table public.notification_categories (
  category text primary key check (category ~ '^[a-z_]{2,40}$'),
  label text not null,
  description text not null,
  position smallint not null,
  default_channel public.email_channel not null,
  -- Resend's free plan (~100/day): only friend requests, applications, invites and
  -- ownership transfers may email instantly (Ahmed, 2026-09-28).
  allow_instant boolean not null default false,
  check (default_channel <> 'instant_email' or allow_instant)
);
comment on table public.notification_categories is
  'Groups of notification types; email preferences are set per category.';

create table public.notification_types (
  type text primary key check (type ~ '^[a-z_]{2,40}$'),
  category text not null references public.notification_categories (category),
  -- Whether this type is ever emailed (instant or digest). Confirmations such as "your
  -- request was accepted" stay in-app so the daily budget goes to things that need action.
  emailed boolean not null default true
);
create index notification_types_category_idx on public.notification_types (category);

insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('friend_requests', 'Friend requests', 'Someone asks to be your friend.', 1, 'instant_email', true),
  ('applications', 'Applications', 'Applications to your ventures, and decisions on yours.', 2, 'instant_email', true),
  ('invites', 'Venture invites', 'An owner invites you to join their team.', 3, 'instant_email', true),
  ('ownership', 'Ownership transfers', 'A venture is handed over to you.', 4, 'instant_email', true),
  ('team', 'Your teams', 'People joining or leaving your ventures, and ventures completing.', 5, 'off', false);

insert into public.notification_types (type, category, emailed) values
  ('friend_request', 'friend_requests', true),
  ('friend_accepted', 'friend_requests', false),
  ('application_received', 'applications', true),
  ('application_decided', 'applications', true),
  ('application_withdrawn', 'applications', false),
  ('invite_received', 'invites', true),
  ('invite_answered', 'invites', false),
  ('ownership_transferred', 'ownership', true),
  ('member_left', 'team', true),
  ('member_removed', 'team', true),
  ('venture_completed', 'team', true),
  ('venture_abandoned', 'team', true);

-- ---------------------------------------------------------------------------
-- Notifications and preferences
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null references public.notification_types (type),
  entity_type text not null check (char_length(entity_type) between 1 and 40),
  entity_id uuid not null,
  -- Snapshot for rendering (e.g. the venture title and id), never secrets.
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (actor_id is null or actor_id <> user_id)
);
comment on table public.notifications is
  'In-app notifications (PRD 5.11). Inserted only by trigger functions; users read and mark their own.';
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_actor_idx on public.notifications (actor_id);
create index notifications_type_idx on public.notifications (type);
create index notifications_entity_idx on public.notifications (entity_type, entity_id);

create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null references public.notification_categories (category),
  channel public.email_channel not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
comment on table public.notification_prefs is 'Email channel per category; a missing row means the category default.';
create index notification_prefs_category_idx on public.notification_prefs (category);

-- Last time each user was active (throttled to one write an hour) and their last digest:
-- the digest goes only to people with unread activity who weren't active in 24 hours.
create table private.user_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_active_at timestamptz not null default now(),
  last_digest_at timestamptz
);
alter table private.user_activity enable row level security;

-- Every email the worker sends, for the daily budget warning (Resend free plan).
create table private.email_sends (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('instant', 'digest')),
  user_id uuid references auth.users (id) on delete set null,
  notification_id uuid,
  resend_id text,
  sent_at timestamptz not null default now()
);
create index email_sends_sent_at_idx on private.email_sends (sent_at);
create index email_sends_user_idx on private.email_sends (user_id);
alter table private.email_sends enable row level security;

create extension if not exists pgmq;
select pgmq.create('notification_emails');

-- ---------------------------------------------------------------------------
-- RLS: reads only; marking read and preferences go through functions below
-- ---------------------------------------------------------------------------
alter table public.notification_categories enable row level security;
alter table public.notification_types enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
revoke all on table public.notification_categories, public.notification_types, public.notifications,
  public.notification_prefs from anon, authenticated;
grant select on table public.notification_categories, public.notification_types, public.notifications,
  public.notification_prefs to authenticated;

create policy notification_categories_read on public.notification_categories for select to authenticated using (true);
create policy notification_types_read on public.notification_types for select to authenticated using (true);
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_prefs_read_own on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

-- The bell listens for its owner's new rows (RLS applies to the stream).
alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Writing notifications (trigger functions only)
-- ---------------------------------------------------------------------------
create function private.email_channel_for(p_user uuid, p_type text)
returns public.email_channel
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when not t.emailed then 'off'::public.email_channel
           -- A stored instant preference on a category that may no longer email instantly
           -- falls back to the digest.
           when coalesce(p.channel, c.default_channel) = 'instant_email' and not c.allow_instant
             then 'digest'::public.email_channel
           else coalesce(p.channel, c.default_channel)
         end
    from public.notification_types t
    join public.notification_categories c on c.category = t.category
    left join public.notification_prefs p on p.user_id = p_user and p.category = t.category
   where t.type = p_type;
$$;
revoke all on function private.email_channel_for(uuid, text) from public;

-- The one place notifications are created. Skips self-notifications and pairs with a
-- block between them; queues an instant email when the recipient wants one.
create function private.notify(p_user uuid, p_actor uuid, p_type text, p_entity_type text, p_entity_id uuid,
                               p_data jsonb default '{}'::jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user is null or p_user = p_actor then
    return null;
  end if;
  if p_actor is not null and private.is_blocked(p_user, p_actor) then
    return null;
  end if;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, data)
  values (p_user, p_actor, p_type, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  if private.email_channel_for(p_user, p_type) = 'instant_email' then
    perform pgmq.send('notification_emails', jsonb_build_object('kind', 'instant', 'notification_id', v_id));
  end if;
  return v_id;
end;
$$;
revoke all on function private.notify(uuid, uuid, text, text, uuid, jsonb) from public;

create function private.venture_data(p_venture uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('venture_id', v.id, 'venture_title', v.title) from public.ventures v where v.id = p_venture;
$$;
revoke all on function private.venture_data(uuid) from public;

-- Friend requests: sent → receiver; accepted → sender. A cancelled request takes its
-- unread notification with it.
create function private.notify_friend_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.notify(new.receiver_id, new.sender_id, 'friend_request', 'friend_request', new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform private.notify(new.sender_id, new.receiver_id, 'friend_accepted', 'friend_request', new.id);
  elsif tg_op = 'DELETE' and old.status = 'pending' then
    delete from public.notifications n
     where n.entity_type = 'friend_request' and n.entity_id = old.id and n.type = 'friend_request' and n.read_at is null;
  end if;
  return null;
end;
$$;
revoke all on function private.notify_friend_requests() from public;
create trigger friend_requests_notify after insert or update of status or delete on public.friend_requests
  for each row execute function private.notify_friend_requests();

-- Applications: received → owner; accepted/declined/closed → candidate; withdrawn → owner.
create function private.notify_applications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.owner_id, new.candidate_id, 'application_received', 'application', new.id,
                           private.venture_data(new.venture_id));
  elsif old.status = 'pending' and new.status in ('accepted', 'declined', 'closed') then
    perform private.notify(new.candidate_id, case when new.status = 'closed' then null else new.owner_id end,
                           'application_decided', 'application', new.id,
                           private.venture_data(new.venture_id) || jsonb_build_object('status', new.status));
  elsif old.status = 'pending' and new.status = 'withdrawn' then
    perform private.notify(new.owner_id, new.candidate_id, 'application_withdrawn', 'application', new.id,
                           private.venture_data(new.venture_id));
  end if;
  return null;
end;
$$;
revoke all on function private.notify_applications() from public;
create trigger application_threads_notify after insert or update of status on public.application_threads
  for each row execute function private.notify_applications();

-- Invites: received → invitee; accepted/declined → inviter; revoked → the unread invite goes.
create function private.notify_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.notify(new.invitee_id, new.inviter_id, 'invite_received', 'venture_invite', new.id,
                           private.venture_data(new.venture_id));
  elsif old.status = 'pending' and new.status in ('accepted', 'declined') then
    perform private.notify(new.inviter_id, new.invitee_id, 'invite_answered', 'venture_invite', new.id,
                           private.venture_data(new.venture_id) || jsonb_build_object('status', new.status));
  elsif old.status = 'pending' and new.status = 'revoked' then
    delete from public.notifications n
     where n.entity_type = 'venture_invite' and n.entity_id = new.id and n.read_at is null;
  end if;
  return null;
end;
$$;
revoke all on function private.notify_invites() from public;
create trigger venture_invites_notify after insert or update of status on public.venture_invites
  for each row execute function private.notify_invites();

-- Ownership and lifecycle: the new owner (and the old one, when someone else made the
-- change); completion or abandonment → every other member.
create function private.notify_venture_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  m record;
begin
  if new.owner_id is distinct from old.owner_id then
    perform private.notify(new.owner_id, coalesce(v_actor, old.owner_id), 'ownership_transferred', 'venture', new.id,
                           private.venture_data(new.id) || jsonb_build_object('role', 'new_owner'));
    perform private.notify(old.owner_id, v_actor, 'ownership_transferred', 'venture', new.id,
                           private.venture_data(new.id) || jsonb_build_object('role', 'old_owner'));
  end if;
  if new.status is distinct from old.status and new.status in ('completed', 'abandoned') then
    for m in select vm.user_id from public.venture_members vm where vm.venture_id = new.id loop
      perform private.notify(m.user_id, v_actor,
                             case when new.status = 'completed' then 'venture_completed' else 'venture_abandoned' end,
                             'venture', new.id, private.venture_data(new.id));
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.notify_venture_changes() from public;
create trigger ventures_notify after update of owner_id, status on public.ventures
  for each row execute function private.notify_venture_changes();

-- Leaving → the owner hears; being removed → the member hears.
create function private.notify_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_owner uuid;
begin
  select v.owner_id into v_owner from public.ventures v where v.id = old.venture_id;
  if v_owner is null then
    return null; -- the venture itself is being deleted
  end if;
  if v_actor = old.user_id then
    perform private.notify(v_owner, old.user_id, 'member_left', 'venture', old.venture_id,
                           private.venture_data(old.venture_id));
  else
    perform private.notify(old.user_id, v_actor, 'member_removed', 'venture', old.venture_id,
                           private.venture_data(old.venture_id));
  end if;
  return null;
end;
$$;
revoke all on function private.notify_member_removed() from public;
create trigger venture_members_notify after delete on public.venture_members
  for each row execute function private.notify_member_removed();

-- ---------------------------------------------------------------------------
-- Reading and marking (the caller's own only)
-- ---------------------------------------------------------------------------
-- Latest first, 50 a page, with the actor's card. A photo only where the actor's profile
-- is visible; notifications from someone you've since blocked (or who blocked you) are
-- left out.
create function private.my_notifications(p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, type text, category text, actor_username text, actor_name text, actor_avatar_path text,
               entity_type text, entity_id uuid, data jsonb, read_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.type, t.category,
         case when private.can_view_profile(n.actor_id) then p.username end,
         p.full_name,
         case when private.can_view_profile(n.actor_id) then p.avatar_path end,
         n.entity_type, n.entity_id, n.data, n.read_at, n.created_at
    from public.notifications n
    join public.notification_types t on t.type = n.type
    left join public.profiles p on p.user_id = n.actor_id
   where n.user_id = (select auth.uid())
     and (p_before is null or n.created_at < p_before)
     and (n.actor_id is null or not private.is_blocked_with(n.actor_id))
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 50);
$$;

create function private.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications n
   where n.user_id = (select auth.uid()) and n.read_at is null
     and (n.actor_id is null or not private.is_blocked_with(n.actor_id));
$$;

create function private.mark_notification_read(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.notifications set read_at = coalesce(read_at, now())
   where id = p_id and user_id = (select auth.uid());
  if not found then
    raise exception 'that notification doesn''t exist' using errcode = 'P0002';
  end if;
end;
$$;

create function private.mark_all_notifications_read()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.notifications set read_at = now()
   where user_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Every category with the caller's channel and what they may choose.
create function private.my_notification_settings()
returns table (category text, label text, description text, channel public.email_channel, allow_instant boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.category, c.label, c.description,
         case when coalesce(p.channel, c.default_channel) = 'instant_email' and not c.allow_instant
              then 'digest'::public.email_channel
              else coalesce(p.channel, c.default_channel) end,
         c.allow_instant
    from public.notification_categories c
    left join public.notification_prefs p on p.category = c.category and p.user_id = (select auth.uid())
   where (select auth.uid()) is not null
   order by c.position;
$$;

create function private.set_notification_pref(p_category text, p_channel public.email_channel)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_allow boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select c.allow_instant into v_allow from public.notification_categories c where c.category = p_category;
  if not found then
    raise exception 'unknown notification category' using errcode = 'P0002';
  end if;
  if p_channel = 'instant_email' and not v_allow then
    raise exception 'this kind of notification can''t be emailed instantly; choose the daily digest' using errcode = '22023';
  end if;
  insert into public.notification_prefs (user_id, category, channel)
  values ((select auth.uid()), p_category, p_channel)
  on conflict (user_id, category) do update set channel = excluded.channel, updated_at = now();
end;
$$;

-- Called from the signed-in layout: at most one write an hour per user.
create function private.touch_activity()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.user_activity (user_id) select (select auth.uid()) where (select auth.uid()) is not null
  on conflict (user_id) do update set last_active_at = now()
   where private.user_activity.last_active_at < now() - interval '1 hour';
$$;

revoke all on function private.my_notifications(timestamptz, integer), private.unread_notification_count(),
  private.mark_notification_read(uuid), private.mark_all_notifications_read(), private.my_notification_settings(),
  private.set_notification_pref(text, public.email_channel), private.touch_activity() from public;
grant execute on function private.my_notifications(timestamptz, integer), private.unread_notification_count(),
  private.mark_notification_read(uuid), private.mark_all_notifications_read(), private.my_notification_settings(),
  private.set_notification_pref(text, public.email_channel), private.touch_activity() to authenticated;

create function public.my_notifications(p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, type text, category text, actor_username text, actor_name text, actor_avatar_path text,
               entity_type text, entity_id uuid, data jsonb, read_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.my_notifications(p_before, p_limit) $$;

create function public.unread_notification_count()
returns integer
language sql stable security invoker set search_path = ''
as $$ select private.unread_notification_count() $$;

create function public.mark_notification_read(p_id uuid)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.mark_notification_read(p_id) $$;

create function public.mark_all_notifications_read()
returns integer
language sql volatile security invoker set search_path = ''
as $$ select private.mark_all_notifications_read() $$;

create function public.my_notification_settings()
returns table (category text, label text, description text, channel public.email_channel, allow_instant boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.my_notification_settings() $$;

create function public.set_notification_pref(p_category text, p_channel public.email_channel)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.set_notification_pref(p_category, p_channel) $$;

create function public.touch_activity()
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.touch_activity() $$;

revoke all on function public.my_notifications(timestamptz, integer), public.unread_notification_count(),
  public.mark_notification_read(uuid), public.mark_all_notifications_read(), public.my_notification_settings(),
  public.set_notification_pref(text, public.email_channel), public.touch_activity() from public, anon;
grant execute on function public.my_notifications(timestamptz, integer), public.unread_notification_count(),
  public.mark_notification_read(uuid), public.mark_all_notifications_read(), public.my_notification_settings(),
  public.set_notification_pref(text, public.email_channel), public.touch_activity() to authenticated;

-- ---------------------------------------------------------------------------
-- Email: digest queueing, worker wake-up, housekeeping
-- ---------------------------------------------------------------------------
-- Once a day: everyone with unread, emailable digest notifications since their last
-- digest who hasn't been active for 24 hours. Never an empty digest (the worker also
-- re-checks before sending).
create function private.queue_notification_digests()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select distinct n.user_id
      from public.notifications n
      left join private.user_activity a on a.user_id = n.user_id
     where n.read_at is null
       and private.email_channel_for(n.user_id, n.type) = 'digest'
       and n.created_at > coalesce(a.last_digest_at, '-infinity'::timestamptz)
       and coalesce(a.last_active_at, '-infinity'::timestamptz) < now() - interval '24 hours'
  )
  select count(*) into v_count
    from due, lateral pgmq.send('notification_emails', jsonb_build_object('kind', 'digest', 'user_id', due.user_id));
  return v_count;
end;
$$;
revoke all on function private.queue_notification_digests() from public;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'notify_worker_secret',
  'Bearer secret pg_cron uses to wake the notify-worker Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'notify_worker_secret');

-- Needs the Vault secret `project_url` (set once for the GitHub worker); a no-op without it.
create function private.wake_notify_worker()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from pgmq.q_notification_emails where vt <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/notify-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function private.wake_notify_worker() from public;

-- Read notifications go after 90 days, unread after a year; the send log after 60 days.
create function private.purge_notifications()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.notifications
   where (read_at is not null and created_at < now() - interval '90 days')
      or created_at < now() - interval '365 days';
  delete from private.email_sends where sent_at < now() - interval '60 days';
$$;
revoke all on function private.purge_notifications() from public;

select cron.schedule('notify-worker', '* * * * *', $$select private.wake_notify_worker()$$);
-- 18:07 Pakistan time (13:07 UTC): after classes, before the evening.
select cron.schedule('notification-digest', '7 13 * * *', $$select private.queue_notification_digests()$$);
select cron.schedule('purge-notifications', '23 3 * * *', $$select private.purge_notifications()$$);
