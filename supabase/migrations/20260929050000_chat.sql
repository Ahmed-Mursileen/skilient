-- Phase 3, slice 7: chat core (PRD 5.9, 5.28 "Chat"; PRD 8 lesson 1).
-- DMs (friends, or the two sides of an accepted application) and one group chat per
-- venture whose membership follows the venture's. Threads and memberships are created only
-- by functions (no insert policies at all); every read checks membership. Messages are
-- text up to 10,000 characters and/or one re-encoded image in the private chat-media
-- bucket; 30 a minute. Blocking closes a DM; in a group, a blocked teammate shows as
-- "Blocked member" (decisions.md 2026-09-28).

create type public.chat_thread_type as enum ('dm', 'group');

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  type public.chat_thread_type not null,
  venture_id uuid references public.ventures (id) on delete cascade,
  -- least(user)||':'||greatest(user) for DMs: one DM per pair.
  dm_key text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((type = 'group') = (venture_id is not null)),
  check ((type = 'dm') = (dm_key is not null))
);
comment on table public.chat_threads is 'Chat threads (PRD 5.9). Created only by get_or_create_dm and the venture triggers.';
create unique index chat_threads_venture_idx on public.chat_threads (venture_id) where type = 'group';
create unique index chat_threads_dm_key_idx on public.chat_threads (dm_key) where type = 'dm';

create table public.chat_thread_members (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted_until timestamptz,
  primary key (thread_id, user_id)
);
create index chat_thread_members_user_idx on public.chat_thread_members (user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  media_path text check (media_path is null or media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  media_width integer check (media_width is null or media_width between 1 and 4000),
  media_height integer check (media_height is null or media_height between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (deleted_at is not null or char_length(btrim(body)) > 0 or media_path is not null)
);
comment on table public.chat_messages is 'Chat messages (PRD 5.9). Sent, edited and deleted only through functions.';
create index chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at desc);
create index chat_messages_sender_idx on public.chat_messages (sender_id);

-- ---------------------------------------------------------------------------
-- Membership helper and RLS (reads only; PRD 8 lesson 1)
-- ---------------------------------------------------------------------------
create function private.is_thread_member(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.chat_thread_members m where m.thread_id = p_thread and m.user_id = (select auth.uid()));
$$;
revoke all on function private.is_thread_member(uuid) from public;
grant execute on function private.is_thread_member(uuid) to authenticated;

-- A DM's other person, if blocked with the caller either way (the DM is closed).
create function private.dm_blocked(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_threads t join public.chat_thread_members m on m.thread_id = t.id
     where t.id = p_thread and t.type = 'dm' and m.user_id <> (select auth.uid()) and private.is_blocked_with(m.user_id)
  );
$$;
revoke all on function private.dm_blocked(uuid) from public;
grant execute on function private.dm_blocked(uuid) to authenticated;

alter table public.chat_threads enable row level security;
alter table public.chat_thread_members enable row level security;
alter table public.chat_messages enable row level security;
revoke all on table public.chat_threads, public.chat_thread_members, public.chat_messages from anon, authenticated;
grant select on table public.chat_threads, public.chat_thread_members, public.chat_messages to authenticated;

create policy chat_threads_member_read on public.chat_threads for select to authenticated
  using (private.is_thread_member(id));
create policy chat_thread_members_member_read on public.chat_thread_members for select to authenticated
  using (private.is_thread_member(thread_id));
create policy chat_messages_member_read on public.chat_messages for select to authenticated
  using (private.is_thread_member(thread_id) and not private.dm_blocked(thread_id));

-- Realtime: members receive their threads' messages (RLS applies to the stream).
alter publication supabase_realtime add table public.chat_messages;

-- ---------------------------------------------------------------------------
-- Images: private bucket, members only; written as the server's WebP re-encode into
-- chat-media/{thread_id}/, read through short-lived signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.storage_thread_member(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
              then private.is_thread_member(((storage.foldername(p_name))[1])::uuid)
                   and not private.dm_blocked(((storage.foldername(p_name))[1])::uuid)
              else false end;
$$;
revoke all on function private.storage_thread_member(text) from public;
grant execute on function private.storage_thread_member(text) to authenticated;

create policy chat_media_member_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and private.storage_thread_member(name));
create policy chat_media_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and private.storage_thread_member(name));
-- Only the uploader removes a file (a deleted message's image).
create policy chat_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and owner_id = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Venture group chats: created with the venture, membership follows the venture's
-- ---------------------------------------------------------------------------
create function private.venture_chat_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_threads (type, venture_id) values ('group', new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger ventures_chat after insert on public.ventures for each row execute function private.venture_chat_created();

create function private.venture_chat_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chat_thread_members (thread_id, user_id)
    select t.id, new.user_id from public.chat_threads t where t.type = 'group' and t.venture_id = new.venture_id
    on conflict do nothing;
  else
    delete from public.chat_thread_members m
     using public.chat_threads t
     where t.id = m.thread_id and t.type = 'group' and t.venture_id = old.venture_id and m.user_id = old.user_id;
  end if;
  return null;
end;
$$;
create trigger venture_members_chat after insert or delete on public.venture_members
  for each row execute function private.venture_chat_membership();
revoke all on function private.venture_chat_created(), private.venture_chat_membership() from public;

-- Backfill: a group chat for every existing venture, with its current members.
insert into public.chat_threads (type, venture_id) select 'group', v.id from public.ventures v on conflict do nothing;
insert into public.chat_thread_members (thread_id, user_id)
select t.id, m.user_id from public.chat_threads t join public.venture_members m on m.venture_id = t.venture_id
 where t.type = 'group' on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Notifications: one unread message notification per thread (later messages refresh it)
-- ---------------------------------------------------------------------------
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('messages', 'Messages', 'New messages in your chats while you''re away.', 8, 'digest', false);
insert into public.notification_types (type, category, emailed) values ('chat_message', 'messages', true);

create function private.notify_chat_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_thread public.chat_threads;
  v_data jsonb;
  v_title text;
begin
  select * into v_thread from public.chat_threads where id = new.thread_id;
  if v_thread.type = 'group' then
    select v.title into v_title from public.ventures v where v.id = v_thread.venture_id;
  end if;
  v_data := jsonb_build_object('thread_id', new.thread_id, 'venture_title', v_title,
                               'excerpt', case when new.body <> '' then left(new.body, 120) else 'Sent an image' end);
  for m in
    select cm.user_id from public.chat_thread_members cm
     where cm.thread_id = new.thread_id and cm.user_id <> new.sender_id
       and (cm.muted_until is null or cm.muted_until < now())
       and not private.is_blocked(cm.user_id, new.sender_id)
  loop
    update public.notifications n
       set actor_id = new.sender_id, data = v_data, created_at = now()
     where n.user_id = m.user_id and n.type = 'chat_message' and n.entity_id = new.thread_id and n.read_at is null;
    if not found then
      perform private.notify(m.user_id, new.sender_id, 'chat_message', 'chat_thread', new.thread_id, v_data);
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.notify_chat_message() from public;
create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function private.notify_chat_message();

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
-- Finds or creates the DM with someone: friends, or the two sides of an accepted
-- application; never across a block. Both memberships are written with the thread.
create function private.get_or_create_dm(p_username text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid := private.user_id_for(p_username);
  v_key text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_other is null or private.is_blocked(v_me, v_other) then
    raise exception 'no one has that username' using errcode = 'P0002';
  end if;
  if v_other = v_me then
    raise exception 'you can''t message yourself' using errcode = '22023';
  end if;
  if not private.are_friends(v_me, v_other) and not exists (
       select 1 from public.application_threads t
        where t.status = 'accepted'
          and ((t.candidate_id = v_me and t.owner_id = v_other) or (t.candidate_id = v_other and t.owner_id = v_me))) then
    raise exception 'you can message friends, or the people on an application you share' using errcode = '42501';
  end if;
  v_key := least(v_me, v_other)::text || ':' || greatest(v_me, v_other)::text;
  -- Serialise the pair so two parallel first messages make one thread.
  perform pg_advisory_xact_lock(hashtextextended('dm:' || v_key, 0));
  select id into v_id from public.chat_threads where type = 'dm' and dm_key = v_key;
  if v_id is null then
    insert into public.chat_threads (type, dm_key) values ('dm', v_key) returning id into v_id;
    insert into public.chat_thread_members (thread_id, user_id) values (v_id, v_me), (v_id, v_other);
  end if;
  return v_id;
end;
$$;

-- The venture's group chat, for its members.
create function private.venture_chat(p_venture uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.chat_threads t
   where t.type = 'group' and t.venture_id = p_venture and private.is_thread_member(t.id);
$$;

create function private.send_message(p_thread uuid, p_body text, p_media jsonb default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_body text := coalesce(p_body, '');
  v_id uuid;
begin
  if v_me is null or not private.is_thread_member(p_thread) then
    raise exception 'you''re not in this chat' using errcode = '42501';
  end if;
  if private.dm_blocked(p_thread) then
    raise exception 'this conversation is closed' using errcode = '42501';
  end if;
  if char_length(v_body) > 10000 then
    raise exception 'messages are up to 10,000 characters' using errcode = '23514';
  end if;
  if btrim(v_body) = '' and p_media is null then
    raise exception 'write a message or add an image' using errcode = '23514';
  end if;
  if p_media is not null and (
       split_part(p_media->>'path', '/', 1) <> p_thread::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-media' and o.name = p_media->>'path'
                       and o.owner_id = v_me::text)) then
    raise exception 'the image is missing; attach it again' using errcode = '22023';
  end if;
  if not private.rate_limit('chat:' || v_me::text, 30, interval '1 minute') then
    raise exception 'you''re sending messages too fast' using errcode = '54000';
  end if;
  insert into public.chat_messages (thread_id, sender_id, body, media_path, media_width, media_height)
  values (p_thread, v_me, v_body, p_media->>'path', (p_media->>'width')::integer, (p_media->>'height')::integer)
  returning id into v_id;
  update public.chat_threads set last_message_at = now() where id = p_thread;
  update public.chat_thread_members set last_read_at = now() where thread_id = p_thread and user_id = v_me;
  return v_id;
end;
$$;

-- The sender edits text (shows "edited"); no edits after deletion.
create function private.edit_message(p_message uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(p_body, '')) > 10000 then
    raise exception 'messages are up to 10,000 characters' using errcode = '23514';
  end if;
  update public.chat_messages m
     set body = coalesce(p_body, ''), edited_at = now()
   where m.id = p_message and m.sender_id = (select auth.uid()) and m.deleted_at is null
     and (btrim(coalesce(p_body, '')) <> '' or m.media_path is not null)
     and not private.dm_blocked(m.thread_id);
  if not found then
    raise exception 'you can only edit your own messages' using errcode = '42501';
  end if;
end;
$$;

-- The sender deletes: the body is blanked server-side and the image path returned so the
-- app removes the file.
create function private.delete_message(p_message uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  select media_path into v_path from public.chat_messages where id = p_message and sender_id = (select auth.uid()) and deleted_at is null;
  update public.chat_messages
     set deleted_at = now(), body = '', media_path = null, media_width = null, media_height = null
   where id = p_message and sender_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'you can only delete your own messages' using errcode = '42501';
  end if;
  return v_path;
end;
$$;

-- Opening a thread marks it read, and with it the thread's message notification.
create function private.mark_thread_read(p_thread uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.chat_thread_members set last_read_at = now()
   where thread_id = p_thread and user_id = (select auth.uid());
  if not found then
    raise exception 'you''re not in this chat' using errcode = '42501';
  end if;
  update public.notifications set read_at = now()
   where user_id = (select auth.uid()) and type = 'chat_message' and entity_id = p_thread and read_at is null;
end;
$$;

create function private.mute_thread(p_thread uuid, p_hours integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.chat_thread_members
     set muted_until = case when coalesce(p_hours, 0) <= 0 then null
                            when p_hours >= 8760 then 'infinity'::timestamptz
                            else now() + make_interval(hours => p_hours) end
   where thread_id = p_thread and user_id = (select auth.uid());
  if not found then
    raise exception 'you''re not in this chat' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- The caller's threads, newest activity first: a DM shows the other person (closed DMs
-- are left out), a group shows its venture; with the last message and the unread count.
create function private.my_threads()
returns table (id uuid, type public.chat_thread_type, title text, username text, avatar_path text, venture_id uuid,
               last_message text, last_message_at timestamptz, last_sender_is_me boolean, unread integer, muted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.type,
         case when t.type = 'group' then v.title else o.full_name end,
         case when t.type = 'dm' and private.can_view_profile(o.user_id) then o.username end,
         case when t.type = 'dm' and private.can_view_profile(o.user_id) then o.avatar_path end,
         t.venture_id,
         case when lm.deleted_at is not null then 'Message deleted'
              when lm.id is not null and lm.body = '' then 'Image'
              else left(lm.body, 140) end,
         coalesce(lm.created_at, t.created_at),
         lm.sender_id = (select auth.uid()),
         (select count(*)::integer from public.chat_messages cm
           where cm.thread_id = t.id and cm.created_at > me.last_read_at and cm.sender_id <> (select auth.uid())
             and cm.deleted_at is null and not private.is_blocked_with(cm.sender_id)),
         coalesce(me.muted_until > now(), false)
    from public.chat_thread_members me
    join public.chat_threads t on t.id = me.thread_id
    left join public.ventures v on v.id = t.venture_id
    left join lateral (
      select p.* from public.chat_thread_members om join public.profiles p on p.user_id = om.user_id
       where om.thread_id = t.id and om.user_id <> me.user_id limit 1
    ) o on t.type = 'dm'
    left join lateral (
      select cm.* from public.chat_messages cm
       where cm.thread_id = t.id and (cm.sender_id = me.user_id or not private.is_blocked_with(cm.sender_id))
       order by cm.created_at desc limit 1
    ) lm on true
   where me.user_id = (select auth.uid())
     and not private.dm_blocked(t.id)
     and (t.type = 'group' or lm.id is not null)
   order by coalesce(lm.created_at, t.created_at) desc;
$$;

-- Everyone in a thread, as the caller may see them: a teammate blocked either way is
-- "Blocked member" with no link or photo.
create function private.thread_people(p_thread uuid)
returns table (user_id uuid, name text, username text, avatar_path text, blocked boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         case when private.is_blocked_with(m.user_id) then 'Blocked member' else p.full_name end,
         case when not private.is_blocked_with(m.user_id) and private.can_view_profile(m.user_id) then p.username end,
         case when not private.is_blocked_with(m.user_id) and private.can_view_profile(m.user_id) then p.avatar_path end,
         private.is_blocked_with(m.user_id),
         m.user_id = (select auth.uid())
    from public.chat_thread_members m join public.profiles p on p.user_id = m.user_id
   where m.thread_id = p_thread and private.is_thread_member(p_thread) and not private.dm_blocked(p_thread)
   order by p.full_name;
$$;

-- A page of messages, newest first (the page reverses them).
create function private.thread_messages(p_thread uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_id uuid, body text, media_path text, media_width integer, media_height integer,
               created_at timestamptz, edited_at timestamptz, deleted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.sender_id, m.body, m.media_path, m.media_width, m.media_height, m.created_at, m.edited_at,
         m.deleted_at is not null
    from public.chat_messages m
   where m.thread_id = p_thread and private.is_thread_member(p_thread) and not private.dm_blocked(p_thread)
     and (p_before is null or m.created_at < p_before)
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create function private.unread_chat_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(unread), 0)::integer from private.my_threads() where not muted;
$$;

revoke all on function private.get_or_create_dm(text), private.venture_chat(uuid), private.send_message(uuid, text, jsonb),
  private.edit_message(uuid, text), private.delete_message(uuid), private.mark_thread_read(uuid), private.mute_thread(uuid, integer),
  private.my_threads(), private.thread_people(uuid), private.thread_messages(uuid, timestamptz, integer), private.unread_chat_count()
  from public;
grant execute on function private.get_or_create_dm(text), private.venture_chat(uuid), private.send_message(uuid, text, jsonb),
  private.edit_message(uuid, text), private.delete_message(uuid), private.mark_thread_read(uuid), private.mute_thread(uuid, integer),
  private.my_threads(), private.thread_people(uuid), private.thread_messages(uuid, timestamptz, integer), private.unread_chat_count()
  to authenticated;

create function public.get_or_create_dm(p_username text) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.get_or_create_dm(p_username) $$;
create function public.venture_chat(p_venture uuid) returns uuid
  language sql stable security invoker set search_path = '' as $$ select private.venture_chat(p_venture) $$;
create function public.send_message(p_thread uuid, p_body text, p_media jsonb default null) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.send_message(p_thread, p_body, p_media) $$;
create function public.edit_message(p_message uuid, p_body text) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.edit_message(p_message, p_body) $$;
create function public.delete_message(p_message uuid) returns text
  language sql volatile security invoker set search_path = '' as $$ select private.delete_message(p_message) $$;
create function public.mark_thread_read(p_thread uuid) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.mark_thread_read(p_thread) $$;
create function public.mute_thread(p_thread uuid, p_hours integer) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.mute_thread(p_thread, p_hours) $$;
create function public.my_threads()
returns table (id uuid, type public.chat_thread_type, title text, username text, avatar_path text, venture_id uuid,
               last_message text, last_message_at timestamptz, last_sender_is_me boolean, unread integer, muted boolean)
  language sql stable security invoker set search_path = '' as $$ select * from private.my_threads() $$;
create function public.thread_people(p_thread uuid)
returns table (user_id uuid, name text, username text, avatar_path text, blocked boolean, is_me boolean)
  language sql stable security invoker set search_path = '' as $$ select * from private.thread_people(p_thread) $$;
create function public.thread_messages(p_thread uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_id uuid, body text, media_path text, media_width integer, media_height integer,
               created_at timestamptz, edited_at timestamptz, deleted boolean)
  language sql stable security invoker set search_path = '' as $$ select * from private.thread_messages(p_thread, p_before, p_limit) $$;
create function public.unread_chat_count() returns integer
  language sql stable security invoker set search_path = '' as $$ select private.unread_chat_count() $$;

revoke all on function public.get_or_create_dm(text), public.venture_chat(uuid), public.send_message(uuid, text, jsonb),
  public.edit_message(uuid, text), public.delete_message(uuid), public.mark_thread_read(uuid), public.mute_thread(uuid, integer),
  public.my_threads(), public.thread_people(uuid), public.thread_messages(uuid, timestamptz, integer), public.unread_chat_count()
  from public, anon;
grant execute on function public.get_or_create_dm(text), public.venture_chat(uuid), public.send_message(uuid, text, jsonb),
  public.edit_message(uuid, text), public.delete_message(uuid), public.mark_thread_read(uuid), public.mute_thread(uuid, integer),
  public.my_threads(), public.thread_people(uuid), public.thread_messages(uuid, timestamptz, integer), public.unread_chat_count()
  to authenticated;
