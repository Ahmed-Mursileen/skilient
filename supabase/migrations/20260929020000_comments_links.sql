-- Phase 3, slice 4: comments, hides, mutes and link previews (PRD 5.28).
-- Comments: 1-1,000 characters, one level of replies, @mentions, oldest first, the post
-- author pins one, 10 s cooldown, blocks respected; the post author, the person replied
-- to and mentioned people are notified (digest by default). "Not for me" hides a post;
-- muting someone takes their posts out of your feeds. Link previews are fetched by the
-- link-preview worker (SSRF-safe, 3 redirects, 3 s, cached 7 days).

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  parent_id uuid references public.post_comments (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) <= 1000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (deleted_at is not null or char_length(btrim(body)) >= 1),
  check (not pinned or parent_id is null)
);
comment on table public.post_comments is
  'Comments (PRD 5.28): one level of replies, written only by add_comment; deleted ones keep their place.';
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index post_comments_parent_idx on public.post_comments (parent_id) where parent_id is not null;
create index post_comments_author_idx on public.post_comments (author_id);
create unique index post_comments_one_pin_idx on public.post_comments (post_id) where pinned;

-- A reply's parent is a top-level comment on the same post (checked here as well as in
-- add_comment, so no path can nest deeper).
create function private.check_comment_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.post_comments c where c.id = new.parent_id and c.post_id = new.post_id and c.parent_id is null
  ) then
    raise exception 'replies go one level deep' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_comment_parent() from public;
create trigger post_comments_parent before insert or update of parent_id on public.post_comments
  for each row execute function private.check_comment_parent();

-- ---------------------------------------------------------------------------
-- Hides and mutes
-- ---------------------------------------------------------------------------
create table public.post_hides (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index post_hides_post_idx on public.post_hides (post_id);

create table public.user_mutes (
  user_id uuid not null references auth.users (id) on delete cascade,
  muted_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id),
  check (user_id <> muted_id)
);
create index user_mutes_muted_idx on public.user_mutes (muted_id);

-- ---------------------------------------------------------------------------
-- Link previews: shared cache keyed by the URL's hash, written only by the worker.
-- ---------------------------------------------------------------------------
create table public.link_previews (
  url_hash text primary key check (url_hash ~ '^[0-9a-f]{64}$'),
  url text not null check (char_length(url) <= 2000),
  status text not null check (status in ('ok', 'failed')),
  title text check (char_length(title) <= 300),
  description text check (char_length(description) <= 500),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2000)),
  site_name text check (char_length(site_name) <= 100),
  fetched_at timestamptz not null default now()
);
comment on table public.link_previews is 'Link preview cache (7 days), filled by the link-preview worker.';

alter table public.posts add column link_url text check (link_url is null or char_length(link_url) <= 2000);
comment on column public.posts.link_url is 'The first http(s) link in the body, previewed on the card.';

create function private.url_hash(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_url, 'sha256'), 'hex');
$$;
revoke all on function private.url_hash(text) from public;

select pgmq.create('link_previews');

-- Sets link_url from the body and queues a fetch unless a fresh preview is cached.
create function private.post_link_url()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  v_url := rtrim(substring(new.body from '(https?://[^\s<>"'']+)'), '.,;:!?)]');
  new.link_url := left(v_url, 2000);
  if new.link_url is not null and new.link_url is distinct from old.link_url and not exists (
    select 1 from public.link_previews lp
     where lp.url_hash = private.url_hash(new.link_url) and lp.fetched_at > now() - interval '7 days'
  ) then
    perform pgmq.send('link_previews', jsonb_build_object('url', new.link_url));
  end if;
  return new;
end;
$$;
revoke all on function private.post_link_url() from public;
create trigger posts_link_url before insert or update of body on public.posts
  for each row execute function private.post_link_url();

-- ---------------------------------------------------------------------------
-- RLS: reads only
-- ---------------------------------------------------------------------------
alter table public.post_comments enable row level security;
alter table public.post_hides enable row level security;
alter table public.user_mutes enable row level security;
alter table public.link_previews enable row level security;
revoke all on table public.post_comments, public.post_hides, public.user_mutes, public.link_previews from anon, authenticated;
grant select on table public.post_comments, public.post_hides, public.user_mutes, public.link_previews to authenticated;

-- Comments on posts you can see, never from someone blocked with you.
create policy post_comments_read on public.post_comments for select to authenticated
  using (private.can_view_post(post_id) and (author_id = (select auth.uid()) or not private.is_blocked_with(author_id)));
create policy post_hides_read_own on public.post_hides for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_mutes_read_own on public.user_mutes for select to authenticated
  using (user_id = (select auth.uid()));
create policy link_previews_read on public.link_previews for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Notifications for comments and mentions (digest by default, never instant)
-- ---------------------------------------------------------------------------
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('comments', 'Comments', 'Comments on your posts and replies to your comments.', 6, 'digest', false),
  ('mentions', 'Mentions', 'Someone mentions you with @username.', 7, 'digest', false);
insert into public.notification_types (type, category, emailed) values
  ('comment_received', 'comments', true),
  ('comment_reply', 'comments', true),
  ('comment_mention', 'mentions', true);

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
create function private.add_comment(p_post uuid, p_parent uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_post public.posts;
  v_parent public.post_comments;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_data jsonb;
  v_mentioned uuid;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into v_post from public.posts where id = p_post;
  if not found or not private.can_view_post(p_post) then
    raise exception 'that post doesn''t exist' using errcode = 'P0002';
  end if;
  if private.is_blocked(v_me, v_post.author_id) then
    raise exception 'that post doesn''t exist' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'comments are 1 to 1,000 characters' using errcode = '23514';
  end if;
  if p_parent is not null then
    select * into v_parent from public.post_comments where id = p_parent and post_id = p_post;
    if not found or v_parent.deleted_at is not null or private.is_blocked(v_me, v_parent.author_id) then
      raise exception 'that comment isn''t there any more' using errcode = 'P0002';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'replies go one level deep' using errcode = '23514';
    end if;
  end if;
  if not private.rate_limit('comment:' || v_me::text, 1, interval '10 seconds') then
    raise exception 'wait 10 seconds between comments' using errcode = '54000';
  end if;

  insert into public.post_comments (post_id, parent_id, author_id, body) values (p_post, p_parent, v_me, v_body)
  returning id into v_id;

  v_data := jsonb_build_object('post_id', p_post, 'comment_id', v_id, 'excerpt', left(v_body, 120));
  perform private.notify(v_post.author_id, v_me, 'comment_received', 'post', p_post, v_data);
  if p_parent is not null and v_parent.author_id <> v_post.author_id then
    perform private.notify(v_parent.author_id, v_me, 'comment_reply', 'post', p_post, v_data);
  end if;
  -- @mentions of people who can see the post (at most 5 per comment), not already notified.
  for v_mentioned in
    select distinct p.user_id
      from regexp_matches(v_body, '@([a-z0-9_]{3,30})', 'gi') as m(u)
      join public.profiles p on p.username = lower(m.u[1])
     where p.user_id not in (v_me, v_post.author_id, coalesce(v_parent.author_id, v_me))
     limit 5
  loop
    if exists (
      select 1 from public.posts pp join public.profiles pr on pr.user_id = v_mentioned
       where pp.id = p_post and (pp.audience = 'global' or pp.university_id = pr.university_id)
    ) then
      perform private.notify(v_mentioned, v_me, 'comment_mention', 'post', p_post, v_data);
    end if;
  end loop;
  return v_id;
end;
$$;

-- The comment's author or the post's author. Keeps the row so replies stay in context.
create function private.delete_comment(p_comment uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.post_comments c
     set deleted_at = now(), body = '', pinned = false
   where c.id = p_comment and c.deleted_at is null
     and (c.author_id = (select auth.uid())
          or exists (select 1 from public.posts p where p.id = c.post_id and p.author_id = (select auth.uid())));
  if not found then
    raise exception 'you can only delete your own comments, or comments on your post' using errcode = '42501';
  end if;
end;
$$;

-- The post's author pins one top-level comment (or unpins with p_pin = false).
create function private.pin_comment(p_comment uuid, p_pin boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.post_comments;
begin
  select c.* into v_c from public.post_comments c join public.posts p on p.id = c.post_id
   where c.id = p_comment and p.author_id = (select auth.uid()) and c.deleted_at is null;
  if not found then
    raise exception 'only the post''s author pins comments' using errcode = '42501';
  end if;
  if v_c.parent_id is not null then
    raise exception 'only top-level comments can be pinned' using errcode = '22023';
  end if;
  update public.post_comments set pinned = false where post_id = v_c.post_id and pinned and id <> p_comment;
  update public.post_comments set pinned = p_pin where id = p_comment;
end;
$$;

create function private.hide_post(p_post uuid, p_hide boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.can_view_post(p_post) then
    raise exception 'that post doesn''t exist' using errcode = 'P0002';
  end if;
  if p_hide then
    insert into public.post_hides (user_id, post_id) values ((select auth.uid()), p_post) on conflict do nothing;
  else
    delete from public.post_hides where user_id = (select auth.uid()) and post_id = p_post;
  end if;
end;
$$;

create function private.mute_user(p_username text, p_mute boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid := private.user_id_for(p_username);
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_other is null or private.is_blocked(v_me, v_other) then
    raise exception 'no one has that username' using errcode = 'P0002';
  end if;
  if v_other = v_me then
    raise exception 'you can''t mute yourself' using errcode = '22023';
  end if;
  if p_mute then
    insert into public.user_mutes (user_id, muted_id) values (v_me, v_other) on conflict do nothing;
  else
    delete from public.user_mutes where user_id = v_me and muted_id = v_other;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- A post's comments: pinned first, then oldest first; replies follow their parent.
create function private.post_comment_list(p_post uuid)
returns table (id uuid, parent_id uuid, body text, pinned boolean, deleted boolean, created_at timestamptz,
               author_username text, author_name text, author_avatar_path text, is_mine boolean, can_delete boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.body, c.pinned, c.deleted_at is not null, c.created_at,
         case when c.deleted_at is null and private.can_view_profile(c.author_id) then a.username end,
         case when c.deleted_at is null then a.full_name end,
         case when c.deleted_at is null and private.can_view_profile(c.author_id) then a.avatar_path end,
         c.author_id = (select auth.uid()),
         c.deleted_at is null and (c.author_id = (select auth.uid()) or p.author_id = (select auth.uid()))
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    join public.profiles a on a.user_id = c.author_id
   where c.post_id = p_post
     and private.can_view_post(p_post)
     and (c.author_id = (select auth.uid()) or not private.is_blocked_with(c.author_id))
   order by coalesce((select pc.pinned from public.post_comments pc where pc.id = coalesce(c.parent_id, c.id)), false) desc,
            coalesce((select pc.created_at from public.post_comments pc where pc.id = c.parent_id), c.created_at),
            c.parent_id nulls first, c.created_at;
$$;

create function private.my_mutes()
returns table (username text, full_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.full_name, m.created_at
    from public.user_mutes m join public.profiles p on p.user_id = m.muted_id
   where m.user_id = (select auth.uid())
   order by m.created_at desc;
$$;

revoke all on function private.add_comment(uuid, uuid, text), private.delete_comment(uuid), private.pin_comment(uuid, boolean),
  private.hide_post(uuid, boolean), private.mute_user(text, boolean), private.post_comment_list(uuid), private.my_mutes()
  from public;
grant execute on function private.add_comment(uuid, uuid, text), private.delete_comment(uuid), private.pin_comment(uuid, boolean),
  private.hide_post(uuid, boolean), private.mute_user(text, boolean), private.post_comment_list(uuid), private.my_mutes()
  to authenticated;

create function public.add_comment(p_post uuid, p_parent uuid, p_body text) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.add_comment(p_post, p_parent, p_body) $$;
create function public.delete_comment(p_comment uuid) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.delete_comment(p_comment) $$;
create function public.pin_comment(p_comment uuid, p_pin boolean) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.pin_comment(p_comment, p_pin) $$;
create function public.hide_post(p_post uuid, p_hide boolean) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.hide_post(p_post, p_hide) $$;
create function public.mute_user(p_username text, p_mute boolean) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.mute_user(p_username, p_mute) $$;
create function public.post_comment_list(p_post uuid)
returns table (id uuid, parent_id uuid, body text, pinned boolean, deleted boolean, created_at timestamptz,
               author_username text, author_name text, author_avatar_path text, is_mine boolean, can_delete boolean)
  language sql stable security invoker set search_path = '' as $$ select * from private.post_comment_list(p_post) $$;
create function public.my_mutes() returns table (username text, full_name text, created_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.my_mutes() $$;

revoke all on function public.add_comment(uuid, uuid, text), public.delete_comment(uuid), public.pin_comment(uuid, boolean),
  public.hide_post(uuid, boolean), public.mute_user(text, boolean), public.post_comment_list(uuid), public.my_mutes()
  from public, anon;
grant execute on function public.add_comment(uuid, uuid, text), public.delete_comment(uuid), public.pin_comment(uuid, boolean),
  public.hide_post(uuid, boolean), public.mute_user(text, boolean), public.post_comment_list(uuid), public.my_mutes()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Feed lists skip hidden posts and muted authors (a profile's own list still shows them)
-- ---------------------------------------------------------------------------
create or replace function private.list_posts(p_scope text, p_filter text default 'all', p_before timestamptz default null,
                                              p_before_id uuid default null, p_author uuid default null, p_limit integer default 20)
returns table (id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.created_at
    from public.posts p
   where private.can_view_post(p.id)
     and case p_scope
           when 'university' then p.university_id = (select private.current_university_id())
           when 'global' then p.audience = 'global'
           when 'author' then p.author_id = p_author
           else false
         end
     and (p_scope = 'author' or not exists (
           select 1 from public.post_hides h where h.user_id = (select auth.uid()) and h.post_id = p.id))
     and (p_scope = 'author' or not exists (
           select 1 from public.user_mutes m where m.user_id = (select auth.uid()) and m.muted_id = p.author_id))
     and case coalesce(p_filter, 'all')
           when 'ventures' then p.type = 'invite'
           when 'events' then p.type = 'event'
           when 'announcements' then p.type = 'announcement'
           when 'shipped' then p.type = 'shipped'
           else true
         end
     and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by p.created_at desc, p.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- post_cards gains the comment count, link preview and whether you muted the author.
drop function public.post_cards(uuid[]);
drop function private.post_cards(uuid[]);
create function private.post_cards(p_ids uuid[])
returns table (
  id uuid, type public.post_type, audience public.post_audience, body text, created_at timestamptz,
  edited_at timestamptz, pinned_until timestamptz, stage public.post_stage,
  author_id uuid, author_username text, author_name text, author_avatar_path text, is_mine boolean,
  can_edit boolean, media jsonb, event jsonb, poll jsonb, venture jsonb,
  comment_count integer, link jsonb, author_muted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.type, p.audience, p.body, p.created_at, p.edited_at, p.pinned_until, p.stage,
         p.author_id, a.username, a.full_name,
         case when private.can_view_profile(p.author_id) then a.avatar_path end,
         p.author_id = (select auth.uid()),
         p.author_id = (select auth.uid()) and p.type <> 'shipped' and now() < p.created_at + interval '15 minutes',
         coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'width', m.width, 'height', m.height) order by m.position)
                     from public.post_media m where m.post_id = p.id), '[]'::jsonb),
         (select jsonb_build_object(
                   'starts_at', e.starts_at, 'place', e.place, 'url', e.url,
                   'going', (select count(*) from public.event_rsvps r where r.post_id = e.post_id and r.status = 'going'),
                   'interested', (select count(*) from public.event_rsvps r where r.post_id = e.post_id and r.status = 'interested'),
                   'mine', (select r.status from public.event_rsvps r where r.post_id = e.post_id and r.user_id = (select auth.uid())))
            from public.post_events e where e.post_id = p.id),
         (select jsonb_build_object(
                   'closes_at', pl.closes_at,
                   'closed', now() >= pl.closes_at,
                   'my_vote', mv.position,
                   'total', (select count(*) from public.poll_votes v where v.post_id = pl.post_id),
                   'options', (select jsonb_agg(jsonb_build_object(
                                 'position', o.position, 'label', o.label,
                                 'votes', case when mv.position is not null or now() >= pl.closes_at or p.author_id = (select auth.uid())
                                               then (select count(*) from public.poll_votes v where v.post_id = o.post_id and v.position = o.position) end)
                               order by o.position)
                                 from public.poll_options o where o.post_id = pl.post_id))
            from public.post_polls pl
            left join public.poll_votes mv on mv.post_id = pl.post_id and mv.user_id = (select auth.uid())
           where pl.post_id = p.id),
         (select case when private.can_view_venture(v.id) then jsonb_build_object(
                   'id', v.id, 'title', v.title, 'type', v.type, 'status', v.status, 'visibility', v.visibility,
                   'members', (select count(*) from public.venture_members vm where vm.venture_id = v.id),
                   'team_size', v.team_size,
                   'is_member', private.is_venture_member(v.id),
                   'my_application', (select t.status from public.application_threads t
                                       where t.venture_id = v.id and t.candidate_id = (select auth.uid())
                                       order by t.created_at desc limit 1),
                   'roles', coalesce((select jsonb_agg(jsonb_build_object('title', r.title, 'open', r.slots - r.filled) order by r.created_at)
                                        from public.venture_roles r where r.venture_id = v.id and r.filled < r.slots), '[]'::jsonb),
                   'team', case when p.type = 'shipped' then
                             coalesce((select jsonb_agg(jsonb_build_object(
                                         'name', mp.full_name,
                                         'username', case when private.can_view_profile(vm.user_id) then mp.username end)
                                       order by (vm.user_id = v.owner_id) desc, vm.joined_at)
                                         from public.venture_members vm join public.profiles mp on mp.user_id = vm.user_id
                                        where vm.venture_id = v.id and not private.is_blocked_with(vm.user_id)), '[]'::jsonb) end)
                 end
            from public.ventures v where v.id = p.venture_id),
         (select count(*)::integer from public.post_comments c
           where c.post_id = p.id and c.deleted_at is null
             and (c.author_id = (select auth.uid()) or not private.is_blocked_with(c.author_id))),
         (select jsonb_build_object('url', lp.url, 'title', lp.title, 'description', lp.description,
                                    'image_url', lp.image_url, 'site_name', lp.site_name)
            from public.link_previews lp
           where p.link_url is not null and lp.url_hash = private.url_hash(p.link_url) and lp.status = 'ok'),
         exists (select 1 from public.user_mutes m where m.user_id = (select auth.uid()) and m.muted_id = p.author_id)
    from unnest(p_ids) with ordinality as ids(id, ord)
    join public.posts p on p.id = ids.id
    join public.profiles a on a.user_id = p.author_id
   where private.can_view_post(p.id)
   order by ids.ord;
$$;
revoke all on function private.post_cards(uuid[]) from public;
grant execute on function private.post_cards(uuid[]) to authenticated;
create function public.post_cards(p_ids uuid[])
returns table (
  id uuid, type public.post_type, audience public.post_audience, body text, created_at timestamptz,
  edited_at timestamptz, pinned_until timestamptz, stage public.post_stage,
  author_id uuid, author_username text, author_name text, author_avatar_path text, is_mine boolean,
  can_edit boolean, media jsonb, event jsonb, poll jsonb, venture jsonb,
  comment_count integer, link jsonb, author_muted boolean
)
  language sql stable security invoker set search_path = '' as $$ select * from private.post_cards(p_ids) $$;
revoke all on function public.post_cards(uuid[]) from public, anon;
grant execute on function public.post_cards(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- The link-preview worker (Edge Function), woken each minute while there is work
-- ---------------------------------------------------------------------------
-- The worker writes previews through this (it connects as the database owner; the
-- function keeps the shape and the 7-day cache in one place).
create function private.save_link_preview(p_url text, p_status text, p_title text, p_description text,
                                          p_image_url text, p_site_name text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.link_previews (url_hash, url, status, title, description, image_url, site_name, fetched_at)
  values (private.url_hash(p_url), left(p_url, 2000), p_status, left(p_title, 300), left(p_description, 500),
          case when p_image_url ~ '^https://' then left(p_image_url, 2000) end, left(p_site_name, 100), now())
  on conflict (url_hash) do update
    set status = excluded.status, title = excluded.title, description = excluded.description,
        image_url = excluded.image_url, site_name = excluded.site_name, fetched_at = excluded.fetched_at, url = excluded.url;
$$;
revoke all on function private.save_link_preview(text, text, text, text, text, text) from public;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'link_preview_worker_secret',
  'Bearer secret pg_cron uses to wake the link-preview Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'link_preview_worker_secret');

create function private.wake_link_preview_worker()
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
  if not exists (select 1 from pgmq.q_link_previews where vt <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'link_preview_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/link-preview',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function private.wake_link_preview_worker() from public;
select cron.schedule('link-preview-worker', '* * * * *', $$select private.wake_link_preview_worker()$$);

-- Previews older than 30 days are refetched on next use; drop them after that.
select cron.schedule('purge-link-previews', '41 3 * * *',
  $$delete from public.link_previews where fetched_at < now() - interval '30 days'$$);
