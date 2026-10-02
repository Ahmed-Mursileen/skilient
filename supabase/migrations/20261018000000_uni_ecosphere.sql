-- Phase 9, part 2: the customised ecosphere (PRD 5.23 "Customised ecosphere"; decisions.md 2026-10-04).
--
-- Modules on/off, branding (colours contrast-checked here as well as in the app), custom pages
-- built from a fixed set of blocks (no raw HTML), batch labels and announcement categories,
-- the academic calendar (semesters and exam periods), up to three multiple-choice onboarding
-- questions, and university awards. Global invariants (identity, skill levels, ranking, CV format,
-- privacy, moderation) are not configurable: nothing here feeds the ranking functions, and
-- **awards never affect ranking** (no score_* function reads badge_awards).

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.ecosphere_config (
  university_id uuid primary key references public.universities (id) on delete cascade,
  modules jsonb not null default '{"feed": true, "events": true, "ideas": true, "teachers": true, "leaderboard": true, "job_board": true}'::jsonb
    check (jsonb_typeof(modules) = 'object'),
  -- {primary: {light, dark}, accent: {light, dark}, logo_path, cover_path}
  branding jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  welcome text check (welcome is null or char_length(welcome) <= 1000),
  batch_labels jsonb not null default '{}'::jsonb check (jsonb_typeof(batch_labels) = 'object'),
  announcement_categories text[] not null default '{}' check (cardinality(announcement_categories) <= 20),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.ecosphere_config is 'Per-university ecosphere settings (PRD 5.23). Every university may customise; no entitlement needed.';
create index ecosphere_config_updated_by_idx on public.ecosphere_config (updated_by);
alter table public.ecosphere_config enable row level security;
revoke all on table public.ecosphere_config from anon, authenticated;

create function private.uni_module(p_university uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (c.modules ->> p_key)::boolean from public.ecosphere_config c where c.university_id = p_university), true);
$$;
revoke all on function private.uni_module(uuid, text) from public;
grant execute on function private.uni_module(uuid, text) to authenticated, service_role;

create function private.ensure_ecosphere(p_university uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.ecosphere_config (university_id) values (p_university) on conflict do nothing;
$$;
revoke all on function private.ensure_ecosphere(uuid) from public;

-- ---------------------------------------------------------------------------
-- WCAG contrast (the same formula as lib/ecosphere/contrast.ts)
-- ---------------------------------------------------------------------------
create function private.hex_luminance(p_hex text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(ltrim(coalesce(p_hex, ''), '#'));
  c numeric[];
  i integer;
  x numeric;
begin
  if v !~ '^[0-9a-f]{6}$' then
    return null;
  end if;
  c := array[('x' || lpad(substr(v, 1, 2), 8, '0'))::bit(32)::integer / 255.0,
             ('x' || lpad(substr(v, 3, 2), 8, '0'))::bit(32)::integer / 255.0,
             ('x' || lpad(substr(v, 5, 2), 8, '0'))::bit(32)::integer / 255.0];
  for i in 1 .. 3 loop
    x := c[i];
    c[i] := case when x <= 0.03928 then x / 12.92 else power((x + 0.055) / 1.055, 2.4) end;
  end loop;
  return 0.2126 * c[1] + 0.7152 * c[2] + 0.0722 * c[3];
end;
$$;
revoke all on function private.hex_luminance(text) from public;

create function private.contrast_ratio(p_a text, p_b text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (greatest(private.hex_luminance(p_a), private.hex_luminance(p_b)) + 0.05)
       / (least(private.hex_luminance(p_a), private.hex_luminance(p_b)) + 0.05);
$$;
revoke all on function private.contrast_ratio(text, text) from public;
grant execute on function private.hex_luminance(text), private.contrast_ratio(text, text) to authenticated, service_role;

-- No single colour reaches 4.5:1 on both page backgrounds (#f0efed light, #0a0a09 dark), so each
-- brand colour has a light-theme and a dark-theme value, each checked against its own page.
create function private.brand_colour_error(p_colours jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  foreach k in array array['primary', 'accent'] loop
    if p_colours -> k is null then
      continue;
    end if;
    if coalesce(p_colours -> k ->> 'light', '') !~ '^#[0-9a-fA-F]{6}$' or coalesce(p_colours -> k ->> 'dark', '') !~ '^#[0-9a-fA-F]{6}$' then
      return 'colours are #RRGGBB, one for light and one for dark';
    end if;
    if private.contrast_ratio(p_colours -> k ->> 'light', '#f0efed') < 4.5 then
      return format('the %s colour for light mode is only %s:1 against the page; it needs 4.5:1', k,
                    round(private.contrast_ratio(p_colours -> k ->> 'light', '#f0efed'), 2));
    end if;
    if private.contrast_ratio(p_colours -> k ->> 'dark', '#0a0a09') < 4.5 then
      return format('the %s colour for dark mode is only %s:1 against the page; it needs 4.5:1', k,
                    round(private.contrast_ratio(p_colours -> k ->> 'dark', '#0a0a09'), 2));
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.brand_colour_error(jsonb) from public;

-- ---------------------------------------------------------------------------
-- Branding images: a public bucket, written by the server's WebP re-encode into the
-- university's folder (owner or admin on two-factor)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('university-media', 'university-media', true, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.uni_media_writer(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
     and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.university_admins a
                  where a.user_id = (select auth.uid()) and a.role in ('owner', 'admin')
                    and a.university_id::text = (storage.foldername(p_name))[1]);
$$;
revoke all on function private.uni_media_writer(text) from public;
grant execute on function private.uni_media_writer(text) to authenticated;

create policy university_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'university-media' and private.uni_media_writer(name));
create policy university_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'university-media' and private.uni_media_writer(name));

-- ---------------------------------------------------------------------------
-- Slugs: once every 30 days, old ones reserved for 90 days
-- ---------------------------------------------------------------------------
create table public.university_slug_history (
  slug text primary key,
  university_id uuid not null references public.universities (id) on delete cascade,
  released_at timestamptz not null default now()
);
comment on table public.university_slug_history is 'Slugs a university gave up; nobody else may take one for 90 days (decisions.md 2026-10-04).';
create index university_slug_history_uni_idx on public.university_slug_history (university_id);
alter table public.university_slug_history enable row level security;
revoke all on table public.university_slug_history from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Custom pages (up to 10), from fixed blocks
-- ---------------------------------------------------------------------------
create table public.ecosphere_pages (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  published boolean not null default false,
  position smallint not null default 1 check (position between 1 and 10),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (university_id, slug)
);
comment on table public.ecosphere_pages is 'Custom ecosphere pages built from a fixed block set; rendered by components, never raw HTML.';
create index ecosphere_pages_updated_by_idx on public.ecosphere_pages (updated_by);
alter table public.ecosphere_pages enable row level security;
revoke all on table public.ecosphere_pages from anon, authenticated;

-- Null when the blocks are valid; else what to fix.
create function private.page_blocks_error(p_university uuid, p_blocks jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  b jsonb;
  t text;
  x jsonb;
begin
  if jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks) > 30 then
    return 'a page has up to 30 blocks';
  end if;
  for b in select * from jsonb_array_elements(p_blocks) loop
    t := b ->> 'type';
    if t = 'text' then
      if jsonb_typeof(b -> 'text') is distinct from 'string' or char_length(b ->> 'text') not between 1 and 5000 then
        return 'text blocks are 1 to 5,000 characters';
      end if;
    elsif t = 'image' then
      if coalesce(b ->> 'path', '') !~ ('^' || p_university::text || '/[0-9a-f-]{36}\.webp$')
         or char_length(coalesce(b ->> 'caption', '')) > 200 then
        return 'upload the image first (captions up to 200 characters)';
      end if;
    elsif t = 'links' then
      if jsonb_typeof(b -> 'items') is distinct from 'array' or jsonb_array_length(b -> 'items') not between 1 and 20 then
        return 'a link list has 1 to 20 links';
      end if;
      for x in select * from jsonb_array_elements(b -> 'items') loop
        if char_length(btrim(coalesce(x ->> 'label', ''))) not between 1 and 80
           or coalesce(x ->> 'url', '') !~ '^https://[^[:space:]]+$' or char_length(x ->> 'url') > 500 then
          return 'each link needs a label and an https:// address';
        end if;
      end loop;
    elsif t in ('announcements', 'events') then
      if coalesce((b ->> 'count')::integer, 0) not between 1 and 10 then
        return 'show 1 to 10 items';
      end if;
    elsif t in ('ventures', 'faculty') then
      if jsonb_typeof(b -> 'ids') is distinct from 'array' or jsonb_array_length(b -> 'ids') not between 1 and 12 then
        return 'pick 1 to 12 to feature';
      end if;
      for x in select * from jsonb_array_elements(b -> 'ids') loop
        if coalesce(x #>> '{}', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          return 'pick from the list';
        end if;
      end loop;
    else
      return 'unknown block type';
    end if;
  end loop;
  return null;
exception when invalid_text_representation then
  return 'show 1 to 10 items';
end;
$$;
revoke all on function private.page_blocks_error(uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Awards (badges granted by a university). Never read by any ranking function.
-- ---------------------------------------------------------------------------
create table public.university_badges (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (description is null or char_length(description) <= 300),
  icon text not null default 'trophy'
    check (icon in ('trophy', 'medal', 'star', 'certificate', 'lightbulb', 'rocket', 'code', 'users', 'flask', 'globe')),
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.university_badges is 'University-defined awards (PRD 5.23). They show on profiles and the CV; they never change ranking.';
create index university_badges_uni_idx on public.university_badges (university_id);
create index university_badges_created_by_idx on public.university_badges (created_by);
create unique index university_badges_name_idx on public.university_badges (university_id, lower(name)) where archived_at is null;

create table public.badge_awards (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references public.university_badges (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  awarded_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);
comment on table public.badge_awards is 'Awards granted to students. Shown on the profile and the next CV version; no effect on ranking.';
create index badge_awards_student_idx on public.badge_awards (student_id);
create index badge_awards_awarded_by_idx on public.badge_awards (awarded_by);
create index badge_awards_revoked_by_idx on public.badge_awards (revoked_by);
create unique index badge_awards_active_idx on public.badge_awards (badge_id, student_id) where revoked_at is null;

alter table public.university_badges enable row level security;
alter table public.badge_awards enable row level security;
revoke all on table public.university_badges, public.badge_awards from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Academic calendar: semesters (display) beside the existing exam periods
-- ---------------------------------------------------------------------------
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  starts_on date not null,
  ends_on date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on and ends_on - starts_on <= 366)
);
comment on table public.semesters is 'Semester dates for display on the ecosphere and calendar (PRD 5.23).';
create index semesters_uni_idx on public.semesters (university_id, starts_on);
create index semesters_created_by_idx on public.semesters (created_by);
alter table public.semesters enable row level security;
revoke all on table public.semesters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Onboarding questions: multiple choice only, up to 3, no sensitive topics
-- ---------------------------------------------------------------------------
create table public.university_questions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  prompt text not null check (char_length(btrim(prompt)) between 5 and 200),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  removed_reason text check (removed_reason is null or char_length(removed_reason) <= 500),
  removed_by_staff boolean not null default false
);
comment on table public.university_questions is 'Optional onboarding questions (≤ 3 active per university, 2–6 options). Answers are shown to the university as counts of 5+ only.';
create index university_questions_uni_idx on public.university_questions (university_id) where removed_at is null;
create index university_questions_created_by_idx on public.university_questions (created_by);
create index university_questions_removed_by_idx on public.university_questions (removed_by);

create table public.university_question_answers (
  question_id uuid not null references public.university_questions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 5),
  answered_at timestamptz not null default now(),
  primary key (question_id, user_id)
);
create index university_question_answers_user_idx on public.university_question_answers (user_id);
alter table public.university_questions enable row level security;
alter table public.university_question_answers enable row level security;
revoke all on table public.university_questions, public.university_question_answers from anon, authenticated;

-- Religion, ethnicity, health, politics and income are not allowed (decisions.md 2026-10-04, Ahmed).
-- A keyword check refuses the obvious cases; staff remove anything else that slips through.
create function private.sensitive_topic(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text, '') ~* ('\m(religio|faith|islam|muslim|christian|hindu|sikh|ahmadi|qadiani|shia|sunni|sect|caste|ethnic|race|racial|tribe|tribal|'
                                  || 'baloch|pashtun|pathan|punjabi|sindhi|muhajir|health|medical|disab|illness|disease|mental|pregnan|'
                                  || 'politic|party|parties|vote|voting|election|income|salary|salaries|wealth|earning|poverty|zakat|religion)');
$$;
revoke all on function private.sensitive_topic(text) from public;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
insert into public.notification_types (type, category, emailed) values
  ('uni_award', 'university', true),
  ('uni_question_removed', 'university', false);

-- ---------------------------------------------------------------------------
-- Admin side: settings, branding, slug, pages
-- ---------------------------------------------------------------------------
create function private.uni_ecosphere()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms']::public.uni_admin_role[]);
begin
  perform private.ensure_ecosphere(a.university_id);
  return (
    select jsonb_build_object(
             'modules', c.modules, 'branding', c.branding, 'welcome', c.welcome, 'batch_labels', c.batch_labels,
             'announcement_categories', to_jsonb(c.announcement_categories),
             'slug', u.slug, 'slug_changed_at', u.slug_changed_at,
             'pages', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'published', p.published,
                                                                    'position', p.position, 'blocks', p.blocks, 'updated_at', p.updated_at)
                                                 order by p.position, p.title)
                                  from public.ecosphere_pages p where p.university_id = a.university_id), '[]'::jsonb))
      from public.ecosphere_config c join public.universities u on u.id = c.university_id
     where c.university_id = a.university_id);
end;
$$;

-- p: {feed, events, ideas, teachers, leaderboard, job_board} booleans. Turning one off deletes nothing.
create function private.save_ecosphere_modules(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v jsonb := '{}'::jsonb;
  k text;
begin
  foreach k in array array['feed', 'events', 'ideas', 'teachers', 'leaderboard', 'job_board'] loop
    if jsonb_typeof(p -> k) is distinct from 'boolean' then
      raise exception 'send every module as on or off' using errcode = '22023';
    end if;
    v := v || jsonb_build_object(k, (p ->> k)::boolean);
  end loop;
  perform private.ensure_ecosphere(a.university_id);
  update public.ecosphere_config set modules = v, updated_by = a.user_id, updated_at = now() where university_id = a.university_id;
  perform private.uni_audit(a.university_id, 'ecosphere.modules', 'ecosphere', a.university_id::text, v);
end;
$$;

-- p: {primary: {light, dark} | null, accent: {light, dark} | null, welcome}
create function private.save_branding(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_colours jsonb := jsonb_strip_nulls(jsonb_build_object('primary', p -> 'primary', 'accent', p -> 'accent'));
  v_error text := private.brand_colour_error(v_colours);
  v_welcome text := nullif(btrim(coalesce(p ->> 'welcome', '')), '');
begin
  if v_error is not null then
    raise exception '%', v_error using errcode = '23514';
  end if;
  if v_welcome is not null and char_length(v_welcome) > 1000 then
    raise exception 'keep the welcome message under 1,000 characters' using errcode = '22023';
  end if;
  perform private.ensure_ecosphere(a.university_id);
  update public.ecosphere_config
     set branding = (branding - 'primary' - 'accent') || v_colours, welcome = v_welcome, updated_by = a.user_id, updated_at = now()
   where university_id = a.university_id;
  perform private.uni_audit(a.university_id, 'ecosphere.branding', 'ecosphere', a.university_id::text, v_colours);
end;
$$;

-- kind: logo | cover; path null clears it. The file must already be in the university's folder.
create function private.set_branding_image(p_kind text, p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_old text;
begin
  if p_kind not in ('logo', 'cover') then
    raise exception 'unknown image' using errcode = '22023';
  end if;
  if p_path is not null and (p_path !~ ('^' || a.university_id::text || '/[0-9a-f-]{36}\.webp$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'university-media' and o.name = p_path)) then
    raise exception 'upload the image first' using errcode = '22023';
  end if;
  perform private.ensure_ecosphere(a.university_id);
  select c.branding ->> (p_kind || '_path') into v_old from public.ecosphere_config c where c.university_id = a.university_id for update;
  update public.ecosphere_config
     set branding = case when p_path is null then branding - (p_kind || '_path')
                         else branding || jsonb_build_object(p_kind || '_path', p_path) end,
         updated_by = a.user_id, updated_at = now()
   where university_id = a.university_id;
  if v_old is not null and v_old is distinct from p_path then
    perform private.queue_storage_cleanup('university-media', v_old);
  end if;
end;
$$;

-- labels: {"2026": "Class of 2026", ...}; categories: up to 20 announcement categories.
create function private.save_ecosphere_structure(p_labels jsonb, p_categories text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  k text;
  v_cats text[];
begin
  if jsonb_typeof(coalesce(p_labels, '{}'::jsonb)) <> 'object' or (select count(*) from jsonb_object_keys(coalesce(p_labels, '{}'::jsonb))) > 20 then
    raise exception 'up to 20 batch labels' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(coalesce(p_labels, '{}'::jsonb)) loop
    if k !~ '^(19|20|21)[0-9]{2}$' or jsonb_typeof(p_labels -> k) <> 'string' or char_length(btrim(p_labels ->> k)) not between 1 and 30 then
      raise exception 'batch labels map a graduating year to a label of up to 30 characters' using errcode = '22023';
    end if;
  end loop;
  select coalesce(array_agg(distinct btrim(c)), '{}') into v_cats
    from unnest(coalesce(p_categories, '{}')) c where char_length(btrim(c)) between 2 and 40;
  if cardinality(v_cats) > 20 then
    raise exception 'up to 20 announcement categories' using errcode = '22023';
  end if;
  perform private.ensure_ecosphere(a.university_id);
  update public.ecosphere_config
     set batch_labels = coalesce(p_labels, '{}'::jsonb), announcement_categories = v_cats, updated_by = a.user_id, updated_at = now()
   where university_id = a.university_id;
  perform private.uni_audit(a.university_id, 'ecosphere.structure', 'ecosphere', a.university_id::text,
                            jsonb_build_object('labels', p_labels, 'categories', v_cats));
end;
$$;

create function private.uni_change_slug(p_slug text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  u public.universities;
begin
  select * into u from public.universities where id = a.university_id for update;
  if v_slug = u.slug then
    return;
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 60 then
    raise exception 'use 3 to 60 lowercase letters, numbers and single hyphens' using errcode = '22023';
  end if;
  if v_slug = any (private.reserved_usernames() || array['uni', 'u', 'ops', 'admin', 'skilient', 'university', 'universities', 'settings', 'new']) then
    raise exception 'that address is reserved' using errcode = '22023';
  end if;
  if u.slug_changed_at is not null and u.slug_changed_at > now() - interval '30 days' then
    raise exception 'the address can change once every 30 days' using errcode = '55000';
  end if;
  if exists (select 1 from public.universities x where x.slug = v_slug)
     or exists (select 1 from public.university_slug_history h
                 where h.slug = v_slug and h.university_id <> a.university_id and h.released_at > now() - interval '90 days') then
    raise exception 'that address is taken' using errcode = '23505';
  end if;
  delete from public.university_slug_history where slug = v_slug or (slug = u.slug);
  insert into public.university_slug_history (slug, university_id) values (u.slug, u.id);
  update public.universities set slug = v_slug, slug_changed_at = now() where id = u.id;
  perform private.uni_audit(a.university_id, 'ecosphere.slug', 'university', u.id::text, jsonb_build_object('from', u.slug, 'to', v_slug));
end;
$$;

-- p: {slug, title, blocks, published, position}
create function private.save_ecosphere_page(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms']::public.uni_admin_role[]);
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_blocks jsonb := coalesce(p -> 'blocks', '[]'::jsonb);
  v_error text;
  v_id uuid;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 40 then
    raise exception 'page addresses use lowercase letters, numbers and single hyphens (up to 40)' using errcode = '22023';
  end if;
  if char_length(v_title) not between 2 and 80 then
    raise exception 'page titles are 2 to 80 characters' using errcode = '22023';
  end if;
  v_error := private.page_blocks_error(a.university_id, v_blocks);
  if v_error is not null then
    raise exception '%', v_error using errcode = '22023';
  end if;
  if exists (select 1 from public.ecosphere_pages x where x.university_id = a.university_id and x.slug = v_slug and x.id is distinct from p_id) then
    raise exception 'another page uses that address' using errcode = '23505';
  end if;
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('uni-pages:' || a.university_id::text, 0));
    if (select count(*) from public.ecosphere_pages x where x.university_id = a.university_id) >= 10 then
      raise exception 'up to 10 pages' using errcode = '23514';
    end if;
    insert into public.ecosphere_pages (university_id, slug, title, blocks, published, position, updated_by)
    values (a.university_id, v_slug, v_title, v_blocks, coalesce((p ->> 'published')::boolean, false),
            least(greatest(coalesce((p ->> 'position')::integer, 1), 1), 10), a.user_id)
    returning id into v_id;
  else
    update public.ecosphere_pages
       set slug = v_slug, title = v_title, blocks = v_blocks, published = coalesce((p ->> 'published')::boolean, false),
           position = least(greatest(coalesce((p ->> 'position')::integer, 1), 1), 10), updated_by = a.user_id, updated_at = now()
     where id = p_id and university_id = a.university_id
    returning id into v_id;
    if v_id is null then
      raise exception 'page not found' using errcode = 'P0002';
    end if;
  end if;
  perform private.uni_audit(a.university_id, 'ecosphere.page', 'page', v_id::text, jsonb_build_object('slug', v_slug));
  return v_id;
end;
$$;

create function private.delete_ecosphere_page(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  delete from public.ecosphere_pages where id = p_id and university_id = a.university_id;
  if not found then
    raise exception 'page not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'ecosphere.page_delete', 'page', p_id::text);
end;
$$;

-- What a featured-ventures or faculty-spotlight block may pick from.
create function private.uni_feature_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'comms']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'ventures', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title) order by v.created_at desc)
        from (select v.* from public.ventures v
               where v.visibility = 'public'
                 and exists (select 1 from public.venture_members m join public.profiles p on p.user_id = m.user_id
                              where m.venture_id = v.id and p.university_id = a.university_id)
               order by v.created_at desc limit 100) v), '[]'::jsonb),
    'faculty', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.user_id, 'name', p.full_name, 'title', t.title, 'department', t.department) order by p.full_name)
        from public.teacher_profiles t join public.profiles p on p.user_id = t.user_id
       where t.university_id = a.university_id and t.status = 'approved'), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Awards (owner and admins for every student; coordinators for their department)
-- ---------------------------------------------------------------------------
create function private.uni_badges()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'name', b.name, 'description', b.description, 'icon', b.icon, 'archived', b.archived_at is not null,
             'awards', coalesce((
               select jsonb_agg(jsonb_build_object('id', w.id, 'student', p.full_name, 'username', p.username,
                                                   'department', p.department, 'awarded_at', w.awarded_at, 'note', w.note)
                                order by w.awarded_at desc)
                 from public.badge_awards w join public.profiles p on p.user_id = w.student_id
                where w.badge_id = b.id and w.revoked_at is null
                  and (a.role <> 'coordinator' or p.department_id = a.department_id)), '[]'::jsonb))
             order by b.archived_at nulls first, b.created_at desc)
      from public.university_badges b where b.university_id = a.university_id), '[]'::jsonb);
end;
$$;

create function private.save_badge(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_desc text := nullif(btrim(coalesce(p ->> 'description', '')), '');
  v_icon text := coalesce(p ->> 'icon', 'trophy');
  v_id uuid;
begin
  if char_length(v_name) not between 2 and 60 then
    raise exception 'award names are 2 to 60 characters' using errcode = '22023';
  end if;
  if v_desc is not null and char_length(v_desc) > 300 then
    raise exception 'keep the description under 300 characters' using errcode = '22023';
  end if;
  if v_icon not in ('trophy', 'medal', 'star', 'certificate', 'lightbulb', 'rocket', 'code', 'users', 'flask', 'globe') then
    raise exception 'pick an icon from the list' using errcode = '22023';
  end if;
  if exists (select 1 from public.university_badges b where b.university_id = a.university_id and b.archived_at is null
               and lower(b.name) = lower(v_name) and b.id is distinct from p_id) then
    raise exception 'you already have an award with that name' using errcode = '23505';
  end if;
  if p_id is null then
    if (select count(*) from public.university_badges b where b.university_id = a.university_id and b.archived_at is null) >= 50 then
      raise exception 'up to 50 awards' using errcode = '23514';
    end if;
    insert into public.university_badges (university_id, name, description, icon, created_by)
    values (a.university_id, v_name, v_desc, v_icon, a.user_id) returning id into v_id;
  else
    update public.university_badges set name = v_name, description = v_desc, icon = v_icon
     where id = p_id and university_id = a.university_id and archived_at is null returning id into v_id;
    if v_id is null then
      raise exception 'award not found' using errcode = 'P0002';
    end if;
  end if;
  perform private.uni_audit(a.university_id, 'award.save', 'badge', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

create function private.archive_badge(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  update public.university_badges set archived_at = now() where id = p_id and university_id = a.university_id and archived_at is null;
  if not found then
    raise exception 'award not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'award.archive', 'badge', p_id::text);
end;
$$;

-- p_student: a username or the student's university email.
create function private.award_badge(p_badge uuid, p_student text, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  b public.university_badges;
  v_q text := lower(btrim(coalesce(p_student, '')));
  s public.profiles;
  v_id uuid;
begin
  select * into b from public.university_badges where id = p_badge and university_id = a.university_id and archived_at is null;
  if not found then
    raise exception 'award not found' using errcode = 'P0002';
  end if;
  select p.* into s from public.profiles p
   where p.university_id = a.university_id and p.role = 'student' and p.status in ('active', 'graduate')
     and (p.username = v_q or exists (select 1 from auth.users u where u.id = p.user_id and lower(u.email) = v_q))
   limit 1;
  if s.user_id is null then
    raise exception 'no student at your university with that username or email' using errcode = 'P0002';
  end if;
  if a.role = 'coordinator' and s.department_id is distinct from a.department_id then
    raise exception 'coordinators award students of their own department' using errcode = '42501';
  end if;
  if p_note is not null and char_length(p_note) > 300 then
    raise exception 'keep the note under 300 characters' using errcode = '22023';
  end if;
  if not private.rate_limit('uni_award:' || a.user_id::text, 200, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.badge_awards (badge_id, student_id, awarded_by, note)
  values (b.id, s.user_id, a.user_id, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict do nothing returning id into v_id;
  if v_id is null then
    raise exception 'this student already has that award' using errcode = '23505';
  end if;
  perform private.uni_audit(a.university_id, 'award.grant', 'badge_award', v_id::text,
                            jsonb_build_object('badge', b.name, 'student', s.user_id));
  perform private.notify(s.user_id, null, 'uni_award', 'badge_award', v_id,
                         jsonb_build_object('award', b.name, 'university', (select u.name from public.universities u where u.id = a.university_id)));
  return v_id;
end;
$$;

create function private.revoke_award(p_award uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  w record;
begin
  select bw.id, bw.student_id, p.department_id into w
    from public.badge_awards bw
    join public.university_badges b on b.id = bw.badge_id
    join public.profiles p on p.user_id = bw.student_id
   where bw.id = p_award and b.university_id = a.university_id and bw.revoked_at is null
   for update of bw;
  if w.id is null then
    raise exception 'award not found' using errcode = 'P0002';
  end if;
  if a.role = 'coordinator' and w.department_id is distinct from a.department_id then
    raise exception 'coordinators manage awards in their own department' using errcode = '42501';
  end if;
  update public.badge_awards set revoked_at = now(), revoked_by = a.user_id where id = p_award;
  perform private.uni_audit(a.university_id, 'award.revoke', 'badge_award', p_award::text);
end;
$$;

-- Awards on a profile, for anyone who may see that profile.
create function private.awards_for(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_user = (select auth.uid()) or private.can_view_profile(p_user) then coalesce((
    select jsonb_agg(jsonb_build_object('id', w.id, 'name', b.name, 'description', b.description, 'icon', b.icon,
                                        'university', u.name, 'awarded_at', w.awarded_at) order by w.awarded_at desc)
      from public.badge_awards w
      join public.university_badges b on b.id = w.badge_id
      join public.universities u on u.id = b.university_id
     where w.student_id = p_user and w.revoked_at is null), '[]'::jsonb) else '[]'::jsonb end;
$$;

-- ---------------------------------------------------------------------------
-- Calendar (owner and admins): semesters and exam periods (≤ 45 days, no overlap, ≤ 90 days a year)
-- ---------------------------------------------------------------------------
create function private.uni_calendar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career', 'coordinator', 'comms']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'semesters', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on)
                                            order by s.starts_on desc)
                             from public.semesters s where s.university_id = a.university_id), '[]'::jsonb),
    'exam_periods', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'starts_on', e.starts_on, 'ends_on', e.ends_on, 'reason', e.reason)
                                               order by e.starts_on desc)
                                from public.exam_periods e where e.university_id = a.university_id), '[]'::jsonb));
end;
$$;

create function private.uni_save_semester(p_name text, p_starts date, p_ends date)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'name the semester (2 to 60 characters)' using errcode = '22023';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts or p_ends - p_starts > 366 then
    raise exception 'a semester ends after it starts and lasts up to a year' using errcode = '22023';
  end if;
  if (select count(*) from public.semesters s where s.university_id = a.university_id) >= 40 then
    raise exception 'up to 40 semesters' using errcode = '23514';
  end if;
  insert into public.semesters (university_id, name, starts_on, ends_on, created_by)
  values (a.university_id, btrim(p_name), p_starts, p_ends, a.user_id) returning id into v_id;
  perform private.uni_audit(a.university_id, 'calendar.semester', 'semester', v_id::text,
                            jsonb_build_object('name', p_name, 'starts_on', p_starts, 'ends_on', p_ends));
  return v_id;
end;
$$;

create function private.uni_delete_semester(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  delete from public.semesters where id = p_id and university_id = a.university_id;
  if not found then
    raise exception 'semester not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'calendar.semester_delete', 'semester', p_id::text);
end;
$$;

create function private.uni_add_exam_period(p_starts date, p_ends date, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_year integer;
  v_days integer;
  v_id uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then
    raise exception 'the end date must be on or after the start date' using errcode = '22023';
  end if;
  if p_ends - p_starts >= 45 then
    raise exception 'an exam period can be at most 45 days' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('exam-periods:' || a.university_id::text, 0));
  if exists (select 1 from public.exam_periods e
              where e.university_id = a.university_id and e.starts_on <= p_ends and e.ends_on >= p_starts) then
    raise exception 'this overlaps an exam period already entered' using errcode = '23514';
  end if;
  -- At most 90 exam days in any calendar year (decay pauses on these days; decisions.md 2026-10-04).
  for v_year in extract(year from p_starts)::integer .. extract(year from p_ends)::integer loop
    select coalesce(sum(least(e.ends_on, make_date(v_year, 12, 31)) - greatest(e.starts_on, make_date(v_year, 1, 1)) + 1), 0)
      into v_days
      from public.exam_periods e
     where e.university_id = a.university_id and e.starts_on <= make_date(v_year, 12, 31) and e.ends_on >= make_date(v_year, 1, 1);
    v_days := v_days + (least(p_ends, make_date(v_year, 12, 31)) - greatest(p_starts, make_date(v_year, 1, 1)) + 1);
    if v_days > 90 then
      raise exception 'exam periods can cover at most 90 days in % (this would make %)', v_year, v_days using errcode = '23514';
    end if;
  end loop;
  insert into public.exam_periods (university_id, starts_on, ends_on, reason, created_by)
  values (a.university_id, p_starts, p_ends, btrim(p_reason), a.user_id)
  returning id into v_id;
  perform private.uni_audit(a.university_id, 'calendar.exam_add', 'exam_period', v_id::text,
                            jsonb_build_object('starts_on', p_starts, 'ends_on', p_ends, 'reason', btrim(p_reason)));
  return v_id;
end;
$$;

create function private.uni_remove_exam_period(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  e public.exam_periods;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  delete from public.exam_periods where id = p_id and university_id = a.university_id returning * into e;
  if e.id is null then
    raise exception 'exam period not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'calendar.exam_remove', 'exam_period', p_id::text,
                            jsonb_build_object('starts_on', e.starts_on, 'ends_on', e.ends_on, 'reason', btrim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding questions
-- ---------------------------------------------------------------------------
-- Counts per option, each shown only at 5 or more ("fewer than 5" otherwise).
create function private.uni_questions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.id, 'prompt', q.prompt, 'options', q.options, 'created_at', q.created_at,
             'removed', q.removed_at is not null, 'removed_by_staff', q.removed_by_staff, 'removed_reason', q.removed_reason,
             'answers', (select count(*) from public.university_question_answers x where x.question_id = q.id),
             'counts', (select jsonb_agg(case when n >= 5 then to_jsonb(n) else 'null'::jsonb end order by i)
                          from (select o.i, (select count(*) from public.university_question_answers x
                                              where x.question_id = q.id and x.option_index = o.i - 1)::integer as n
                                  from generate_series(1, jsonb_array_length(q.options)) o(i)) c))
             order by q.removed_at nulls first, q.created_at)
      from public.university_questions q where q.university_id = a.university_id), '[]'::jsonb);
end;
$$;

create function private.save_uni_question(p_prompt text, p_options jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_prompt text := btrim(coalesce(p_prompt, ''));
  v_options jsonb;
  v_id uuid;
begin
  if char_length(v_prompt) not between 5 and 200 then
    raise exception 'questions are 5 to 200 characters' using errcode = '22023';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array' then
    raise exception 'give 2 to 6 answer options' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(btrim(o) order by ord), '[]'::jsonb) into v_options
    from jsonb_array_elements_text(p_options) with ordinality t(o, ord) where char_length(btrim(o)) > 0;
  if jsonb_array_length(v_options) not between 2 and 6
     or exists (select 1 from jsonb_array_elements_text(v_options) o where char_length(o) > 60) then
    raise exception 'give 2 to 6 answer options of up to 60 characters' using errcode = '22023';
  end if;
  if private.sensitive_topic(v_prompt || ' ' || v_options::text) then
    raise exception 'questions can''t ask about religion, ethnicity, health, politics or income' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uni-questions:' || a.university_id::text, 0));
  if (select count(*) from public.university_questions q where q.university_id = a.university_id and q.removed_at is null) >= 3 then
    raise exception 'up to 3 questions; remove one first' using errcode = '23514';
  end if;
  insert into public.university_questions (university_id, prompt, options, created_by)
  values (a.university_id, v_prompt, v_options, a.user_id) returning id into v_id;
  perform private.uni_audit(a.university_id, 'question.add', 'question', v_id::text, jsonb_build_object('prompt', v_prompt));
  return v_id;
end;
$$;

create function private.remove_uni_question(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  update public.university_questions set removed_at = now(), removed_by = a.user_id
   where id = p_id and university_id = a.university_id and removed_at is null;
  if not found then
    raise exception 'question not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'question.remove', 'question', p_id::text);
end;
$$;

-- The student's own university's active questions, with their own answer.
create function private.my_uni_questions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'options', q.options, 'answer', x.option_index)
                            order by q.created_at), '[]'::jsonb)
    from public.profiles p
    join public.university_questions q on q.university_id = p.university_id and q.removed_at is null
    left join public.university_question_answers x on x.question_id = q.id and x.user_id = p.user_id
   where p.user_id = (select auth.uid()) and p.role = 'student';
$$;

create function private.answer_uni_question(p_question uuid, p_option integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  q public.university_questions;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select qq.* into q from public.university_questions qq
    join public.profiles p on p.user_id = v_me and p.role = 'student' and p.university_id = qq.university_id
   where qq.id = p_question and qq.removed_at is null;
  if q.id is null then
    raise exception 'question not found' using errcode = 'P0002';
  end if;
  if p_option is null then
    delete from public.university_question_answers where question_id = q.id and user_id = v_me;
    return;
  end if;
  if p_option < 0 or p_option >= jsonb_array_length(q.options) then
    raise exception 'pick one of the options' using errcode = '22023';
  end if;
  insert into public.university_question_answers (question_id, user_id, option_index) values (q.id, v_me, p_option)
  on conflict (question_id, user_id) do update set option_index = excluded.option_index, answered_at = now();
end;
$$;

-- Staff (accounts) list and remove questions anywhere, audited (decisions.md 2026-10-04, Ahmed).
create function private.ops_uni_questions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'university', u.name, 'prompt', q.prompt, 'options', q.options,
                                        'created_at', q.created_at) order by q.created_at desc)
      from (select * from public.university_questions where removed_at is null order by created_at desc limit 200) q
      join public.universities u on u.id = q.university_id), '[]'::jsonb);
end;
$$;

create function private.ops_remove_uni_question(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  q public.university_questions;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason the university can read' using errcode = '22023';
  end if;
  update public.university_questions
     set removed_at = now(), removed_by = v_me, removed_reason = btrim(p_reason), removed_by_staff = true
   where id = p_id and removed_at is null returning * into q;
  if q.id is null then
    raise exception 'question not found' using errcode = 'P0002';
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before)
  values (v_me, 'uni.question_remove', 'university', q.university_id::text, btrim(p_reason),
          jsonb_build_object('question', q.id, 'prompt', q.prompt, 'options', q.options));
  perform private.notify(a.user_id, null, 'uni_question_removed', 'university', q.university_id,
                         jsonb_build_object('prompt', q.prompt, 'reason', btrim(p_reason)))
     from public.university_admins a where a.university_id = q.university_id and a.role in ('owner', 'admin');
end;
$$;

-- The Home card's dismissal is a ui_state key.
create or replace function private.set_ui_state(p_key text, p_value jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_key is null or p_key <> all (array['progress_card_dismissed_on', 'checklist_dismissed', 'uni_questions_dismissed']) then
    raise exception 'unknown setting' using errcode = '22023';
  end if;
  if p_value is null or char_length(p_value::text) > 100 then
    raise exception 'that value is too long' using errcode = '22023';
  end if;
  insert into public.ui_state (user_id, key, value) values (v_me, p_key, p_value)
  on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- The ecosphere for signed-in users (/u/[slug]); members see more
-- ---------------------------------------------------------------------------
create function private.is_uni_member(p_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.university_id = p_university
                  and p.role in ('student', 'faculty', 'university_admin'));
$$;
revoke all on function private.is_uni_member(uuid) from public;
grant execute on function private.is_uni_member(uuid) to authenticated;

create function private.ecosphere_home(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  u public.universities;
  c public.ecosphere_config;
  v_member boolean;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into u from public.universities x where x.slug = lower(p_slug);
  if not found then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  select * into c from public.ecosphere_config x where x.university_id = u.id;
  v_member := private.is_uni_member(u.id);
  return jsonb_build_object(
    'university', jsonb_build_object('id', u.id, 'name', u.name, 'slug', u.slug, 'city', u.city, 'claimed', u.owner_id is not null),
    'branding', coalesce(c.branding, '{}'::jsonb),
    'welcome', c.welcome,
    'modules', coalesce(c.modules, '{"feed": true, "events": true, "ideas": true, "teachers": true, "leaderboard": true, "job_board": true}'::jsonb),
    'is_member', v_member,
    'pages', coalesce((select jsonb_agg(jsonb_build_object('slug', p.slug, 'title', p.title) order by p.position, p.title)
                         from public.ecosphere_pages p where p.university_id = u.id and p.published), '[]'::jsonb),
    'semesters', case when v_member then coalesce((
                   select jsonb_agg(jsonb_build_object('name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on) order by s.starts_on)
                     from public.semesters s where s.university_id = u.id and s.ends_on >= current_date), '[]'::jsonb) else '[]'::jsonb end,
    'teachers', case when v_member and private.uni_module(u.id, 'teachers') then coalesce((
                  select jsonb_agg(jsonb_build_object('name', p.full_name, 'title', t.title, 'department', t.department) order by t.department, p.full_name)
                    from public.teacher_profiles t join public.profiles p on p.user_id = t.user_id
                   where t.university_id = u.id and t.status = 'approved'), '[]'::jsonb) else null end,
    'jobs', case when private.uni_module(u.id, 'job_board') then coalesce((
              select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'company', o.name, 'type', j.type, 'deadline', j.deadline)
                               order by j.published_at desc)
                from (select * from public.job_posts where status = 'live' and deadline >= current_date order by published_at desc limit 8) j
                join public.organizations o on o.id = j.org_id and o.status = 'verified'), '[]'::jsonb) else null end);
end;
$$;

-- One published page with its blocks resolved (only what the viewer may see).
create function private.ecosphere_page(p_slug text, p_page text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u public.universities;
  pg public.ecosphere_pages;
  b jsonb;
  v_out jsonb := '[]'::jsonb;
  v_member boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into u from public.universities x where x.slug = lower(p_slug);
  select * into pg from public.ecosphere_pages x where x.university_id = u.id and x.slug = lower(p_page) and x.published;
  if pg.id is null then
    raise exception 'page not found' using errcode = 'P0002';
  end if;
  v_member := private.is_uni_member(u.id);
  for b in select * from jsonb_array_elements(pg.blocks) loop
    if b ->> 'type' = 'ventures' then
      b := b || jsonb_build_object('items', coalesce((
             select jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'type', v.type, 'status', v.status))
               from public.ventures v
              where v.id in (select (x #>> '{}')::uuid from jsonb_array_elements(b -> 'ids') x) and private.can_view_venture(v.id)), '[]'::jsonb));
    elsif b ->> 'type' = 'faculty' then
      b := b || jsonb_build_object('items', coalesce((
             select jsonb_agg(jsonb_build_object('name', p.full_name, 'title', t.title, 'department', t.department))
               from public.teacher_profiles t join public.profiles p on p.user_id = t.user_id
              where t.university_id = u.id and t.status = 'approved'
                and t.user_id in (select (x #>> '{}')::uuid from jsonb_array_elements(b -> 'ids') x)), '[]'::jsonb));
    elsif b ->> 'type' = 'announcements' and not v_member then
      continue;
    end if;
    v_out := v_out || jsonb_build_array(b);
  end loop;
  return jsonb_build_object('university', jsonb_build_object('id', u.id, 'name', u.name, 'slug', u.slug),
                            'title', pg.title, 'slug', pg.slug, 'blocks', v_out, 'is_member', v_member,
                            'branding', coalesce((select c.branding from public.ecosphere_config c where c.university_id = u.id), '{}'::jsonb));
end;
$$;

-- The signed-in member's own university: slug and modules (nav, feed tabs, leaderboard scope).
create function private.my_ecosphere()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('slug', u.slug, 'name', u.name,
                            'modules', coalesce(c.modules, '{"feed": true, "events": true, "ideas": true, "teachers": true, "leaderboard": true, "job_board": true}'::jsonb),
                            'batch_labels', coalesce(c.batch_labels, '{}'::jsonb))
    from public.profiles p
    join public.universities u on u.id = p.university_id
    left join public.ecosphere_config c on c.university_id = u.id
   where p.user_id = (select auth.uid());
$$;

-- Feed module off: that university's students can't post to "my university" (Global stays).
create function private.posts_feed_module()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience = 'university' and new.type not in ('announcement', 'shipped')
     and not private.uni_module(new.university_id, 'feed') then
    raise exception 'your university has turned off its University Feed; post to Global instead' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.posts_feed_module() from public;
create trigger posts_feed_module before insert on public.posts
  for each row execute function private.posts_feed_module();

-- ---------------------------------------------------------------------------
-- CV: awards appear in the next version ("awarded by {University}"); no effect on ranking
-- ---------------------------------------------------------------------------
create or replace function private.cv_snapshot(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := private.cv_snapshot_base(p_user);
  v_projects jsonb;
begin
  if jsonb_typeof(v -> 'projects') is distinct from 'array' then
    return v;
  end if;
  select coalesce(jsonb_agg(
           p || jsonb_build_object(
             'faculty_confirmed', (
               select count(*)::integer from public.contributions o
                where o.venture_id = (p ->> 'id')::uuid and o.user_id = p_user and o.corrects_id is null
                  and exists (select 1 from public.contribution_confirmations k
                               where k.confirmer_role = 'supervisor'
                                 and k.contribution_id = (select c.id from public.contributions c
                                                           where c.id = o.id or c.corrects_id = o.id
                                                           order by c.created_at desc, (c.id = o.id) limit 1))),
             'faculty_reviewed', exists (select 1 from public.venture_reviews r where r.venture_id = (p ->> 'id')::uuid))
           order by ord), '[]'::jsonb)
    into v_projects
    from jsonb_array_elements(v -> 'projects') with ordinality as t (p, ord);
  v := jsonb_set(v, '{projects}', v_projects);
  return v || jsonb_build_object('awards', coalesce((
    select jsonb_agg(jsonb_build_object('name', b.name, 'university', u.name,
                                        'awarded', to_char((w.awarded_at at time zone 'Asia/Karachi')::date, 'YYYY-MM-DD'))
                     order by w.awarded_at, b.name)
      from public.badge_awards w
      join public.university_badges b on b.id = w.badge_id
      join public.universities u on u.id = b.university_id
     where w.student_id = p_user and w.revoked_at is null), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily: university-media files no longer used by branding or a page
-- ---------------------------------------------------------------------------
create function private.uni_media_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_n integer := 0;
begin
  for c in
    select o.name from storage.objects o
     where o.bucket_id = 'university-media' and o.created_at < now() - interval '1 day'
       and not exists (select 1 from public.ecosphere_config e
                        where e.branding ->> 'logo_path' = o.name or e.branding ->> 'cover_path' = o.name)
       and not exists (select 1 from public.ecosphere_pages p, jsonb_array_elements(p.blocks) b where b ->> 'path' = o.name)
  loop
    perform private.queue_storage_cleanup('university-media', c.name);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.uni_media_cleanup() from public;

create or replace function private.uni_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  c record;
  v_n integer := 0;
begin
  v_run := public.job_run_start('uni-daily');
  begin
    for c in
      update public.university_claims set letter_deleted_at = now()
       where status <> 'pending' and letter_deleted_at is null and reviewed_at < now() - interval '90 days'
      returning letter_path
    loop
      perform private.queue_storage_cleanup('university-claims', c.letter_path);
      v_n := v_n + 1;
    end loop;
    for c in
      select o.name from storage.objects o
       where o.bucket_id = 'university-claims' and o.created_at < now() - interval '1 day'
         and not exists (select 1 from public.university_claims x where x.letter_path = o.name)
    loop
      perform private.queue_storage_cleanup('university-claims', c.name);
      v_n := v_n + 1;
    end loop;
    v_n := v_n + private.uni_media_cleanup();
    -- Slug reservations end after 90 days.
    delete from public.university_slug_history where released_at < now() - interval '90 days';
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
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
  'uni_ecosphere', 'save_ecosphere_modules', 'save_branding', 'set_branding_image', 'save_ecosphere_structure',
  'uni_change_slug', 'save_ecosphere_page', 'delete_ecosphere_page', 'uni_feature_options',
  'uni_badges', 'save_badge', 'archive_badge', 'award_badge', 'revoke_award', 'awards_for',
  'uni_calendar', 'uni_save_semester', 'uni_delete_semester', 'uni_add_exam_period', 'uni_remove_exam_period',
  'uni_questions', 'save_uni_question', 'remove_uni_question', 'my_uni_questions', 'answer_uni_question',
  'ops_uni_questions', 'ops_remove_uni_question',
  'ecosphere_home', 'ecosphere_page', 'my_ecosphere'
]);

drop function pg_temp.expose(text[]);
