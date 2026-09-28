-- Phase 3, slice 3: posts (PRD 5.6, 5.28; decisions.md 2026-09-28/29).
-- General, venture invite, announcement (staff only until phases 7/9), event (RSVP),
-- poll and Shipped (system, on venture completion). No likes, reactions, saves or shares.
-- Reads through RLS (university posts to the author's university, global posts to every
-- signed-in user, never across a block); every write is a function in `private`.
-- The ranked feed (stages, scoring) arrives in slice 6; `stage` exists now so Shipped
-- posts can start at Full.

create type public.post_audience as enum ('university', 'global');
create type public.post_type as enum ('general', 'invite', 'announcement', 'event', 'poll', 'shipped');
create type public.post_stage as enum ('seed', 'limited', 'full', 'global_boost', 'demoted', 'held');
create type public.rsvp_status as enum ('going', 'interested');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  -- The author's university when posting: the University Feed it belongs to.
  university_id uuid references public.universities (id) on delete restrict,
  audience public.post_audience not null,
  type public.post_type not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  venture_id uuid references public.ventures (id) on delete cascade,
  stage public.post_stage not null default 'seed',
  stage_changed_at timestamptz not null default now(),
  pinned_until timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check ((type in ('invite', 'shipped')) = (venture_id is not null)),
  check (pinned_until is null or type = 'announcement'),
  check (university_id is not null or audience = 'global')
);
comment on table public.posts is
  'Feed posts (PRD 5.6, 5.28). Written only by the post functions; readers see them through RLS.';
create index posts_university_created_idx on public.posts (university_id, created_at desc);
create index posts_global_created_idx on public.posts (created_at desc) where audience = 'global';
create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_venture_idx on public.posts (venture_id) where venture_id is not null;
create index posts_pinned_idx on public.posts (pinned_until) where pinned_until is not null;
-- One Shipped post per venture.
create unique index posts_shipped_once_idx on public.posts (venture_id) where type = 'shipped';

create table public.post_media (
  post_id uuid not null references public.posts (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  primary key (post_id, position)
);

create table public.post_events (
  post_id uuid primary key references public.posts (id) on delete cascade,
  starts_at timestamptz not null,
  place text check (place is null or char_length(btrim(place)) between 2 and 120),
  url text check (url is null or (url ~ '^https://[^\s]+$' and char_length(url) <= 500)),
  check (place is not null or url is not null)
);

create table public.event_rsvps (
  post_id uuid not null references public.post_events (post_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.rsvp_status not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index event_rsvps_user_idx on public.event_rsvps (user_id);

create table public.post_polls (
  post_id uuid primary key references public.posts (id) on delete cascade,
  closes_at timestamptz not null
);

create table public.poll_options (
  post_id uuid not null references public.post_polls (post_id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  primary key (post_id, position)
);

create table public.poll_votes (
  post_id uuid not null references public.post_polls (post_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position smallint not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),
  foreign key (post_id, position) references public.poll_options (post_id, position) on delete cascade
);
create index poll_votes_user_idx on public.poll_votes (user_id);

-- Venture update images (decisions.md 2026-09-28: same pipeline as posts).
create table public.venture_update_media (
  update_id uuid not null references public.venture_updates (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  primary key (update_id, position)
);

-- ---------------------------------------------------------------------------
-- Post images: public-read bucket with unguessable paths (like avatars), written only as
-- re-encoded WebP by the app into the author's own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', true, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy post_media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy post_media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy post_media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------
-- Who may read a post: its author; otherwise nobody blocked with the author, and global
-- posts to every signed-in user, university posts to that university. Held posts
-- (slice 6/9) only to the author.
create function private.can_view_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_post
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
revoke all on function private.can_view_post(uuid) from public;
grant execute on function private.can_view_post(uuid) to authenticated;

alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.post_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.venture_update_media enable row level security;
revoke all on table public.posts, public.post_media, public.post_events, public.event_rsvps, public.post_polls,
  public.poll_options, public.poll_votes, public.venture_update_media from anon, authenticated;
grant select on table public.posts, public.post_media, public.post_events, public.event_rsvps, public.post_polls,
  public.poll_options, public.poll_votes, public.venture_update_media to authenticated;

create policy posts_read on public.posts for select to authenticated
  using (
    author_id = (select auth.uid())
    or (
      stage <> 'held'
      and not private.is_blocked_with(author_id)
      and (audience = 'global' or university_id = (select private.current_university_id()))
    )
  );
create policy post_media_read on public.post_media for select to authenticated
  using (private.can_view_post(post_id));
create policy post_events_read on public.post_events for select to authenticated
  using (private.can_view_post(post_id));
create policy post_polls_read on public.post_polls for select to authenticated
  using (private.can_view_post(post_id));
create policy poll_options_read on public.poll_options for select to authenticated
  using (private.can_view_post(post_id));
-- Your own vote and RSVP only; totals come from post_cards().
create policy poll_votes_read_own on public.poll_votes for select to authenticated
  using (user_id = (select auth.uid()));
create policy event_rsvps_read_own on public.event_rsvps for select to authenticated
  using (user_id = (select auth.uid()));
create policy venture_update_media_read on public.venture_update_media for select to authenticated
  using (exists (select 1 from public.venture_updates u where u.id = update_id and private.can_view_venture(u.venture_id)));

-- New posts pill (slice 6) listens to inserts; RLS applies to the stream.
alter publication supabase_realtime add table public.posts;

-- ---------------------------------------------------------------------------
-- Writing posts
-- ---------------------------------------------------------------------------
-- Checks that each image path is the caller's own, freshly uploaded object.
create function private.check_media(p_media jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m jsonb;
begin
  if p_media is null or jsonb_typeof(p_media) <> 'array' then
    raise exception 'media must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_media) > 4 then
    raise exception 'up to 4 images per post' using errcode = '23514';
  end if;
  for m in select * from jsonb_array_elements(p_media) loop
    if split_part(m->>'path', '/', 1) <> (select auth.uid())::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'post-media' and o.name = m->>'path') then
      raise exception 'an image is missing; upload it again' using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke all on function private.check_media(jsonb) from public;

-- p: { type, audience, body, media: [{path,width,height}], venture_id, event: {starts_at,
-- place, url}, poll: {options: [..], days}, pin_days }. Returns the new post id.
create function private.create_post(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_uni uuid;
  v_type public.post_type;
  v_audience public.post_audience;
  v_body text := btrim(coalesce(p->>'body', ''));
  v_media jsonb := coalesce(p->'media', '[]'::jsonb);
  v_venture public.ventures;
  v_id uuid;
  v_pin timestamptz;
  v_options jsonb;
  v_starts timestamptz;
  i integer;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select pr.university_id into v_uni from public.profiles pr where pr.user_id = v_me and pr.onboarding_complete;
  if not found then
    raise exception 'finish setting up your account first' using errcode = '42501';
  end if;
  begin
    v_type := (p->>'type')::public.post_type;
    v_audience := coalesce(p->>'audience', 'university')::public.post_audience;
  exception when invalid_text_representation then
    raise exception 'unknown post type or audience' using errcode = '22023';
  end;
  if v_type = 'shipped' then
    raise exception 'Shipped posts are created when a venture completes' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'posts are 1 to 2,000 characters' using errcode = '23514';
  end if;
  perform private.check_media(v_media);
  if jsonb_array_length(v_media) > 0 and v_type not in ('general', 'invite', 'event') then
    raise exception 'images go on general, invite and event posts' using errcode = '22023';
  end if;

  if v_type = 'announcement' then
    -- Until university admins and faculty exist (phases 7 and 9), staff only, as platform news.
    if not private.is_staff() then
      raise exception 'only Skilient staff post announcements for now' using errcode = '42501';
    end if;
    v_audience := 'global';
    if coalesce((p->>'pin_days')::integer, 0) > 0 then
      v_pin := now() + make_interval(days => least((p->>'pin_days')::integer, 7));
    end if;
  end if;

  if v_type = 'invite' then
    select * into v_venture from public.ventures v where v.id = (p->>'venture_id')::uuid for share;
    if not found or v_venture.owner_id <> v_me then
      raise exception 'only the owner of a venture can post an invite for it' using errcode = '42501';
    end if;
    if v_venture.status not in ('recruiting', 'in_progress') then
      raise exception 'this venture isn''t taking applications' using errcode = '55000';
    end if;
    if v_venture.visibility = 'unlisted' then
      raise exception 'unlisted ventures take members by invite only' using errcode = '22023';
    end if;
    if v_venture.visibility = 'university' and v_audience = 'global' then
      raise exception 'a university-only venture can only be posted to your University Feed' using errcode = '22023';
    end if;
  end if;

  if v_type = 'event' then
    begin
      v_starts := (p->'event'->>'starts_at')::timestamptz;
    exception when others then
      raise exception 'give the event a date and time' using errcode = '22023';
    end;
    if v_starts is null or v_starts < now() - interval '1 hour' or v_starts > now() + interval '1 year' then
      raise exception 'events start within the next year' using errcode = '22023';
    end if;
  end if;

  if v_type = 'poll' then
    v_options := p->'poll'->'options';
    if v_options is null or jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) not between 2 and 4 then
      raise exception 'polls have 2 to 4 options' using errcode = '23514';
    end if;
    if coalesce((p->'poll'->>'days')::integer, 0) not between 1 and 7 then
      raise exception 'polls close after 1 to 7 days' using errcode = '23514';
    end if;
  end if;

  -- 30 seconds between posts (PRD 5.6).
  if not private.rate_limit('post:' || v_me::text, 1, interval '30 seconds') then
    raise exception 'wait 30 seconds between posts' using errcode = '54000';
  end if;

  insert into public.posts (author_id, university_id, audience, type, body, venture_id, pinned_until)
  values (v_me, v_uni, v_audience, v_type, v_body, case when v_type = 'invite' then v_venture.id end, v_pin)
  returning id into v_id;

  if v_pin is not null then
    -- One pinned announcement at a time.
    update public.posts set pinned_until = null where pinned_until is not null and id <> v_id;
  end if;

  insert into public.post_media (post_id, position, path, width, height)
  select v_id, e.ord, e.m->>'path', (e.m->>'width')::integer, (e.m->>'height')::integer
    from jsonb_array_elements(v_media) with ordinality as e(m, ord);

  if v_type = 'event' then
    insert into public.post_events (post_id, starts_at, place, url)
    values (v_id, v_starts, nullif(btrim(p->'event'->>'place'), ''), nullif(btrim(p->'event'->>'url'), ''));
  end if;
  if v_type = 'poll' then
    insert into public.post_polls (post_id, closes_at)
    values (v_id, now() + make_interval(days => (p->'poll'->>'days')::integer));
    for i in 0 .. jsonb_array_length(v_options) - 1 loop
      insert into public.poll_options (post_id, position, label) values (v_id, i + 1, btrim(v_options->>i));
    end loop;
  end if;
  return v_id;
end;
$$;

-- Body only, by the author, within 15 minutes of posting (PRD 5.28).
create function private.edit_post(p_post uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  select * into v_post from public.posts where id = p_post and author_id = (select auth.uid()) for update;
  if not found or v_post.type = 'shipped' then
    raise exception 'you can only edit your own posts' using errcode = '42501';
  end if;
  if now() >= v_post.created_at + interval '15 minutes' then
    raise exception 'posts can be edited for 15 minutes after posting' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'posts are 1 to 2,000 characters' using errcode = '23514';
  end if;
  update public.posts set body = btrim(p_body), edited_at = now() where id = p_post;
end;
$$;

-- The author deletes a post (Shipped posts belong to the team and stay). Returns the image
-- paths so the app removes the files.
create function private.delete_post(p_post uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paths text[];
begin
  select coalesce(array_agg(m.path), '{}') into v_paths from public.post_media m where m.post_id = p_post;
  delete from public.posts where id = p_post and author_id = (select auth.uid()) and type <> 'shipped';
  if not found then
    raise exception 'you can only delete your own posts' using errcode = '42501';
  end if;
  return v_paths;
end;
$$;

-- One vote per reader, while the poll is open; not on your own poll.
create function private.vote_poll(p_post uuid, p_position smallint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_closes timestamptz;
begin
  if not private.can_view_post(p_post) then
    raise exception 'that poll doesn''t exist' using errcode = 'P0002';
  end if;
  select closes_at into v_closes from public.post_polls where post_id = p_post;
  if not found then
    raise exception 'that poll doesn''t exist' using errcode = 'P0002';
  end if;
  if now() >= v_closes then
    raise exception 'this poll has closed' using errcode = '55000';
  end if;
  if not exists (select 1 from public.poll_options where post_id = p_post and position = p_position) then
    raise exception 'pick one of the options' using errcode = '22023';
  end if;
  begin
    insert into public.poll_votes (post_id, user_id, position) values (p_post, v_me, p_position);
  exception when unique_violation then
    raise exception 'you''ve already voted' using errcode = '23505';
  end;
end;
$$;

-- Going / Interested, or null to clear. Not on past events.
create function private.rsvp_event(p_post uuid, p_status public.rsvp_status)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.can_view_post(p_post) or not exists (select 1 from public.post_events where post_id = p_post) then
    raise exception 'that event doesn''t exist' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.post_events where post_id = p_post and starts_at < now() - interval '6 hours') then
    raise exception 'this event has already happened' using errcode = '55000';
  end if;
  if p_status is null then
    delete from public.event_rsvps where post_id = p_post and user_id = v_me;
  else
    insert into public.event_rsvps (post_id, user_id, status) values (p_post, v_me, p_status)
    on conflict (post_id, user_id) do update set status = excluded.status, created_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shipped posts: created when a venture completes (PRD 5.28), authored by the owner,
-- starting at Full. Unlisted ventures stay unannounced.
-- ---------------------------------------------------------------------------
create function private.post_shipped()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.visibility <> 'unlisted' then
    insert into public.posts (author_id, university_id, audience, type, body, venture_id, stage)
    values (new.owner_id, new.university_id,
            case when new.visibility = 'public' then 'global' else 'university' end::public.post_audience,
            'shipped', left(format('%s shipped %s.', (select p.full_name from public.profiles p where p.user_id = new.owner_id), new.title), 2000),
            new.id, 'full')
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function private.post_shipped() from public;
create trigger ventures_post_shipped after update of status on public.ventures
  for each row execute function private.post_shipped();

-- ---------------------------------------------------------------------------
-- Venture updates with images
-- ---------------------------------------------------------------------------
create function private.post_venture_update_media(p_venture uuid, p_body text, p_media jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.check_media(coalesce(p_media, '[]'::jsonb));
  v_id := private.post_venture_update(p_venture, p_body);
  insert into public.venture_update_media (update_id, position, path, width, height)
  select v_id, e.ord, e.m->>'path', (e.m->>'width')::integer, (e.m->>'height')::integer
    from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) with ordinality as e(m, ord);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading: one round trip for a page of post cards
-- ---------------------------------------------------------------------------
-- Everything a card needs, for the ids given, in their order, skipping any the caller
-- can't see. Poll counts show once you've voted, the poll has closed, or it's yours.
create function private.post_cards(p_ids uuid[])
returns table (
  id uuid, type public.post_type, audience public.post_audience, body text, created_at timestamptz,
  edited_at timestamptz, pinned_until timestamptz, stage public.post_stage,
  author_id uuid, author_username text, author_name text, author_avatar_path text, is_mine boolean,
  can_edit boolean, media jsonb, event jsonb, poll jsonb, venture jsonb
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
            from public.ventures v where v.id = p.venture_id)
    from unnest(p_ids) with ordinality as ids(id, ord)
    join public.posts p on p.id = ids.id
    join public.profiles a on a.user_id = p.author_id
   where private.can_view_post(p.id)
   order by ids.ord;
$$;

-- Newest-first ids for the interim chronological feed (replaced by feed_page in slice 6),
-- a profile's Activity tab, or a venture's posts. Cursor: (created_at, id) of the last row.
create function private.list_posts(p_scope text, p_filter text default 'all', p_before timestamptz default null,
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

revoke all on function private.create_post(jsonb), private.edit_post(uuid, text), private.delete_post(uuid),
  private.vote_poll(uuid, smallint), private.rsvp_event(uuid, public.rsvp_status),
  private.post_venture_update_media(uuid, text, jsonb), private.post_cards(uuid[]),
  private.list_posts(text, text, timestamptz, uuid, uuid, integer) from public;
grant execute on function private.create_post(jsonb), private.edit_post(uuid, text), private.delete_post(uuid),
  private.vote_poll(uuid, smallint), private.rsvp_event(uuid, public.rsvp_status),
  private.post_venture_update_media(uuid, text, jsonb), private.post_cards(uuid[]),
  private.list_posts(text, text, timestamptz, uuid, uuid, integer) to authenticated;

create function public.create_post(p jsonb) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.create_post(p) $$;
create function public.edit_post(p_post uuid, p_body text) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.edit_post(p_post, p_body) $$;
create function public.delete_post(p_post uuid) returns text[]
  language sql volatile security invoker set search_path = '' as $$ select private.delete_post(p_post) $$;
create function public.vote_poll(p_post uuid, p_position smallint) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.vote_poll(p_post, p_position) $$;
create function public.rsvp_event(p_post uuid, p_status public.rsvp_status) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.rsvp_event(p_post, p_status) $$;
create function public.post_venture_update_media(p_venture uuid, p_body text, p_media jsonb) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.post_venture_update_media(p_venture, p_body, p_media) $$;
create function public.post_cards(p_ids uuid[])
returns table (
  id uuid, type public.post_type, audience public.post_audience, body text, created_at timestamptz,
  edited_at timestamptz, pinned_until timestamptz, stage public.post_stage,
  author_id uuid, author_username text, author_name text, author_avatar_path text, is_mine boolean,
  can_edit boolean, media jsonb, event jsonb, poll jsonb, venture jsonb
)
  language sql stable security invoker set search_path = '' as $$ select * from private.post_cards(p_ids) $$;
create function public.list_posts(p_scope text, p_filter text default 'all', p_before timestamptz default null,
                                  p_before_id uuid default null, p_author uuid default null, p_limit integer default 20)
returns table (id uuid, created_at timestamptz)
  language sql stable security invoker set search_path = ''
  as $$ select * from private.list_posts(p_scope, p_filter, p_before, p_before_id, p_author, p_limit) $$;

revoke all on function public.create_post(jsonb), public.edit_post(uuid, text), public.delete_post(uuid),
  public.vote_poll(uuid, smallint), public.rsvp_event(uuid, public.rsvp_status),
  public.post_venture_update_media(uuid, text, jsonb), public.post_cards(uuid[]),
  public.list_posts(text, text, timestamptz, uuid, uuid, integer) from public, anon;
grant execute on function public.create_post(jsonb), public.edit_post(uuid, text), public.delete_post(uuid),
  public.vote_poll(uuid, smallint), public.rsvp_event(uuid, public.rsvp_status),
  public.post_venture_update_media(uuid, text, jsonb), public.post_cards(uuid[]),
  public.list_posts(text, text, timestamptz, uuid, uuid, integer) to authenticated;
