-- Phase 9, part 3: university communication and moderation (PRD 5.23; decisions.md 2026-10-04).
--
-- Announcements: posts of type `announcement` with audience university, targeted to the whole
-- university, departments and/or batches, with a category, an expiry, one pin per university and
-- in-app notifications (digest, never instant: the email cap can't take a campus-wide send).
-- At most 3 a day per university.
-- Events: `events` + `event_registrations` (the post-event `event_rsvps` stays for student event
-- posts), capacity under a row lock, a rotating HMAC check-in code (30 s windows) and reminders.
-- Moderation: an owner or admin hides a University Feed post or comment; it disappears for everyone
-- but its author at once, the author is told why, and a case opens in Skilient's queue. Dismissing
-- (or warning on) that case restores it; removing removes it. Every hide and reversal is kept.

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table public.announcement_meta (
  post_id uuid primary key references public.posts (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete cascade,
  category text check (category is null or char_length(category) between 2 and 40),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.announcement_meta is 'University announcements: category and expiry (PRD 5.23). Written by uni_post_announcement only.';
create index announcement_meta_uni_idx on public.announcement_meta (university_id, created_at desc);
create index announcement_meta_created_by_idx on public.announcement_meta (created_by);

create table public.announcement_targets (
  post_id uuid not null references public.announcement_meta (post_id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  batch_year smallint check (batch_year is null or batch_year between 1980 and 2100),
  check (department_id is not null or batch_year is not null)
);
comment on table public.announcement_targets is 'Who an announcement reaches; no rows = the whole university.';
create index announcement_targets_post_idx on public.announcement_targets (post_id);
create index announcement_targets_department_idx on public.announcement_targets (department_id);

alter table public.announcement_meta enable row level security;
alter table public.announcement_targets enable row level security;
revoke all on table public.announcement_meta, public.announcement_targets from anon, authenticated;

-- Admin roles that read their university's moderation and announcements (two-factor).
create function private.is_uni_role_of(p_university uuid, p_roles public.uni_admin_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.university_admins a
                  where a.user_id = (select auth.uid()) and a.university_id = p_university and a.role = any (p_roles));
$$;
revoke all on function private.is_uni_role_of(uuid, public.uni_admin_role[]) from public;
grant execute on function private.is_uni_role_of(uuid, public.uni_admin_role[]) to authenticated;

-- Does this university announcement reach the caller? Departments and batches combine as
-- "any department listed" and "any batch listed"; no targets = everyone at the university.
create function private.announcement_reaches(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.announcement_meta m
      join public.profiles v on v.user_id = (select auth.uid()) and v.university_id = m.university_id
     where m.post_id = p_post
       and (
         private.is_uni_role_of(m.university_id, array['owner', 'admin', 'comms', 'coordinator', 'career']::public.uni_admin_role[])
         or (
           m.expires_at > now()
           and v.role in ('student', 'faculty')
           and (not exists (select 1 from public.announcement_targets t where t.post_id = p_post and t.department_id is not null)
                or exists (select 1 from public.announcement_targets t
                            where t.post_id = p_post and t.department_id is not null
                              and (t.department_id = v.department_id
                                   or (v.role = 'faculty' and exists (
                                         select 1 from public.teacher_profiles tp join public.departments d on d.id = t.department_id
                                          where tp.user_id = v.user_id and lower(tp.department) = lower(d.name))))))
           and (not exists (select 1 from public.announcement_targets t where t.post_id = p_post and t.batch_year is not null)
                or v.role = 'faculty'
                or exists (select 1 from public.announcement_targets t
                            where t.post_id = p_post and t.batch_year is not null and t.batch_year = v.graduation_year)))));
$$;
revoke all on function private.announcement_reaches(uuid) from public;
grant execute on function private.announcement_reaches(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Moderation hide columns (before the visibility rules use them)
-- ---------------------------------------------------------------------------
alter table public.posts add column hidden_by_university_at timestamptz;
alter table public.post_comments add column hidden_by_university_at timestamptz;

create type public.uni_hide_status as enum ('hidden', 'restored', 'removed');
create table public.university_hides (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  target_type public.report_target not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  author_id uuid references auth.users (id) on delete set null,
  hidden_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  case_id uuid references public.report_cases (id) on delete set null,
  status public.uni_hide_status not null default 'hidden',
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 2000),
  created_at timestamptz not null default now()
);
comment on table public.university_hides is 'Every university hide and its reversal (PRD 5.23); staff and that university read it through functions.';
create index university_hides_uni_idx on public.university_hides (university_id, created_at desc);
create index university_hides_target_idx on public.university_hides (target_type, target_id);
create index university_hides_case_idx on public.university_hides (case_id);
create index university_hides_author_idx on public.university_hides (author_id);
create index university_hides_hidden_by_idx on public.university_hides (hidden_by);
create index university_hides_decided_by_idx on public.university_hides (decided_by);
create unique index university_hides_open_idx on public.university_hides (target_type, target_id) where status = 'hidden';
alter table public.university_hides enable row level security;
revoke all on table public.university_hides from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who sees a post: hidden posts only by their author and that university's owner and admins;
-- university announcements only by the people they target, until they expire.
-- ---------------------------------------------------------------------------
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
           and p.hidden_by_university_at is not null
           and private.is_uni_role_of(p.university_id, array['owner', 'admin']::public.uni_admin_role[])
         )
         or (
           (select auth.uid()) is not null
           and p.stage <> 'held'
           and p.hidden_by_university_at is null
           and not private.is_blocked_with(p.author_id)
           and (p.audience = 'global' or p.university_id = (select private.current_university_id()))
           and (p.type <> 'announcement' or p.audience = 'global' or private.announcement_reaches(p.id))
         )
       )
  );
$$;

drop policy posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated
  using (
    author_id = (select auth.uid())
    or (
      stage <> 'held'
      and hidden_by_university_at is null
      and not private.is_blocked_with(author_id)
      and (audience = 'global' or university_id = (select private.current_university_id()))
      and (type <> 'announcement' or audience = 'global' or private.announcement_reaches(id))
    )
  );

drop policy post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments for select to authenticated
  using (private.can_view_post(post_id)
         and (author_id = (select auth.uid()) or (not private.is_blocked_with(author_id) and hidden_by_university_at is null)));

-- A hidden comment reads like a deleted one to everyone but its author.
create or replace function private.post_comment_list(p_post uuid)
returns table (id uuid, parent_id uuid, body text, pinned boolean, deleted boolean, created_at timestamptz,
               author_username text, author_name text, author_avatar_path text, is_mine boolean, can_delete boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id,
         case when c.hidden_by_university_at is not null and c.author_id <> (select auth.uid()) then '' else c.body end,
         c.pinned,
         c.deleted_at is not null or (c.hidden_by_university_at is not null and c.author_id <> (select auth.uid())),
         c.created_at,
         case when c.deleted_at is null and c.hidden_by_university_at is null and private.can_view_profile(c.author_id) then a.username end,
         case when c.deleted_at is null and c.hidden_by_university_at is null then a.full_name end,
         case when c.deleted_at is null and c.hidden_by_university_at is null and private.can_view_profile(c.author_id) then a.avatar_path end,
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

-- The platform pin is global news only; each university has its own pin (below).
create or replace function private.pinned_announcement()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.posts p
   where p.pinned_until > now() and p.audience = 'global' and private.can_view_post(p.id)
     and not exists (select 1 from public.post_hides h where h.user_id = (select auth.uid()) and h.post_id = p.id)
   order by p.created_at desc limit 1;
$$;

create function private.pinned_university_announcement()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.posts p
   where p.pinned_until > now() and p.audience = 'university' and p.type = 'announcement'
     and p.university_id = (select private.current_university_id())
     and private.can_view_post(p.id)
     and not exists (select 1 from public.post_hides h where h.user_id = (select auth.uid()) and h.post_id = p.id)
   order by p.created_at desc limit 1;
$$;

-- Staff pinning platform news (create_post) clears every other pin; a university's own pin
-- is kept unless the university's function unpins it (it sets skilient.unpin_university).
create function private.keep_university_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.audience = 'university' and old.type = 'announcement' and old.pinned_until is not null and new.pinned_until is null
     and coalesce(current_setting('skilient.unpin_university', true), '') <> 'on' then
    new.pinned_until := old.pinned_until;
  end if;
  return new;
end;
$$;
revoke all on function private.keep_university_pin() from public;
create trigger posts_keep_university_pin before update of pinned_until on public.posts
  for each row execute function private.keep_university_pin();

insert into public.notification_types (type, category, emailed) values
  ('uni_announcement', 'university', true),
  ('uni_event_reminder', 'university', false),
  ('uni_event_cancelled', 'university', false),
  ('content_hidden_by_university', 'account', true),
  ('content_restored', 'account', false);

-- p: {body, category?, expires_days (1-90, default 30), pin_days (0-7), departments: [uuid], batches: [int]}
create function private.uni_post_announcement(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms', 'coordinator']::public.uni_admin_role[]);
  v_body text := btrim(coalesce(p ->> 'body', ''));
  v_cat text := nullif(btrim(coalesce(p ->> 'category', '')), '');
  v_days integer;
  v_pin integer;
  v_depts uuid[];
  v_batches smallint[];
  v_id uuid;
  v_today timestamptz := (date_trunc('day', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
begin
  begin
    v_days := coalesce((p ->> 'expires_days')::integer, 30);
    v_pin := coalesce((p ->> 'pin_days')::integer, 0);
    select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}') into v_depts
      from jsonb_array_elements(coalesce(p -> 'departments', '[]'::jsonb)) x;
    select coalesce(array_agg(distinct (x #>> '{}')::smallint), '{}') into v_batches
      from jsonb_array_elements(coalesce(p -> 'batches', '[]'::jsonb)) x;
  exception when others then
    raise exception 'check the expiry, pin and targets' using errcode = '22023';
  end;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'announcements are 1 to 2,000 characters' using errcode = '23514';
  end if;
  if v_days not between 1 and 90 or v_pin not between 0 and 7 then
    raise exception 'announcements expire within 90 days and pin for up to 7' using errcode = '22023';
  end if;
  if cardinality(v_depts) > 30 or cardinality(v_batches) > 10
     or exists (select 1 from unnest(v_batches) b where b not between 1980 and 2100) then
    raise exception 'check the targets' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_depts) d where not exists (select 1 from public.departments x where x.id = d and x.university_id = a.university_id)) then
    raise exception 'pick departments from your university''s list' using errcode = '22023';
  end if;
  -- Coordinators speak to their own department only.
  if a.role = 'coordinator' and v_depts is distinct from array[a.department_id] then
    raise exception 'coordinators announce to their own department only' using errcode = '42501';
  end if;
  if v_cat is not null and not exists (select 1 from public.ecosphere_config c
                                        where c.university_id = a.university_id and v_cat = any (c.announcement_categories)) then
    raise exception 'pick a category from your list (Settings, Ecosphere)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uni-announce:' || a.university_id::text, 0));
  if (select count(*) from public.announcement_meta m where m.university_id = a.university_id and m.created_at >= v_today) >= 3 then
    raise exception 'your university has posted 3 announcements today; try again tomorrow' using errcode = '54000';
  end if;

  insert into public.posts (author_id, university_id, audience, type, body, stage, pinned_until)
  values (a.user_id, a.university_id, 'university', 'announcement', v_body, 'full',
          case when v_pin > 0 then now() + make_interval(days => v_pin) end)
  returning id into v_id;
  insert into public.announcement_meta (post_id, university_id, category, expires_at, created_by)
  values (v_id, a.university_id, v_cat, now() + make_interval(days => v_days), a.user_id);
  insert into public.announcement_targets (post_id, department_id) select v_id, d from unnest(v_depts) d;
  insert into public.announcement_targets (post_id, batch_year) select v_id, b from unnest(v_batches) b;

  if v_pin > 0 then
    perform set_config('skilient.unpin_university', 'on', true);
    update public.posts set pinned_until = null
     where university_id = a.university_id and audience = 'university' and type = 'announcement'
       and pinned_until is not null and id <> v_id;
    perform set_config('skilient.unpin_university', '', true);
  end if;

  -- One in-app notice per reached member; the category is digest-only, so no instant email.
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, data)
  select v.user_id, null, 'uni_announcement', 'post', v_id,
         jsonb_build_object('university', u.name, 'category', v_cat, 'excerpt', left(v_body, 140))
    from public.profiles v
    join public.universities u on u.id = v.university_id
   where v.university_id = a.university_id and v.role in ('student', 'faculty') and v.status <> 'deleting'
     and v.user_id <> a.user_id
     and (cardinality(v_depts) = 0 or v.department_id = any (v_depts)
          or (v.role = 'faculty' and exists (select 1 from public.teacher_profiles tp join public.departments d on d.id = any (v_depts)
                                               where tp.user_id = v.user_id and lower(tp.department) = lower(d.name))))
     and (cardinality(v_batches) = 0 or v.role = 'faculty' or v.graduation_year = any (v_batches));

  perform private.uni_audit(a.university_id, 'announcement.post', 'post', v_id::text,
                            jsonb_build_object('departments', v_depts, 'batches', v_batches, 'pin_days', v_pin));
  return v_id;
end;
$$;

-- End an announcement early (it stays for its author's records) or take its pin away.
create function private.uni_end_announcement(p_post uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms', 'coordinator']::public.uni_admin_role[]);
begin
  update public.announcement_meta set expires_at = now()
   where post_id = p_post and university_id = a.university_id and expires_at > now()
     and (a.role <> 'coordinator' or created_by = a.user_id);
  if not found then
    raise exception 'announcement not found' using errcode = 'P0002';
  end if;
  perform set_config('skilient.unpin_university', 'on', true);
  update public.posts set pinned_until = null where id = p_post;
  perform set_config('skilient.unpin_university', '', true);
  perform private.uni_audit(a.university_id, 'announcement.end', 'post', p_post::text);
end;
$$;

create function private.uni_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms', 'coordinator']::public.uni_admin_role[]);
  v_today timestamptz := (date_trunc('day', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
begin
  return jsonb_build_object(
    'posted_today', (select count(*) from public.announcement_meta m where m.university_id = a.university_id and m.created_at >= v_today),
    'daily_limit', 3,
    'categories', coalesce((select to_jsonb(c.announcement_categories) from public.ecosphere_config c where c.university_id = a.university_id), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
                               from public.departments d where d.university_id = a.university_id
                                 and (a.role <> 'coordinator' or d.id = a.department_id)), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'body', p.body, 'category', m.category, 'created_at', p.created_at, 'expires_at', m.expires_at,
               'pinned_until', case when p.pinned_until > now() then p.pinned_until end, 'author', pr.full_name,
               'hidden', p.removed_at is not null,
               'departments', (select jsonb_agg(d.name order by d.name) from public.announcement_targets t
                                 join public.departments d on d.id = t.department_id where t.post_id = p.id),
               'batches', (select jsonb_agg(t.batch_year order by t.batch_year) from public.announcement_targets t
                            where t.post_id = p.id and t.batch_year is not null))
             order by p.created_at desc)
        from (select * from public.announcement_meta where university_id = a.university_id order by created_at desc limit 100) m
        join public.posts p on p.id = m.post_id
        left join public.profiles pr on pr.user_id = p.author_id
       where a.role <> 'coordinator' or m.created_by = a.user_id
          or exists (select 1 from public.announcement_targets t where t.post_id = m.post_id and t.department_id = a.department_id)), '[]'::jsonb));
end;
$$;

-- Latest announcements reaching the caller at their own university (ecosphere and blocks).
create function private.my_uni_announcements(p_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'category', x.category, 'created_at', x.created_at)
                            order by x.created_at desc), '[]'::jsonb)
    from (select p.id, p.body, m.category, p.created_at
            from public.announcement_meta m join public.posts p on p.id = m.post_id
           where m.university_id = (select private.current_university_id()) and m.expires_at > now()
             and p.removed_at is null and private.can_view_post(p.id)
           order by p.created_at desc limit least(greatest(coalesce(p_limit, 5), 1), 10)) x;
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create type public.uni_event_type as enum ('talk', 'workshop', 'hackathon', 'competition', 'other');
create type public.uni_event_scope as enum ('university', 'global');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  type public.uni_event_type not null,
  scope public.uni_event_scope not null default 'university',
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text check (location is null or char_length(btrim(location)) between 2 and 120),
  link text check (link is null or (link ~ '^https://[^[:space:]]+$' and char_length(link) <= 500)),
  capacity integer check (capacity is null or capacity between 1 and 20000),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '14 days'),
  check (location is not null or link is not null)
);
comment on table public.events is 'University events (PRD 5.23): RSVP, capacity, rotating QR check-in. Read and written through functions.';
create index events_uni_idx on public.events (university_id, starts_at);
create index events_global_idx on public.events (starts_at) where scope = 'global' and cancelled_at is null;
create index events_created_by_idx on public.events (created_by);

create table private.event_secrets (
  event_id uuid primary key references public.events (id) on delete cascade,
  secret bytea not null default extensions.gen_random_bytes(32)
);

create table public.event_registrations (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  reminded_at timestamptz,
  primary key (event_id, user_id)
);
comment on table public.event_registrations is 'Going = not cancelled. Attendance (checked_in_at) feeds records and dashboards.';
create index event_registrations_user_idx on public.event_registrations (user_id);

alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
revoke all on table public.events, public.event_registrations from anon, authenticated;
-- Students read only their own registrations directly; everything else goes through functions.
grant select on table public.event_registrations to authenticated;
create policy event_registrations_read_own on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid()));

create trigger events_set_updated_at before update on public.events
  for each row execute function private.set_updated_at();

create function private.event_going(p_event uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.event_registrations r where r.event_id = p_event and r.cancelled_at is null;
$$;
revoke all on function private.event_going(uuid) from public;

-- Who may come: global events anyone signed in (students and faculty); university events members.
create function private.can_attend_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
      join public.profiles v on v.user_id = (select auth.uid())
     where e.id = p_event and e.cancelled_at is null and v.role in ('student', 'faculty') and v.status <> 'deleting'
       and private.uni_module(e.university_id, 'events')
       and (e.scope = 'global' or v.university_id = e.university_id));
$$;
revoke all on function private.can_attend_event(uuid) from public;

create function private.can_see_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
      join public.profiles v on v.user_id = (select auth.uid())
     where e.id = p_event and private.uni_module(e.university_id, 'events')
       and (e.scope = 'global' or v.university_id = e.university_id));
$$;
revoke all on function private.can_see_event(uuid) from public;

-- p: {type, scope, title, description, starts_at, ends_at, location, link, capacity}
create function private.save_event(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms']::public.uni_admin_role[]);
  v_starts timestamptz;
  v_ends timestamptz;
  v_cap integer;
  v_id uuid;
begin
  if not private.uni_module(a.university_id, 'events') then
    raise exception 'turn on the Events module first (Settings, Ecosphere)' using errcode = '55000';
  end if;
  begin
    v_starts := (p ->> 'starts_at')::timestamptz;
    v_ends := (p ->> 'ends_at')::timestamptz;
    v_cap := nullif(p ->> 'capacity', '')::integer;
  exception when others then
    raise exception 'check the dates and capacity' using errcode = '22023';
  end;
  if v_starts is null or v_ends is null or v_ends <= v_starts or v_ends > v_starts + interval '14 days' then
    raise exception 'an event ends after it starts and lasts up to 14 days' using errcode = '22023';
  end if;
  if p_id is null and (v_starts < now() - interval '1 hour' or v_starts > now() + interval '1 year') then
    raise exception 'events start within the next year' using errcode = '22023';
  end if;
  if coalesce(p ->> 'type', '') not in ('talk', 'workshop', 'hackathon', 'competition', 'other')
     or coalesce(p ->> 'scope', 'university') not in ('university', 'global') then
    raise exception 'pick the event type and who can come' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 3 and 120 then
    raise exception 'event titles are 3 to 120 characters' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p ->> 'location', '')), '') is null and nullif(btrim(coalesce(p ->> 'link', '')), '') is null then
    raise exception 'give a place or an https:// link' using errcode = '22023';
  end if;
  if v_cap is not null and v_cap not between 1 and 20000 then
    raise exception 'capacity is 1 to 20,000 (or leave it empty)' using errcode = '22023';
  end if;
  if p_id is null then
    if not private.rate_limit('uni_event:' || a.university_id::text, 30, interval '1 day') then
      raise exception 'rate limited' using errcode = '54000';
    end if;
    insert into public.events (university_id, created_by, type, scope, title, description, starts_at, ends_at, location, link, capacity)
    values (a.university_id, a.user_id, (p ->> 'type')::public.uni_event_type, coalesce(p ->> 'scope', 'university')::public.uni_event_scope,
            btrim(p ->> 'title'), nullif(btrim(coalesce(p ->> 'description', '')), ''), v_starts, v_ends,
            nullif(btrim(coalesce(p ->> 'location', '')), ''), nullif(btrim(coalesce(p ->> 'link', '')), ''), v_cap)
    returning id into v_id;
    insert into private.event_secrets (event_id) values (v_id);
  else
    if v_cap is not null and v_cap < private.event_going(p_id) then
      raise exception 'more people are already going than that capacity' using errcode = '23514';
    end if;
    update public.events
       set type = (p ->> 'type')::public.uni_event_type, scope = coalesce(p ->> 'scope', 'university')::public.uni_event_scope,
           title = btrim(p ->> 'title'), description = nullif(btrim(coalesce(p ->> 'description', '')), ''),
           starts_at = v_starts, ends_at = v_ends, location = nullif(btrim(coalesce(p ->> 'location', '')), ''),
           link = nullif(btrim(coalesce(p ->> 'link', '')), ''), capacity = v_cap
     where id = p_id and university_id = a.university_id and cancelled_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'event not found' using errcode = 'P0002';
    end if;
  end if;
  perform private.uni_audit(a.university_id, 'event.save', 'event', v_id::text, jsonb_build_object('title', btrim(p ->> 'title')));
  return v_id;
end;
$$;

create function private.cancel_event(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms']::public.uni_admin_role[]);
  e public.events;
begin
  update public.events set cancelled_at = now()
   where id = p_id and university_id = a.university_id and cancelled_at is null returning * into e;
  if e.id is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, data)
  select r.user_id, null, 'uni_event_cancelled', 'event', e.id, jsonb_build_object('title', e.title, 'starts_at', e.starts_at)
    from public.event_registrations r where r.event_id = e.id and r.cancelled_at is null;
  perform private.uni_audit(a.university_id, 'event.cancel', 'event', p_id::text);
end;
$$;

-- Organisers see counts only (going, checked in), never a list of names.
create function private.uni_events()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms', 'career', 'coordinator']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'module_on', private.uni_module(a.university_id, 'events'),
    'can_edit', a.role in ('owner', 'admin', 'comms'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'type', e.type, 'scope', e.scope, 'title', e.title, 'description', e.description,
               'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', e.location, 'link', e.link, 'capacity', e.capacity,
               'cancelled', e.cancelled_at is not null, 'going', private.event_going(e.id),
               'checked_in', (select count(*) from public.event_registrations r where r.event_id = e.id and r.checked_in_at is not null))
             order by e.starts_at desc)
        from (select * from public.events where university_id = a.university_id order by starts_at desc limit 200) e), '[]'::jsonb));
end;
$$;

create function private.event_card(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', e.id, 'type', e.type, 'scope', e.scope, 'title', e.title, 'description', e.description,
           'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', e.location, 'link', e.link,
           'capacity', e.capacity, 'going', private.event_going(e.id), 'cancelled', e.cancelled_at is not null,
           'university', u.name, 'university_slug', u.slug,
           'my_status', case when r.user_id is null or r.cancelled_at is not null then null
                             when r.checked_in_at is not null then 'checked_in' else 'going' end,
           'can_attend', private.can_attend_event(e.id),
           'can_organise', private.is_uni_role_of(e.university_id, array['owner', 'admin', 'comms']::public.uni_admin_role[]))
    from public.events e
    join public.universities u on u.id = e.university_id
    left join public.event_registrations r on r.event_id = e.id and r.user_id = (select auth.uid())
   where e.id = p_event;
$$;
revoke all on function private.event_card(uuid) from public;

-- p_when: upcoming | past | mine
create function private.events_list(p_when text default 'upcoming')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_uni uuid := private.current_university_id();
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_when not in ('upcoming', 'past', 'mine') then
    raise exception 'unknown list' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(private.event_card(x.id) order by case when p_when = 'past' then -extract(epoch from x.starts_at) else extract(epoch from x.starts_at) end)
      from (select e.id, e.starts_at from public.events e
             where (e.scope = 'global' or e.university_id = v_uni)
               and private.uni_module(e.university_id, 'events')
               and case p_when
                     when 'upcoming' then e.ends_at >= now() and e.cancelled_at is null
                     when 'past' then e.ends_at < now()
                     else exists (select 1 from public.event_registrations r where r.event_id = e.id and r.user_id = v_me and r.cancelled_at is null)
                   end
             order by case when p_when = 'past' then e.starts_at end desc, e.starts_at
             limit 100) x), '[]'::jsonb);
end;
$$;

create function private.event_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not (private.can_see_event(p_id)
          or exists (select 1 from public.events e where e.id = p_id
                       and private.is_uni_role_of(e.university_id, array['owner', 'admin', 'comms', 'career', 'coordinator']::public.uni_admin_role[]))) then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  return private.event_card(p_id);
end;
$$;

create function private.rsvp_event(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  e public.events;
begin
  -- The row lock serialises seats: two last-seat requests can't both pass the count.
  select * into e from public.events where id = p_id for update;
  if not found or not private.can_attend_event(p_id) then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if e.ends_at < now() then
    raise exception 'this event is over' using errcode = '55000';
  end if;
  if exists (select 1 from public.event_registrations r where r.event_id = p_id and r.user_id = v_me and r.cancelled_at is null) then
    return;
  end if;
  if e.capacity is not null and private.event_going(p_id) >= e.capacity then
    raise exception 'this event is full' using errcode = '23514';
  end if;
  insert into public.event_registrations (event_id, user_id) values (p_id, v_me)
  on conflict (event_id, user_id) do update set cancelled_at = null, registered_at = now(), reminded_at = null;
end;
$$;

create function private.cancel_rsvp(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  update public.event_registrations set cancelled_at = now()
   where event_id = p_id and user_id = v_me and cancelled_at is null and checked_in_at is null;
  if not found then
    raise exception 'you aren''t going to this event' using errcode = 'P0002';
  end if;
end;
$$;

-- The check-in code for a 30-second window (the HMAC of the event and window number).
create function private.event_code(p_event uuid, p_window bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select substr(encode(extensions.hmac(convert_to(p_event::text || ':' || p_window::text, 'UTF8'), s.secret, 'sha256'), 'hex'), 1, 24)
    from private.event_secrets s where s.event_id = p_event;
$$;
revoke all on function private.event_code(uuid, bigint) from public;

-- The organiser's screen: today's code, and when it changes.
create function private.event_checkin_code(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_window bigint := floor(extract(epoch from now()) / 30)::bigint;
begin
  select * into e from public.events where id = p_id;
  if not found or not private.is_uni_role_of(e.university_id, array['owner', 'admin', 'comms']::public.uni_admin_role[]) then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if e.cancelled_at is not null or now() < e.starts_at - interval '2 hours' or now() > e.ends_at + interval '2 hours' then
    raise exception 'check-in opens 2 hours before the event and closes 2 hours after it' using errcode = '55000';
  end if;
  return jsonb_build_object('token', private.event_code(p_id, v_window), 'changes_at', to_timestamp((v_window + 1) * 30),
                            'going', private.event_going(p_id),
                            'checked_in', (select count(*) from public.event_registrations r where r.event_id = p_id and r.checked_in_at is not null));
end;
$$;

-- A student who scanned the code: the current or previous window counts. Walk-ins are registered
-- while seats remain.
create function private.check_in_event(p_id uuid, p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  e public.events;
  v_window bigint := floor(extract(epoch from now()) / 30)::bigint;
  r public.event_registrations;
begin
  if not private.rate_limit('event_checkin:' || v_me::text, 20, interval '10 minutes') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select * into e from public.events where id = p_id for update;
  if not found or not private.can_attend_event(p_id) then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if coalesce(p_token, '') not in (private.event_code(p_id, v_window), private.event_code(p_id, v_window - 1)) then
    raise exception 'that code has changed; scan the screen again' using errcode = '22023';
  end if;
  if now() < e.starts_at - interval '2 hours' or now() > e.ends_at + interval '2 hours' then
    raise exception 'check-in is closed' using errcode = '55000';
  end if;
  select * into r from public.event_registrations x where x.event_id = p_id and x.user_id = v_me;
  if r.checked_in_at is not null and r.cancelled_at is null then
    return 'already';
  end if;
  if r.user_id is null or r.cancelled_at is not null then
    if e.capacity is not null and private.event_going(p_id) >= e.capacity then
      raise exception 'this event is full' using errcode = '23514';
    end if;
  end if;
  insert into public.event_registrations (event_id, user_id, checked_in_at) values (p_id, v_me, now())
  on conflict (event_id, user_id) do update set cancelled_at = null, checked_in_at = now();
  return 'checked_in';
end;
$$;

-- Hourly: a reminder 24 hours before, once per registration.
create function private.uni_events_hourly()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_n integer := 0;
begin
  v_run := public.job_run_start('uni-events-hourly');
  begin
    with due as (
      update public.event_registrations r set reminded_at = now()
        from public.events e
       where e.id = r.event_id and r.cancelled_at is null and r.reminded_at is null and e.cancelled_at is null
         and e.starts_at between now() and now() + interval '24 hours'
      returning r.user_id, e.id, e.title, e.starts_at)
    insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, data)
    select d.user_id, null, 'uni_event_reminder', 'event', d.id, jsonb_build_object('title', d.title, 'starts_at', d.starts_at)
      from due d;
    get diagnostics v_n = row_count;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
end;
$$;
revoke all on function private.uni_events_hourly() from public;
select cron.schedule('uni-events-hourly', '17 * * * *', $$select private.uni_events_hourly()$$);

-- ---------------------------------------------------------------------------
-- Moderation hide (owner and admins) → Skilient's queue
-- ---------------------------------------------------------------------------
create function private.uni_hide(p_type text, p_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_post public.posts;
  v_comment public.post_comments;
  v_author uuid;
  v_snapshot jsonb;
  v_case uuid;
  v_id uuid;
  v_uni_name text := (select u.name from public.universities u where u.id = a.university_id);
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'give a reason (3 to 500 characters); the author will see it' using errcode = '22023';
  end if;
  if p_type = 'post' then
    select * into v_post from public.posts where id = p_id for update;
    if not found or v_post.removed_at is not null or v_post.audience <> 'university' or v_post.university_id <> a.university_id
       or v_post.type = 'announcement' then
      raise exception 'only posts in your University Feed can be hidden' using errcode = 'P0002';
    end if;
    if v_post.hidden_by_university_at is not null then
      raise exception 'already hidden' using errcode = '55000';
    end if;
    v_author := v_post.author_id;
    update public.posts set hidden_by_university_at = now() where id = p_id;
  elsif p_type = 'comment' then
    select c.* into v_comment from public.post_comments c join public.posts p on p.id = c.post_id
     where c.id = p_id and p.audience = 'university' and p.university_id = a.university_id and p.removed_at is null
     for update of c;
    if v_comment.id is null or v_comment.deleted_at is not null then
      raise exception 'only comments in your University Feed can be hidden' using errcode = 'P0002';
    end if;
    if v_comment.hidden_by_university_at is not null then
      raise exception 'already hidden' using errcode = '55000';
    end if;
    v_author := v_comment.author_id;
    update public.post_comments set hidden_by_university_at = now() where id = p_id;
  else
    raise exception 'unknown content' using errcode = '22023';
  end if;
  if not private.rate_limit('uni_hide:' || a.university_id::text, 100, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select s.snapshot into v_snapshot from private.report_snapshot(p_type::public.report_target, p_id) s;
  v_case := private.open_case(p_type::public.report_target, p_id, v_author,
                              coalesce(v_snapshot, '{}'::jsonb) || jsonb_build_object('hidden_by_university', v_uni_name, 'university_reason', v_reason),
                              false, true);
  insert into public.university_hides (university_id, target_type, target_id, author_id, hidden_by, reason, case_id)
  values (a.university_id, p_type::public.report_target, p_id, v_author, a.user_id, v_reason, v_case)
  returning id into v_id;
  perform private.uni_audit(a.university_id, 'moderation.hide', p_type, p_id::text, jsonb_build_object('reason', v_reason));
  perform private.notify(v_author, null, 'content_hidden_by_university', p_type, p_id,
                         jsonb_build_object('university', v_uni_name, 'reason', v_reason, 'kind', p_type,
                                            'post_id', coalesce(v_post.id, v_comment.post_id)));
  return v_id;
end;
$$;

-- When Skilient decides the case: dismissed or warned → restored; removed → stays gone.
create function private.university_hide_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.university_hides;
begin
  if old.status <> 'open' or new.status = 'open' then
    return null;
  end if;
  for h in select * from public.university_hides
            where target_type = new.target_type and target_id = new.target_id and status = 'hidden' loop
    if new.status in ('dismissed', 'warned') then
      if h.target_type = 'post' then
        update public.posts set hidden_by_university_at = null where id = h.target_id;
      else
        update public.post_comments set hidden_by_university_at = null where id = h.target_id;
      end if;
      update public.university_hides
         set status = 'restored', decided_by = new.resolved_by, decided_at = now(), decision_reason = new.resolution_reason
       where id = h.id;
      perform private.notify(h.author_id, null, 'content_restored', h.target_type::text, h.target_id,
                             jsonb_build_object('kind', h.target_type));
    else
      update public.university_hides
         set status = 'removed', decided_by = new.resolved_by, decided_at = now(), decision_reason = new.resolution_reason
       where id = h.id;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.university_hide_decided() from public;
create trigger report_cases_university_hide after update of status on public.report_cases
  for each row execute function private.university_hide_decided();

-- /uni/moderation: their hides and every case on their University Feed content (never reporters).
create function private.uni_moderation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'hides', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'target_type', h.target_type, 'target_id', h.target_id, 'reason', h.reason,
                                          'status', h.status, 'hidden_by', p.full_name, 'created_at', h.created_at,
                                          'decided_at', h.decided_at,
                                          'excerpt', left(coalesce(c.snapshot ->> 'body', ''), 200)) order by h.created_at desc)
        from (select * from public.university_hides where university_id = a.university_id order by created_at desc limit 100) h
        left join public.profiles p on p.user_id = h.hidden_by
        left join public.report_cases c on c.id = h.case_id), '[]'::jsonb),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'target_type', c.target_type, 'status', c.status, 'reports', c.reports, 'opened_at', c.opened_at,
               'resolved_at', c.resolved_at, 'excerpt', left(coalesce(c.snapshot ->> 'body', ''), 200),
               'category', (select r.reason from public.reports r where r.case_id = c.id
                             group by r.reason order by count(*) desc, r.reason limit 1))
             order by c.last_reported_at desc)
        from (select rc.* from public.report_cases rc
               where (rc.target_type = 'post' and exists (select 1 from public.posts p where p.id = rc.target_id
                                                           and p.audience = 'university' and p.university_id = a.university_id))
                  or (rc.target_type = 'comment' and exists (select 1 from public.post_comments pc join public.posts p on p.id = pc.post_id
                                                              where pc.id = rc.target_id and p.audience = 'university'
                                                                and p.university_id = a.university_id))
               order by rc.last_reported_at desc limit 100) c), '[]'::jsonb));
end;
$$;

-- Staff (moderators): every university hide and its outcome, newest first; and the hide behind a case.
create function private.ops_university_hides(p_case uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('moderator') then
    raise exception 'moderators only, with two-factor on' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'university', u.name, 'target_type', h.target_type, 'target_id', h.target_id,
                                        'reason', h.reason, 'status', h.status, 'hidden_by', p.full_name, 'case_id', h.case_id,
                                        'created_at', h.created_at, 'decided_at', h.decided_at, 'decision_reason', h.decision_reason)
                     order by h.created_at desc)
      from (select * from public.university_hides
             where p_case is null or case_id = p_case order by created_at desc limit 200) h
      join public.universities u on u.id = h.university_id
      left join public.profiles p on p.user_id = h.hidden_by), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and public wrappers (security invoker), generated from one list
-- ---------------------------------------------------------------------------
create function pg_temp.expose(p_names text[])
returns void
language plpgsql
as $$
declare
  n text;
  r record;
  v_names text;
begin
  foreach n in array p_names loop
    select p.oid, p.proname, p.provolatile, p.proargnames,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as ident,
           pg_get_function_result(p.oid) as result
      into r
      from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname = n;
    if r.oid is null then
      raise exception 'no private function %', n;
    end if;
    select coalesce(string_agg(a, ', ' order by ord), '') into v_names
      from unnest(coalesce(r.proargnames, '{}'::text[])) with ordinality as t(a, ord);
    execute format('revoke all on function private.%I(%s) from public', n, r.ident);
    execute format('grant execute on function private.%I(%s) to authenticated', n, r.ident);
    execute format('create function public.%I(%s) returns %s language sql %s security invoker set search_path = %L as $f$ select private.%I(%s) $f$',
                   n, r.args, r.result, case r.provolatile when 'v' then 'volatile' else 'stable' end, '', n, v_names);
    execute format('revoke all on function public.%I(%s) from public, anon', n, r.ident);
    execute format('grant execute on function public.%I(%s) to authenticated', n, r.ident);
  end loop;
end;
$$;

select pg_temp.expose(array[
  'pinned_university_announcement', 'uni_post_announcement', 'uni_end_announcement', 'uni_announcements', 'my_uni_announcements',
  'save_event', 'cancel_event', 'uni_events', 'events_list', 'event_detail', 'rsvp_event', 'cancel_rsvp',
  'event_checkin_code', 'check_in_event',
  'uni_hide', 'uni_moderation', 'ops_university_hides'
]);

drop function pg_temp.expose(text[]);
