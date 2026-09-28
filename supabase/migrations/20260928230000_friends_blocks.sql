-- Phase 3, slice 1: friends and blocks (PRD 5.8, 8; decisions.md 2026-09-28).
-- Replaces the phase 1 stubs private.is_friend_of() / private.is_blocked_with(), so every
-- policy and function that already calls them (profiles, cards, ventures, team cards,
-- application_people) starts honouring friendships and blocks in both directions.
-- Also creates ops_audit_log, so the emergency-ban procedure (docs/emergency-ban.md) has
-- somewhere to record staff actions before /ops arrives.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create type public.friend_request_status as enum ('pending', 'accepted', 'declined');

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (user_id) on delete cascade,
  receiver_id uuid not null references public.profiles (user_id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (sender_id <> receiver_id),
  constraint friend_requests_responded check ((status = 'pending') = (responded_at is null))
);
comment on table public.friend_requests is
  'Friend requests (PRD 5.8). Written only by the friend functions; one pending or accepted request per pair.';
-- One live request per unordered pair, enforced by the database (PRD 5.8), so parallel
-- sends in either direction can't both succeed.
create unique index friend_requests_live_pair_idx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status in ('pending', 'accepted');
create index friend_requests_receiver_pending_idx on public.friend_requests (receiver_id, created_at desc)
  where status = 'pending';
create index friend_requests_sender_pending_idx on public.friend_requests (sender_id, created_at desc)
  where status = 'pending';
-- Covers the pair lookups in unfriend/block and the foreign keys.
create index friend_requests_sender_receiver_idx on public.friend_requests (sender_id, receiver_id);
create index friend_requests_receiver_sender_idx on public.friend_requests (receiver_id, sender_id);

create table public.friendships (
  user_id_a uuid not null references public.profiles (user_id) on delete cascade,
  user_id_b uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_a, user_id_b),
  constraint friendships_ordered check (user_id_a < user_id_b)
);
comment on table public.friendships is 'One ordered row per pair of friends (user_id_a < user_id_b).';
create index friendships_b_idx on public.friendships (user_id_b, user_id_a);

create table public.blocks (
  blocker_id uuid not null references public.profiles (user_id) on delete cascade,
  blocked_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
comment on table public.blocks is 'Blocks. Readable by the blocker only; a block hides each person from the other.';
create index blocks_blocked_idx on public.blocks (blocked_id, blocker_id);

-- ---------------------------------------------------------------------------
-- ops_audit_log (PRD 5.26): append-only for everyone, including the table owner.
-- ---------------------------------------------------------------------------
create table public.ops_audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 40),
  target_id text not null check (char_length(target_id) between 1 and 200),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
comment on table public.ops_audit_log is
  'Every staff action with its reason (PRD 5.26). Append-only: no update or delete, ever.';
create index ops_audit_log_staff_idx on public.ops_audit_log (staff_id, created_at desc);
create index ops_audit_log_target_idx on public.ops_audit_log (target_type, target_id, created_at desc);
create index ops_audit_log_created_idx on public.ops_audit_log (created_at desc);

create function private.ops_audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ops_audit_log is append-only' using errcode = '42501';
end;
$$;
revoke all on function private.ops_audit_log_append_only() from public;
create trigger ops_audit_log_no_update before update or delete on public.ops_audit_log
  for each row execute function private.ops_audit_log_append_only();
create trigger ops_audit_log_no_truncate before truncate on public.ops_audit_log
  for each statement execute function private.ops_audit_log_append_only();

-- ---------------------------------------------------------------------------
-- Helpers (replace the phase 1 stubs). Definer, because blocks are readable by the
-- blocker only and the check has to see both directions.
-- ---------------------------------------------------------------------------
create or replace function private.is_friend_of(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
     where f.user_id_a = least((select auth.uid()), p_other)
       and f.user_id_b = greatest((select auth.uid()), p_other)
  );
$$;

create or replace function private.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other)
        or (b.blocker_id = p_other and b.blocked_id = (select auth.uid()))
  );
$$;

-- Two-party forms for definer code that acts between two users (chat, feed, comments).
-- Not granted to API roles: they would let anyone probe other people's relationships.
create function private.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
     where f.user_id_a = least(p_a, p_b) and f.user_id_b = greatest(p_a, p_b)
  );
$$;

create function private.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;
revoke all on function private.are_friends(uuid, uuid), private.is_blocked(uuid, uuid) from public;

-- Resolves a username to a user id for the friend functions. Deliberately ignores blocks
-- and visibility: the callers decide what to reveal.
create function private.user_id_for(p_username text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id from public.profiles p where p.username = lower(btrim(p_username));
$$;
revoke all on function private.user_id_for(text) from public;

-- ---------------------------------------------------------------------------
-- RLS: reads only. Every write goes through a function below.
-- ---------------------------------------------------------------------------
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.ops_audit_log enable row level security;
revoke all on table public.friend_requests, public.friendships, public.blocks, public.ops_audit_log
  from anon, authenticated;
grant select on table public.friend_requests, public.friendships, public.blocks, public.ops_audit_log
  to authenticated;

create policy friend_requests_read on public.friend_requests for select to authenticated
  using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));
create policy friendships_read on public.friendships for select to authenticated
  using (user_id_a = (select auth.uid()) or user_id_b = (select auth.uid()));
-- The blocked person never learns about the block.
create policy blocks_read on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy ops_audit_log_read on public.ops_audit_log for select to authenticated
  using ((select private.is_staff()));

-- Realtime: the receiver's badge listens for new requests (RLS applies to the stream).
alter publication supabase_realtime add table public.friend_requests;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
-- Sends a request by username. If the other person already asked you, that request is
-- accepted instead (you both want it). Refuses self, blocks (as "not found", so a block
-- isn't revealed), duplicates, and more than one send per 5 seconds.
create function private.send_friend_request(p_username text)
returns table (request_id uuid, status public.friend_request_status)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid;
  v_req public.friend_requests;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_other := private.user_id_for(p_username);
  if v_other is null or private.is_blocked(v_me, v_other) then
    raise exception 'no one has that username' using errcode = 'P0002';
  end if;
  if v_other = v_me then
    raise exception 'you can''t send a friend request to yourself' using errcode = '22023';
  end if;
  if private.are_friends(v_me, v_other) then
    raise exception 'you''re already friends' using errcode = '23505';
  end if;

  -- Their pending request to me: accept it.
  select * into v_req from public.friend_requests r
   where r.sender_id = v_other and r.receiver_id = v_me and r.status = 'pending'
   for update;
  if found then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = v_req.id;
    insert into public.friendships (user_id_a, user_id_b)
    values (least(v_me, v_other), greatest(v_me, v_other))
    on conflict do nothing;
    return query select v_req.id, 'accepted'::public.friend_request_status;
    return;
  end if;

  if not private.rate_limit('friend_request:' || v_me::text, 1, interval '5 seconds') then
    raise exception 'wait a few seconds before sending another request' using errcode = '54000';
  end if;

  begin
    insert into public.friend_requests (sender_id, receiver_id)
    values (v_me, v_other)
    returning * into v_req;
  exception when unique_violation then
    raise exception 'there''s already a request between you' using errcode = '23505';
  end;
  return query select v_req.id, v_req.status;
end;
$$;

-- Receiver only. Accepting writes the ordered friendship in the same transaction.
create function private.respond_friend_request(p_request uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_req public.friend_requests;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into v_req from public.friend_requests r
   where r.id = p_request and r.receiver_id = v_me and r.status = 'pending'
   for update;
  if not found then
    raise exception 'that request is no longer pending' using errcode = 'P0002';
  end if;
  if p_accept and private.is_blocked(v_me, v_req.sender_id) then
    raise exception 'that request is no longer pending' using errcode = 'P0002';
  end if;
  update public.friend_requests
     set status = case when p_accept then 'accepted' else 'declined' end::public.friend_request_status,
         responded_at = now()
   where id = v_req.id;
  if p_accept then
    insert into public.friendships (user_id_a, user_id_b)
    values (least(v_me, v_req.sender_id), greatest(v_me, v_req.sender_id))
    on conflict do nothing;
  end if;
end;
$$;

-- Sender only, while pending.
create function private.cancel_friend_request(p_request uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  delete from public.friend_requests r
   where r.id = p_request and r.sender_id = v_me and r.status = 'pending';
  if not found then
    raise exception 'that request is no longer pending' using errcode = 'P0002';
  end if;
end;
$$;

-- Deletes this pair's friendship and this pair's requests, and nothing else (PRD 8 lesson 4).
create function private.clear_pair(p_a uuid, p_b uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_friends integer;
begin
  delete from public.friendships f
   where f.user_id_a = least(p_a, p_b) and f.user_id_b = greatest(p_a, p_b);
  get diagnostics v_friends = row_count;
  delete from public.friend_requests r
   where (r.sender_id = p_a and r.receiver_id = p_b)
      or (r.sender_id = p_b and r.receiver_id = p_a);
  return v_friends;
end;
$$;
revoke all on function private.clear_pair(uuid, uuid) from public;

create function private.unfriend(p_username text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_other := private.user_id_for(p_username);
  if v_other is null or v_other = v_me or private.clear_pair(v_me, v_other) = 0 then
    raise exception 'you''re not friends with that person' using errcode = 'P0002';
  end if;
end;
$$;

-- Removes the pair's friendship and requests, then blocks. Works even when the other
-- person already blocked you (each block is independent).
create function private.block_user(p_username text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_other := private.user_id_for(p_username);
  if v_other is null then
    raise exception 'no one has that username' using errcode = 'P0002';
  end if;
  if v_other = v_me then
    raise exception 'you can''t block yourself' using errcode = '22023';
  end if;
  perform private.clear_pair(v_me, v_other);
  insert into public.blocks (blocker_id, blocked_id) values (v_me, v_other)
  on conflict do nothing;
end;
$$;

-- Lifts your own block only. The pair returns to strangers (nothing is restored).
create function private.unblock_user(p_username text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  delete from public.blocks b
   where b.blocker_id = v_me and b.blocked_id = private.user_id_for(p_username);
  if not found then
    raise exception 'you haven''t blocked that person' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads for /friends and profile buttons
-- ---------------------------------------------------------------------------
-- Friends, with a photo only where the friend's profile is visible to you.
create function private.my_friends()
returns table (user_id uuid, username text, full_name text, avatar_path text, department text,
               graduation_year smallint, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.username, p.full_name,
         case when private.can_view_profile(p.user_id) then p.avatar_path end,
         p.department, p.graduation_year, f.created_at
    from public.friendships f
    join public.profiles p
      on p.user_id = case when f.user_id_a = (select auth.uid()) then f.user_id_b else f.user_id_a end
   where (select auth.uid()) in (f.user_id_a, f.user_id_b)
   order by p.full_name, p.username;
$$;

-- Pending requests to or from you.
create function private.my_friend_requests()
returns table (id uuid, direction text, user_id uuid, username text, full_name text, avatar_path text,
               department text, graduation_year smallint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         case when r.receiver_id = (select auth.uid()) then 'received' else 'sent' end,
         p.user_id, p.username, p.full_name,
         case when private.can_view_profile(p.user_id) then p.avatar_path end,
         p.department, p.graduation_year, r.created_at
    from public.friend_requests r
    join public.profiles p
      on p.user_id = case when r.receiver_id = (select auth.uid()) then r.sender_id else r.receiver_id end
   where r.status = 'pending'
     and (select auth.uid()) in (r.sender_id, r.receiver_id)
   order by r.created_at desc;
$$;

-- People you blocked (name and username only, so you can unblock them).
create function private.my_blocks()
returns table (username text, full_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.full_name, b.created_at
    from public.blocks b
    join public.profiles p on p.user_id = b.blocked_id
   where b.blocker_id = (select auth.uid())
   order by b.created_at desc;
$$;

-- Your relationship with one person, for profile and search buttons.
-- self | friends | sent | received | blocked (you blocked them) | none.
-- A person who blocked you is not found (null), exactly as if the username didn't exist.
create function private.friendship_state(p_username text)
returns table (state text, request_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (select private.user_id_for(p_username) as id)
  select case
           when o.id = (select auth.uid()) then 'self'
           when exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = o.id)
             then 'blocked'
           when private.are_friends((select auth.uid()), o.id) then 'friends'
           when r.receiver_id = (select auth.uid()) then 'received'
           when r.sender_id = (select auth.uid()) then 'sent'
           else 'none'
         end,
         r.id
    from o
    left join public.friend_requests r
      on r.status = 'pending'
     and ((r.sender_id = (select auth.uid()) and r.receiver_id = o.id)
       or (r.sender_id = o.id and r.receiver_id = (select auth.uid())))
   where (select auth.uid()) is not null
     and o.id is not null
     and not exists (select 1 from public.blocks b where b.blocker_id = o.id and b.blocked_id = (select auth.uid()));
$$;

-- Unanswered requests to you (header badge).
create function private.pending_friend_request_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.friend_requests r
   where r.receiver_id = (select auth.uid()) and r.status = 'pending';
$$;

revoke all on function private.send_friend_request(text), private.respond_friend_request(uuid, boolean),
  private.cancel_friend_request(uuid), private.unfriend(text), private.block_user(text), private.unblock_user(text),
  private.my_friends(), private.my_friend_requests(), private.my_blocks(), private.friendship_state(text),
  private.pending_friend_request_count()
  from public;
grant execute on function private.send_friend_request(text), private.respond_friend_request(uuid, boolean),
  private.cancel_friend_request(uuid), private.unfriend(text), private.block_user(text), private.unblock_user(text),
  private.my_friends(), private.my_friend_requests(), private.my_blocks(), private.friendship_state(text),
  private.pending_friend_request_count()
  to authenticated;

-- Public wrappers (security invoker).
create function public.send_friend_request(p_username text)
returns table (request_id uuid, status public.friend_request_status)
language sql volatile security invoker set search_path = ''
as $$ select * from private.send_friend_request(p_username) $$;

create function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.respond_friend_request(p_request, p_accept) $$;

create function public.cancel_friend_request(p_request uuid)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.cancel_friend_request(p_request) $$;

create function public.unfriend(p_username text)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.unfriend(p_username) $$;

create function public.block_user(p_username text)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.block_user(p_username) $$;

create function public.unblock_user(p_username text)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.unblock_user(p_username) $$;

create function public.my_friends()
returns table (user_id uuid, username text, full_name text, avatar_path text, department text,
               graduation_year smallint, since timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.my_friends() $$;

create function public.my_friend_requests()
returns table (id uuid, direction text, user_id uuid, username text, full_name text, avatar_path text,
               department text, graduation_year smallint, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.my_friend_requests() $$;

create function public.my_blocks()
returns table (username text, full_name text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.my_blocks() $$;

create function public.friendship_state(p_username text)
returns table (state text, request_id uuid)
language sql stable security invoker set search_path = ''
as $$ select * from private.friendship_state(p_username) $$;

create function public.pending_friend_request_count()
returns integer
language sql stable security invoker set search_path = ''
as $$ select private.pending_friend_request_count() $$;

revoke all on function public.send_friend_request(text), public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid), public.unfriend(text), public.block_user(text), public.unblock_user(text),
  public.my_friends(), public.my_friend_requests(), public.my_blocks(), public.friendship_state(text),
  public.pending_friend_request_count()
  from public, anon;
grant execute on function public.send_friend_request(text), public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid), public.unfriend(text), public.block_user(text), public.unblock_user(text),
  public.my_friends(), public.my_friend_requests(), public.my_blocks(), public.friendship_state(text),
  public.pending_friend_request_count()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Profile visibility is one ladder (Ahmed, 2026-09-28): friends ⊂ university ⊂ global.
-- A friend sees whatever a classmate could, so friends read `friends` and `university`
-- profiles wherever they study; there is one full profile, never a separate friends view.
-- ---------------------------------------------------------------------------
drop policy profiles_select_visible on public.profiles;
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      not private.is_blocked_with(user_id)
      and (
        visibility = 'global'
        or (visibility = 'university' and university_id = (select private.current_university_id()))
        or private.is_friend_of(user_id)
      )
    )
  );

create or replace function private.can_view_profile(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.user_id = p_user
       and (
         p.user_id = (select auth.uid())
         or (
           not private.is_blocked_with(p.user_id)
           and (
             p.visibility = 'global'
             or (p.visibility = 'university' and p.university_id = (select private.current_university_id()))
             or private.is_friend_of(p.user_id)
           )
         )
       )
  );
$$;
