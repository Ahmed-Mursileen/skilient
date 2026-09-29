-- Phase 3 follow-up: Ahmed's answers to the phase 3 questions (decisions.md 2026-09-30).
--  * Chat reactions: one per person per message (a new emoji replaces the old one).
--  * Moderation notices: removals and warnings are instant email by default.
--  * Explore: name and username search spans every university; department and batch
--    (as filters or as words in the query) only reach the searcher's own university and
--    profiles set to Global.
--  * Moderators may also clear a profile's bio and photo and unlist a venture (audited).
--  * Image files are deleted when their post is deleted or removed, when a chat image's
--    message is deleted or removed, and when a profile photo is replaced or cleared:
--    triggers queue the paths and the storage-cleanup worker deletes them.

-- ---------------------------------------------------------------------------
-- Reactions: one per person
-- ---------------------------------------------------------------------------
delete from public.message_reactions r
 using public.message_reactions newer
 where newer.message_id = r.message_id and newer.user_id = r.user_id
   and (newer.created_at, newer.emoji) > (r.created_at, r.emoji);
alter table public.message_reactions drop constraint message_reactions_pkey;
alter table public.message_reactions add primary key (message_id, user_id);

-- The same emoji again takes the reaction back; a different one replaces it.
create or replace function private.toggle_reaction(p_message uuid, p_emoji text)
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
  insert into public.message_reactions (message_id, thread_id, user_id, emoji) values (p_message, v_thread, v_me, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation notices by instant email
-- ---------------------------------------------------------------------------
update public.notification_categories set default_channel = 'instant_email' where category = 'account';

-- ---------------------------------------------------------------------------
-- Explore: department and batch stay within your university (plus Global profiles)
-- ---------------------------------------------------------------------------
drop function public.search_people(text, text, text, text, integer);
drop function private.search_people(text, text, text, text, integer);
create function private.search_people(
  p_q text, p_department text default null, p_skill text default null, p_university text default null,
  p_offset integer default 0, p_batch smallint default null)
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
  v_mine uuid := private.current_university_id();
  v_cohort_filter boolean := coalesce(btrim(p_department), '') <> '' or p_batch is not null;
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
    cross join lateral (select p.university_id = v_mine or p.visibility = 'global' as in_scope) scope
   where c.username is not null
     and c.user_id <> v_me
     and not private.is_blocked_with(c.user_id)
     -- A name or username matches anywhere; department words only within scope.
     and (c.full_name ilike v_like or c.username ilike v_like
          or (v_query is not null and to_tsvector('simple', coalesce(c.full_name, '') || ' ' || coalesce(c.username, '')) @@ v_query)
          or (scope.in_scope and (c.department ilike v_like or (v_query is not null and c.search @@ v_query))))
     and (not v_cohort_filter or scope.in_scope)
     and (coalesce(btrim(p_department), '') = '' or c.department ilike private.contains_pattern(p_department))
     and (p_batch is null or c.graduation_year = p_batch)
     and (p_university is null or u.slug = p_university)
     and (p_skill is null or (private.can_view_profile(c.user_id) and exists (
           select 1 from public.user_skills us where us.user_id = c.user_id and us.skill_id = p_skill and us.level >= 1)))
   order by lower(c.username) = lower(v_q) desc,
            extensions.similarity(c.full_name, v_q) desc,
            c.full_name, c.user_id
   limit 20 offset least(greatest(coalesce(p_offset, 0), 0), 200);
end;
$$;
revoke all on function private.search_people(text, text, text, text, integer, smallint) from public;
grant execute on function private.search_people(text, text, text, text, integer, smallint) to authenticated;
create function public.search_people(
  p_q text, p_department text default null, p_skill text default null, p_university text default null,
  p_offset integer default 0, p_batch smallint default null)
returns table (user_id uuid, username text, full_name text, department text, graduation_year smallint, university text,
               avatar_path text, skills text[], friendship text)
  language sql volatile security invoker set search_path = ''
  as $$ select * from private.search_people(p_q, p_department, p_skill, p_university, p_offset, p_batch) $$;
revoke all on function public.search_people(text, text, text, text, integer, smallint) from public, anon;
grant execute on function public.search_people(text, text, text, text, integer, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage cleanup: triggers queue file paths, the storage-cleanup worker deletes them
-- ---------------------------------------------------------------------------
select pgmq.create('storage_cleanup');

create function private.queue_storage_cleanup(p_bucket text, p_path text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.send('storage_cleanup', jsonb_build_object('bucket', p_bucket, 'path', p_path))
   where p_path is not null and p_bucket in ('post-media', 'chat-media', 'avatars');
$$;
revoke all on function private.queue_storage_cleanup(text, text) from public;

-- A post's images go when the post is deleted (rows cascade) or removed (rows deleted).
create function private.post_media_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.queue_storage_cleanup('post-media', old.path);
  return null;
end;
$$;
create trigger post_media_cleanup after delete on public.post_media
  for each row execute function private.post_media_cleanup();

create function private.post_removed_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.post_media where post_id = new.id;
  return null;
end;
$$;
create trigger posts_removed_cleanup after update of removed_at on public.posts
  for each row when (old.removed_at is null and new.removed_at is not null)
  execute function private.post_removed_cleanup();

-- A chat image goes when its message is deleted or removed (media_path cleared).
create function private.chat_media_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.queue_storage_cleanup('chat-media', old.media_path);
  return null;
end;
$$;
create trigger chat_messages_media_cleanup after update of media_path on public.chat_messages
  for each row when (old.media_path is not null and new.media_path is distinct from old.media_path)
  execute function private.chat_media_cleanup();

-- A profile photo goes when it's replaced or cleared.
create function private.avatar_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.queue_storage_cleanup('avatars', old.avatar_path);
  return null;
end;
$$;
create trigger profiles_avatar_cleanup after update of avatar_path on public.profiles
  for each row when (old.avatar_path is not null and new.avatar_path is distinct from old.avatar_path)
  execute function private.avatar_cleanup();

revoke all on function private.post_media_cleanup(), private.post_removed_cleanup(), private.chat_media_cleanup(),
  private.avatar_cleanup() from public;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'storage_cleanup_worker_secret',
  'Bearer secret pg_cron uses to wake the storage-cleanup Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'storage_cleanup_worker_secret');

create function private.wake_storage_cleanup_worker()
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
  if not exists (select 1 from pgmq.q_storage_cleanup where vt <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'storage_cleanup_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/storage-cleanup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function private.wake_storage_cleanup_worker() from public;
select cron.schedule('storage-cleanup-worker', '* * * * *', $$select private.wake_storage_cleanup_worker()$$);

-- ---------------------------------------------------------------------------
-- Moderators: also clear a profile's bio and photo, or unlist a venture
-- ---------------------------------------------------------------------------
create or replace function private.resolve_case(p_case uuid, p_action text, p_reason text)
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
  v_notice text;
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
    if c.target_type = 'post' then
      update public.post_stats set reports = 0, updated_at = now() where post_id = c.target_id;
      update public.posts p set stage = coalesce(private.compute_stage(p.id), 'seed'), stage_changed_at = now()
       where p.id = c.target_id and p.stage = 'held';
    end if;
  elsif p_action = 'remove' then
    v_status := 'removed';
    v_notice := 'removed';
    if c.target_type = 'post' then
      update public.posts set removed_at = now(), removed_by = v_me where id = c.target_id and removed_at is null;
    elsif c.target_type = 'comment' then
      update public.post_comments set deleted_at = coalesce(deleted_at, now()), body = '', pinned = false, removed_by = v_me
       where id = c.target_id;
    elsif c.target_type = 'message' then
      update public.chat_messages
         set deleted_at = coalesce(deleted_at, now()), body = '', media_path = null, media_width = null, media_height = null,
             removed_by = v_me
       where id = c.target_id;
      delete from public.chat_pins where message_id = c.target_id;
    else
      raise exception 'use "clear bio and photo" for a profile or "unlist" for a venture' using errcode = '22023';
    end if;
    v_after := jsonb_build_object('removed', true);
  elsif p_action = 'clear_profile' then
    if c.target_type <> 'profile' then
      raise exception 'only a profile''s bio and photo can be cleared' using errcode = '22023';
    end if;
    v_status := 'removed';
    v_notice := 'cleared';
    select v_before || jsonb_build_object('bio', p.bio, 'avatar_path', p.avatar_path) into v_before
      from public.profiles p where p.user_id = c.target_id;
    update public.profiles set bio = null, avatar_path = null where user_id = c.target_id;
    v_after := jsonb_build_object('bio', null, 'avatar_path', null);
  elsif p_action = 'unlist' then
    if c.target_type <> 'venture' then
      raise exception 'only a venture can be unlisted' using errcode = '22023';
    end if;
    v_status := 'removed';
    v_notice := 'unlisted';
    select v_before || jsonb_build_object('visibility', v.visibility) into v_before from public.ventures v where v.id = c.target_id;
    update public.ventures set visibility = 'unlisted' where id = c.target_id;
    v_after := jsonb_build_object('visibility', 'unlisted');
  elsif p_action = 'warn' then
    v_status := 'warned';
    if c.owner_id is null then
      raise exception 'there''s no one to warn' using errcode = '22023';
    end if;
    insert into public.sanctions (user_id, kind, reason, staff_id, case_id) values (c.owner_id, 'warn', btrim(p_reason), v_me, c.id);
    perform private.notify(c.owner_id, null, 'moderation_warning', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  else
    raise exception 'choose dismiss, remove, clear, unlist or warn' using errcode = '22023';
  end if;

  if v_notice is not null then
    perform private.notify(c.owner_id, null, 'content_removed', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'action', v_notice,
                                              'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  end if;

  update public.report_cases
     set status = v_status, resolved_by = v_me, resolved_at = now(), resolution_reason = btrim(p_reason)
   where id = p_case;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'report.' || p_action, 'report_case', p_case::text, btrim(p_reason), v_before,
          v_after || jsonb_build_object('status', v_status));
end;
$$;

-- The owner's notice says which action was taken.
drop function public.my_moderation_notice(uuid);
drop function private.my_moderation_notice(uuid);
create function private.my_moderation_notice(p_case uuid)
returns table (target_type public.report_target, excerpt text, status public.report_case_status, reason text, action text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.target_type, left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 200), c.status,
         c.resolution_reason,
         (select substr(a.action, 8) from public.ops_audit_log a
           where a.target_type = 'report_case' and a.target_id = c.id::text and a.action like 'report.%'
             and a.action not in ('report.claim', 'report.release')
           order by a.created_at desc limit 1)
    from public.report_cases c
   where c.id = p_case and c.owner_id = (select auth.uid()) and c.status in ('removed', 'warned');
$$;
revoke all on function private.my_moderation_notice(uuid) from public;
grant execute on function private.my_moderation_notice(uuid) to authenticated;
create function public.my_moderation_notice(p_case uuid)
returns table (target_type public.report_target, excerpt text, status public.report_case_status, reason text, action text)
  language sql stable security invoker set search_path = '' as $$ select * from private.my_moderation_notice(p_case) $$;
revoke all on function public.my_moderation_notice(uuid) from public, anon;
grant execute on function public.my_moderation_notice(uuid) to authenticated;
