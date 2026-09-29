-- Phase 3, slice 8: chat extras and Explore (PRD 5.9, 5.10, 5.28 "Chat").
-- Replies, six-emoji reactions, pins (venture group owner, up to 3), DM read receipts
-- (both people must have them on), typing over a members-only Realtime broadcast
-- channel, search within a thread and across chats, link previews in messages; Explore
-- search over people and ventures with friendship state in the same round trip.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Messages: replies, link previews, full-text search
-- ---------------------------------------------------------------------------
alter table public.chat_messages
  add column reply_to_id uuid references public.chat_messages (id) on delete set null,
  add column link_url text check (link_url is null or char_length(link_url) <= 2000),
  add column search tsvector generated always as (to_tsvector('simple', body)) stored;
create index chat_messages_reply_idx on public.chat_messages (reply_to_id) where reply_to_id is not null;
create index chat_messages_search_idx on public.chat_messages using gin (search);

-- The same first-link rule and preview queue as posts (slice 4).
create trigger chat_messages_link_url before insert or update of body on public.chat_messages
  for each row execute function private.post_link_url();

-- "word1 word2" -> 'word1':* & 'word2':* (letters and digits only, so the input can't
-- inject tsquery syntax; single letters are dropped, they'd match nearly everything).
-- Null when nothing searchable is left.
create function private.prefix_tsquery(p_q text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select case when count(*) = 0 then null
              else to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & ')) end
    from (select lower(w) as w
            from regexp_split_to_table(left(coalesce(p_q, ''), 100), '[^[:alnum:]]+') as w
           where char_length(w) >= 2 limit 8) words;
$$;
revoke all on function private.prefix_tsquery(text) from public;
grant execute on function private.prefix_tsquery(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reactions: a fixed set of six (PRD 5.28); several per person, one of each
-- ---------------------------------------------------------------------------
create table public.message_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '😮', '🙏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
comment on table public.message_reactions is 'Emoji reactions on chat messages (PRD 5.28). Written only by toggle_reaction.';
create index message_reactions_thread_idx on public.message_reactions (thread_id);
create index message_reactions_user_idx on public.message_reactions (user_id);

-- ---------------------------------------------------------------------------
-- Pins: venture group chats only, by the venture owner, up to 3
-- ---------------------------------------------------------------------------
create table public.chat_pins (
  message_id uuid primary key references public.chat_messages (id) on delete cascade,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  pinned_by uuid not null references auth.users (id) on delete cascade,
  pinned_at timestamptz not null default now()
);
comment on table public.chat_pins is 'Pinned messages in venture group chats (PRD 5.28). Written only by pin_message/unpin_message.';
create index chat_pins_thread_idx on public.chat_pins (thread_id, pinned_at);
create index chat_pins_pinned_by_idx on public.chat_pins (pinned_by);

alter table public.message_reactions enable row level security;
alter table public.chat_pins enable row level security;
revoke all on table public.message_reactions, public.chat_pins from anon, authenticated;
grant select on table public.message_reactions, public.chat_pins to authenticated;
create policy message_reactions_member_read on public.message_reactions for select to authenticated
  using (private.is_thread_member(thread_id) and not private.dm_blocked(thread_id));
create policy chat_pins_member_read on public.chat_pins for select to authenticated
  using (private.is_thread_member(thread_id));

-- ---------------------------------------------------------------------------
-- Read receipts: a per-person setting, on by default (PRD 5.28)
-- ---------------------------------------------------------------------------
alter table public.profiles add column chat_read_receipts boolean not null default true;
comment on column public.profiles.chat_read_receipts is
  'DM read receipts. Off: this person neither sends nor sees them (PRD 5.28).';

-- ---------------------------------------------------------------------------
-- Realtime broadcast for typing and "something changed" pings, members only.
-- Topic: thread:{thread_id}, subscribed with { private: true }.
-- ---------------------------------------------------------------------------
create function private.thread_topic_member(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_topic ~ '^thread:[0-9a-f-]{36}$'
              then private.is_thread_member(substr(p_topic, 8)::uuid) and not private.dm_blocked(substr(p_topic, 8)::uuid)
              else false end;
$$;
revoke all on function private.thread_topic_member(text) from public;
grant execute on function private.thread_topic_member(text) to authenticated;

create policy thread_broadcast_receive on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and private.thread_topic_member((select realtime.topic())));
create policy thread_broadcast_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and private.thread_topic_member((select realtime.topic())));

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
-- send_message gains a reply target (same thread, not deleted).
drop function public.send_message(uuid, text, jsonb);
drop function private.send_message(uuid, text, jsonb);
create function private.send_message(p_thread uuid, p_body text, p_media jsonb default null, p_reply_to uuid default null)
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
  if p_reply_to is not null and not exists (
       select 1 from public.chat_messages r where r.id = p_reply_to and r.thread_id = p_thread and r.deleted_at is null) then
    raise exception 'that message is no longer here to reply to' using errcode = '22023';
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
  insert into public.chat_messages (thread_id, sender_id, body, media_path, media_width, media_height, reply_to_id)
  values (p_thread, v_me, v_body, p_media->>'path', (p_media->>'width')::integer, (p_media->>'height')::integer, p_reply_to)
  returning id into v_id;
  update public.chat_threads set last_message_at = now() where id = p_thread;
  update public.chat_thread_members set last_read_at = now() where thread_id = p_thread and user_id = v_me;
  return v_id;
end;
$$;

-- Adds the reaction, or takes it back if it's already there. Returns whether it's on.
create function private.toggle_reaction(p_message uuid, p_emoji text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_thread uuid;
begin
  select m.thread_id into v_thread from public.chat_messages m where m.id = p_message and m.deleted_at is null;
  if v_thread is null or not private.is_thread_member(v_thread) or private.dm_blocked(v_thread) then
    raise exception 'that message isn''t available' using errcode = '42501';
  end if;
  if p_emoji is null or p_emoji not in ('👍', '❤️', '😂', '🎉', '😮', '🙏') then
    raise exception 'pick one of the six reactions' using errcode = '22023';
  end if;
  delete from public.message_reactions where message_id = p_message and user_id = v_me and emoji = p_emoji;
  if found then
    return false;
  end if;
  if not private.rate_limit('react:' || v_me::text, 60, interval '1 minute') then
    raise exception 'you''re reacting too fast' using errcode = '54000';
  end if;
  insert into public.message_reactions (message_id, thread_id, user_id, emoji) values (p_message, v_thread, v_me, p_emoji);
  return true;
end;
$$;

-- The venture owner pins up to 3 messages in the group chat.
create function private.pin_message(p_message uuid, p_pin boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_thread uuid;
begin
  select t.id into v_thread
    from public.chat_messages m
    join public.chat_threads t on t.id = m.thread_id and t.type = 'group'
    join public.ventures v on v.id = t.venture_id and v.owner_id = v_me
   where m.id = p_message and m.deleted_at is null and private.is_thread_member(t.id);
  if v_thread is null then
    raise exception 'only the venture owner can pin messages in the team chat' using errcode = '42501';
  end if;
  if not p_pin then
    delete from public.chat_pins where message_id = p_message;
    return;
  end if;
  -- Serialise pins per thread so two parallel pins can't make a fourth.
  perform 1 from public.chat_threads where id = v_thread for update;
  if exists (select 1 from public.chat_pins where message_id = p_message) then
    return;
  end if;
  if (select count(*) from public.chat_pins where thread_id = v_thread) >= 3 then
    raise exception 'up to 3 messages can be pinned; unpin one first' using errcode = '23514';
  end if;
  insert into public.chat_pins (message_id, thread_id, pinned_by) values (p_message, v_thread, v_me);
end;
$$;

create function private.set_read_receipts(p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.profiles set chat_read_receipts = coalesce(p_on, true) where user_id = (select auth.uid());
  if not found then
    raise exception 'sign in first' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- Reaction counts for some messages, as the caller may see them (blocked people's
-- reactions left out), with whether the caller added each.
create function private.reaction_summary(p_messages uuid[])
returns table (message_id uuid, reactions jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.message_id,
         jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine)
                   order by array_position(array['👍', '❤️', '😂', '🎉', '😮', '🙏'], r.emoji))
    from (
      select mr.message_id, mr.emoji, count(*)::integer as n, bool_or(mr.user_id = (select auth.uid())) as mine
        from public.message_reactions mr
       where mr.message_id = any (p_messages)
         and private.is_thread_member(mr.thread_id) and not private.dm_blocked(mr.thread_id)
         and (mr.user_id = (select auth.uid()) or not private.is_blocked_with(mr.user_id))
       group by mr.message_id, mr.emoji
    ) r
   group by r.message_id;
$$;

-- A page of messages, newest first, with reply excerpts, reactions, pins and link previews.
drop function public.thread_messages(uuid, timestamptz, integer);
drop function private.thread_messages(uuid, timestamptz, integer);
create function private.thread_messages(p_thread uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_id uuid, body text, media_path text, media_width integer, media_height integer,
               created_at timestamptz, edited_at timestamptz, deleted boolean,
               reply_to_id uuid, reply_sender_id uuid, reply_excerpt text,
               reactions jsonb, pinned boolean, link jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select m.* from public.chat_messages m
     where m.thread_id = p_thread and private.is_thread_member(p_thread) and not private.dm_blocked(p_thread)
       and (p_before is null or m.created_at < p_before)
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select m.id, m.sender_id, m.body, m.media_path, m.media_width, m.media_height, m.created_at, m.edited_at,
         m.deleted_at is not null,
         m.reply_to_id, r.sender_id,
         case when r.id is null then null
              when r.deleted_at is not null then 'Message deleted'
              when r.body = '' then 'Image'
              else left(r.body, 140) end,
         coalesce(rs.reactions, '[]'::jsonb),
         exists (select 1 from public.chat_pins cp where cp.message_id = m.id),
         case when m.deleted_at is null then (
           select jsonb_build_object('url', lp.url, 'title', lp.title, 'description', lp.description, 'site_name', lp.site_name)
             from public.link_previews lp
            where m.link_url is not null and lp.url_hash = private.url_hash(m.link_url) and lp.status = 'ok') end
    from page m
    left join public.chat_messages r on r.id = m.reply_to_id
    left join private.reaction_summary(array(select id from page)) rs on rs.message_id = m.id
   order by m.created_at desc;
$$;

-- The team chat's pins, oldest first.
create function private.thread_pins(p_thread uuid)
returns table (message_id uuid, sender_id uuid, excerpt text, pinned_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.message_id, m.sender_id, case when m.body = '' then 'Image' else left(m.body, 140) end, p.pinned_at
    from public.chat_pins p join public.chat_messages m on m.id = p.message_id
   where p.thread_id = p_thread and private.is_thread_member(p_thread) and m.deleted_at is null
   order by p.pinned_at;
$$;

-- In a DM where both people have receipts on: when the other person last read it.
create function private.dm_receipt(p_thread uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select o.last_read_at
    from public.chat_threads t
    join public.chat_thread_members o on o.thread_id = t.id and o.user_id <> (select auth.uid())
    join public.profiles op on op.user_id = o.user_id and op.chat_read_receipts
    join public.profiles me on me.user_id = (select auth.uid()) and me.chat_read_receipts
   where t.id = p_thread and t.type = 'dm' and private.is_thread_member(t.id) and not private.dm_blocked(t.id);
$$;

create function private.my_chat_settings()
returns table (read_receipts boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.chat_read_receipts from public.profiles p where p.user_id = (select auth.uid());
$$;

-- Search your chats (or one thread): whole words and prefixes, newest first, up to 30.
create function private.search_chats(p_q text, p_thread uuid default null)
returns table (message_id uuid, thread_id uuid, thread_title text, sender_name text, excerpt text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query tsquery := private.prefix_tsquery(p_q);
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_query is null or char_length(btrim(p_q)) < 2 then
    return;
  end if;
  return query
  select m.id, m.thread_id,
         case when t.type = 'group' then v.title else o.full_name end,
         case when m.sender_id = (select auth.uid()) then 'You' else s.full_name end,
         left(m.body, 200), m.created_at
    from public.chat_thread_members me
    join public.chat_threads t on t.id = me.thread_id
    join public.chat_messages m on m.thread_id = t.id
    join public.profiles s on s.user_id = m.sender_id
    left join public.ventures v on v.id = t.venture_id
    left join lateral (
      select p.full_name from public.chat_thread_members om join public.profiles p on p.user_id = om.user_id
       where om.thread_id = t.id and om.user_id <> me.user_id limit 1
    ) o on t.type = 'dm'
   where me.user_id = (select auth.uid())
     and (p_thread is null or t.id = p_thread)
     and not private.dm_blocked(t.id)
     and m.deleted_at is null
     and m.search @@ v_query
     and (m.sender_id = (select auth.uid()) or not private.is_blocked_with(m.sender_id))
   order by m.created_at desc
   limit 30;
end;
$$;

revoke all on function private.send_message(uuid, text, jsonb, uuid), private.toggle_reaction(uuid, text),
  private.pin_message(uuid, boolean), private.set_read_receipts(boolean), private.reaction_summary(uuid[]),
  private.thread_messages(uuid, timestamptz, integer), private.thread_pins(uuid), private.dm_receipt(uuid),
  private.my_chat_settings(), private.search_chats(text, uuid) from public;
grant execute on function private.send_message(uuid, text, jsonb, uuid), private.toggle_reaction(uuid, text),
  private.pin_message(uuid, boolean), private.set_read_receipts(boolean), private.reaction_summary(uuid[]),
  private.thread_messages(uuid, timestamptz, integer), private.thread_pins(uuid), private.dm_receipt(uuid),
  private.my_chat_settings(), private.search_chats(text, uuid) to authenticated;

create function public.send_message(p_thread uuid, p_body text, p_media jsonb default null, p_reply_to uuid default null) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.send_message(p_thread, p_body, p_media, p_reply_to) $$;
create function public.toggle_reaction(p_message uuid, p_emoji text) returns boolean
  language sql volatile security invoker set search_path = '' as $$ select private.toggle_reaction(p_message, p_emoji) $$;
create function public.pin_message(p_message uuid, p_pin boolean) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.pin_message(p_message, p_pin) $$;
create function public.set_read_receipts(p_on boolean) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.set_read_receipts(p_on) $$;
create function public.reaction_summary(p_messages uuid[]) returns table (message_id uuid, reactions jsonb)
  language sql stable security invoker set search_path = '' as $$ select * from private.reaction_summary(p_messages) $$;
create function public.thread_messages(p_thread uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_id uuid, body text, media_path text, media_width integer, media_height integer,
               created_at timestamptz, edited_at timestamptz, deleted boolean,
               reply_to_id uuid, reply_sender_id uuid, reply_excerpt text,
               reactions jsonb, pinned boolean, link jsonb)
  language sql stable security invoker set search_path = '' as $$ select * from private.thread_messages(p_thread, p_before, p_limit) $$;
create function public.thread_pins(p_thread uuid) returns table (message_id uuid, sender_id uuid, excerpt text, pinned_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.thread_pins(p_thread) $$;
create function public.dm_receipt(p_thread uuid) returns timestamptz
  language sql stable security invoker set search_path = '' as $$ select private.dm_receipt(p_thread) $$;
create function public.my_chat_settings() returns table (read_receipts boolean)
  language sql stable security invoker set search_path = '' as $$ select * from private.my_chat_settings() $$;
create function public.search_chats(p_q text, p_thread uuid default null)
returns table (message_id uuid, thread_id uuid, thread_title text, sender_name text, excerpt text, created_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.search_chats(p_q, p_thread) $$;

revoke all on function public.send_message(uuid, text, jsonb, uuid), public.toggle_reaction(uuid, text),
  public.pin_message(uuid, boolean), public.set_read_receipts(boolean), public.reaction_summary(uuid[]),
  public.thread_messages(uuid, timestamptz, integer), public.thread_pins(uuid), public.dm_receipt(uuid),
  public.my_chat_settings(), public.search_chats(text, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, jsonb, uuid), public.toggle_reaction(uuid, text),
  public.pin_message(uuid, boolean), public.set_read_receipts(boolean), public.reaction_summary(uuid[]),
  public.thread_messages(uuid, timestamptz, integer), public.thread_pins(uuid), public.dm_receipt(uuid),
  public.my_chat_settings(), public.search_chats(text, uuid) to authenticated;

-- ===========================================================================
-- Explore (PRD 5.10)
-- ===========================================================================
alter table public.profiles_public_card
  add column search tsvector generated always as (
    to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(username, '') || ' ' || coalesce(department, ''))
  ) stored;
create index profiles_public_card_search_idx on public.profiles_public_card using gin (search);
create index profiles_public_card_name_trgm_idx on public.profiles_public_card using gin (full_name extensions.gin_trgm_ops);
create index profiles_public_card_username_trgm_idx on public.profiles_public_card using gin (username extensions.gin_trgm_ops);

alter table public.ventures
  add column search tsvector generated always as (
    setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', left(description, 2000)), 'B')
  ) stored;
create index ventures_search_idx on public.ventures using gin (search);
create index ventures_title_trgm_idx on public.ventures using gin (title extensions.gin_trgm_ops);

-- LIKE pattern for "contains q", with the wildcards in q escaped.
create function private.contains_pattern(p_q text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;
revoke all on function private.contains_pattern(text) from public;
grant execute on function private.contains_pattern(text) to authenticated;

-- People (PRD 5.10): everyone signed in is discoverable by name, username or department,
-- with the card fields only (name, department, batch, university), plus photo and skills
-- where the profile is visible to the searcher. Never the searcher or anyone blocked
-- either way. A search needs at least 2 characters (no browsing the whole directory);
-- 20 a page, 60 searches a minute.
create function private.search_people(
  p_q text, p_department text default null, p_skill text default null, p_university text default null, p_offset integer default 0)
returns table (user_id uuid, username text, full_name text, department text, graduation_year smallint, university text,
               avatar_path text, skills text[], friendship text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_q text := btrim(coalesce(p_q, ''));
  v_query tsquery := private.prefix_tsquery(p_q);
  v_like text := private.contains_pattern(p_q);
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then
    return;
  end if;
  if not private.rate_limit('search:' || v_me::text, 60, interval '1 minute') then
    raise exception 'you''re searching too fast' using errcode = '54000';
  end if;
  return query
  select c.user_id, c.username, c.full_name, c.department, c.graduation_year, u.name,
         case when private.can_view_profile(c.user_id) then p.avatar_path end,
         case when private.can_view_profile(c.user_id) then
           array(select s.name from public.user_skills us join public.skills s on s.id = us.skill_id
                  where us.user_id = c.user_id and us.level >= 1 order by us.level desc, s.name limit 5)
         else '{}'::text[] end,
         case when private.are_friends(v_me, c.user_id) then 'friends'
              when exists (select 1 from public.friend_requests fr
                            where fr.sender_id = v_me and fr.receiver_id = c.user_id and fr.status = 'pending') then 'request_sent'
              when exists (select 1 from public.friend_requests fr
                            where fr.sender_id = c.user_id and fr.receiver_id = v_me and fr.status = 'pending') then 'request_received'
              else 'none' end
    from public.profiles_public_card c
    join public.profiles p on p.user_id = c.user_id and p.onboarding_complete
    left join public.universities u on u.id = p.university_id
   where c.username is not null
     and c.user_id <> v_me
     and not private.is_blocked_with(c.user_id)
     and (c.full_name ilike v_like or c.username ilike v_like or (v_query is not null and c.search @@ v_query))
     and (p_department is null or btrim(p_department) = '' or c.department ilike private.contains_pattern(p_department))
     and (p_university is null or u.slug = p_university)
     and (p_skill is null or (private.can_view_profile(c.user_id) and exists (
           select 1 from public.user_skills us where us.user_id = c.user_id and us.skill_id = p_skill and us.level >= 1)))
   order by lower(c.username) = lower(v_q) desc,
            extensions.similarity(c.full_name, v_q) desc,
            c.full_name, c.user_id
   limit 20 offset least(greatest(coalesce(p_offset, 0), 0), 200);
end;
$$;

-- Projects and startups you can see (never unlisted, never a blocked owner's), matching
-- the words or part of the title; newest first without a query.
create function private.search_ventures(
  p_q text, p_type public.venture_type, p_skill text default null, p_university text default null, p_offset integer default 0)
returns table (id uuid, type public.venture_type, title text, summary text, status public.venture_status,
               visibility public.venture_visibility, stage public.venture_stage, skill_ids text[],
               university_name text, owner_username text, owner_name text, members integer, team_size smallint,
               open_slots integer, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_q text := btrim(coalesce(p_q, ''));
  v_query tsquery := private.prefix_tsquery(p_q);
  v_like text := private.contains_pattern(p_q);
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.rate_limit('search:' || v_me::text, 60, interval '1 minute') then
    raise exception 'you''re searching too fast' using errcode = '54000';
  end if;
  return query
  -- The same row as browse_ventures, so the page shows the same Venture row.
  select v.id, v.type, v.title, left(v.description, 220), v.status, v.visibility, v.stage, v.skill_ids,
         u.name, o.username, o.full_name,
         (select count(*)::integer from public.venture_members vm where vm.venture_id = v.id),
         v.team_size,
         coalesce((select sum(r.slots - r.filled)::integer from public.venture_roles r where r.venture_id = v.id), 0),
         v.created_at
    from public.ventures v
    join public.profiles o on o.user_id = v.owner_id
    left join public.universities u on u.id = v.university_id
   where v.type = p_type
     and v.visibility <> 'unlisted'
     and v.status <> 'abandoned'
     and private.can_view_venture(v.id)
     and not private.is_blocked_with(v.owner_id)
     and (v_q = '' or v.title ilike v_like or (v_query is not null and v.search @@ v_query))
     and (p_skill is null or p_skill = any (v.skill_ids))
     and (p_university is null or u.slug = p_university)
   order by case when v_q = '' then 0
                 else coalesce(case when v_query is not null then ts_rank(v.search, v_query) end, 0) + extensions.similarity(v.title, v_q) end desc,
            v.created_at desc, v.id
   limit 20 offset least(greatest(coalesce(p_offset, 0), 0), 200);
end;
$$;

revoke all on function private.search_people(text, text, text, text, integer),
  private.search_ventures(text, public.venture_type, text, text, integer) from public;
grant execute on function private.search_people(text, text, text, text, integer),
  private.search_ventures(text, public.venture_type, text, text, integer) to authenticated;

create function public.search_people(
  p_q text, p_department text default null, p_skill text default null, p_university text default null, p_offset integer default 0)
returns table (user_id uuid, username text, full_name text, department text, graduation_year smallint, university text,
               avatar_path text, skills text[], friendship text)
  language sql volatile security invoker set search_path = ''
  as $$ select * from private.search_people(p_q, p_department, p_skill, p_university, p_offset) $$;
create function public.search_ventures(
  p_q text, p_type public.venture_type, p_skill text default null, p_university text default null, p_offset integer default 0)
returns table (id uuid, type public.venture_type, title text, summary text, status public.venture_status,
               visibility public.venture_visibility, stage public.venture_stage, skill_ids text[],
               university_name text, owner_username text, owner_name text, members integer, team_size smallint,
               open_slots integer, created_at timestamptz)
  language sql volatile security invoker set search_path = ''
  as $$ select * from private.search_ventures(p_q, p_type, p_skill, p_university, p_offset) $$;

revoke all on function public.search_people(text, text, text, text, integer),
  public.search_ventures(text, public.venture_type, text, text, integer) from public, anon;
grant execute on function public.search_people(text, text, text, text, integer),
  public.search_ventures(text, public.venture_type, text, text, integer) to authenticated;
