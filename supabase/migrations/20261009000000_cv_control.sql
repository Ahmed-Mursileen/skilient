-- Phase 5 slices 2-3: CV screens and control, verify, revocation, PDF exports
-- (PRD 5.18; decisions.md 2026-10-01).
--
-- Students change settings, make and revoke share links and revoke versions through the
-- functions below; anyone can check a code (verify_cv) or open a share link
-- (open_shared_cv); trust reviewers revoke from /ops. A PDF export is recorded only with a
-- MAC from the app's PDF route (Vault secret cv_export_secret, copied to Vercel as
-- CV_EXPORT_SECRET), so a student can't register the hash of a file Skilient didn't make.

-- ---------------------------------------------------------------------------------------
-- Entitlements: still a stub until phase 10, plus test-only grants
-- ---------------------------------------------------------------------------------------
insert into public.platform_config (key, version, value, reason)
values ('entitlements.test_grants', 1, '{}'::jsonb,
        'Phase 5: test-only entitlement grants {key: [user ids]} until the phase 10 registry; empty in production');

create or replace function private.has_entitlement(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Phase 10 replaces this body with the entitlement registry (PRD 4b). Until then only the
  -- test-only grants in platform_config 'entitlements.test_grants' count (decisions.md
  -- 2026-10-01): empty in production, changed by SQL only.
  select p_user is not null and p_key is not null
     and coalesce((private.config('entitlements.test_grants') -> p_key) ? p_user::text, false);
$$;

-- ---------------------------------------------------------------------------------------
-- Share links (Spark and above) and views
-- ---------------------------------------------------------------------------------------
create table public.cv_share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- SHA-256 of the 32-byte token; the token itself is shown once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text check (label is null or char_length(btrim(label)) between 1 and 60),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or revoked_reason in ('owner', 'staff', 'suspended', 'deleted')),
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((revoked_at is null) = (revoked_reason is null))
);
comment on table public.cv_share_links is
  'CV share links (PRD 5.18): token hash only; Spark+ to create; always open the newest version.';
create index cv_share_links_user_idx on public.cv_share_links (user_id, created_at desc);

create table public.cv_views (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  record_id uuid references public.cv_records (id) on delete set null,
  link_id uuid references public.cv_share_links (id) on delete set null,
  source text not null check (source in ('share_link', 'recruiter')),
  viewer_org_id uuid,
  -- A keyed hash (lib/security/hash.ts) of the viewer's connection for the day: counts one
  -- view per viewer per link per day without storing an IP.
  viewer_key text not null check (viewer_key ~ '^[0-9a-f]{64}$'),
  day date not null default ((now() at time zone 'Asia/Karachi')::date),
  viewed_at timestamptz not null default now(),
  unique (link_id, viewer_key, day)
);
comment on table public.cv_views is 'Who opened a CV (PRD 5.18): counts for everyone, company names for Pro (phase 8).';
create index cv_views_user_idx on public.cv_views (user_id, viewed_at desc);
create index cv_views_record_idx on public.cv_views (record_id);

alter table public.cv_share_links enable row level security;
alter table public.cv_views enable row level security;
revoke all on table public.cv_share_links, public.cv_views from anon, authenticated;
grant select on table public.cv_share_links, public.cv_views to authenticated;
create policy cv_share_links_owner_read on public.cv_share_links for select to authenticated
  using (user_id = (select auth.uid()));
create policy cv_views_owner_read on public.cv_views for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- PDF exports: one row per file; the hash stays after the file is deleted (30 days)
-- ---------------------------------------------------------------------------------------
create table public.cv_pdf_exports (
  id uuid primary key,
  record_id uuid not null references public.cv_records (id),
  user_id uuid references auth.users (id) on delete set null,
  template text not null check (template in ('standard', 'classic', 'compact', 'modern', 'academic')),
  paper text not null check (paper in ('a4', 'letter')),
  pdf_hash text not null check (pdf_hash ~ '^[0-9a-f]{64}$'),
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  bytes integer not null check (bytes > 0),
  file_deleted_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.cv_pdf_exports is
  'CV PDFs (PRD 5.18): recorded only by record_cv_export with the PDF route''s MAC; hashes kept for good.';
create index cv_pdf_exports_record_idx on public.cv_pdf_exports (record_id, pdf_hash);
create index cv_pdf_exports_user_idx on public.cv_pdf_exports (user_id, created_at desc);
create index cv_pdf_exports_live_idx on public.cv_pdf_exports (created_at) where file_deleted_at is null;

alter table public.cv_pdf_exports enable row level security;
revoke all on table public.cv_pdf_exports from anon, authenticated;
grant select on table public.cv_pdf_exports to authenticated;
create policy cv_pdf_exports_owner_read on public.cv_pdf_exports for select to authenticated
  using (user_id = (select auth.uid()));

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'cv_export_secret',
  'MAC key shared with the app (CV_EXPORT_SECRET) so only the PDF route can record an export hash'
)
where not exists (select 1 from vault.secrets where name = 'cv_export_secret');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-exports', 'cv-exports', false, 2097152, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The PDF route uploads as the student into their own folder, only while they may export.
create function private.cv_export_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and private.has_entitlement((select auth.uid()), 'cv.pdf_export')
     and (select count(*) from storage.objects o
           where o.bucket_id = 'cv-exports' and o.owner_id = (select auth.uid())::text) < 100;
$$;
revoke all on function private.cv_export_upload_allowed(text) from public;
grant execute on function private.cv_export_upload_allowed(text) to authenticated;

create policy cv_exports_read on storage.objects for select to authenticated
  using (bucket_id = 'cv-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy cv_exports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cv-exports' and private.cv_export_upload_allowed(name));

create or replace function private.queue_storage_cleanup(p_bucket text, p_path text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.send('storage_cleanup', jsonb_build_object('bucket', p_bucket, 'path', p_path))
   where p_path is not null and p_bucket in ('post-media', 'chat-media', 'avatars', 'credentials', 'cv-exports');
$$;

-- ---------------------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------------------
create function private.save_cv_settings(p_sections text[], p_show_percentile boolean, p_show_email boolean,
                                         p_visibility public.cv_visibility)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.cv_eligible(v_me) then
    raise exception 'CVs are for students who finished onboarding' using errcode = '42501';
  end if;
  if p_sections is null or cardinality(p_sections) = 0 or not private.cv_sections_valid(p_sections) then
    raise exception 'choose at least one section, each once' using errcode = '22023';
  end if;
  insert into public.cv_settings (user_id, sections, show_percentile, show_email, visibility, updated_at)
  values (v_me, p_sections, p_show_percentile, coalesce(p_show_email, false), coalesce(p_visibility, 'link'), now())
  on conflict (user_id) do update
    set sections = excluded.sections, show_percentile = excluded.show_percentile,
        show_email = excluded.show_email, visibility = excluded.visibility, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Share links
-- ---------------------------------------------------------------------------------------
create function private.create_share_link(p_token_hash text, p_label text, p_days integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if not private.cv_eligible(v_me) then
    raise exception 'CVs are for students who finished onboarding' using errcode = '42501';
  end if;
  if coalesce((select r.tier >= 'spark' from public.ranking_scores r where r.user_id = v_me), false) is not true then
    raise exception 'share links open at Spark tier' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or (p_days is not null and p_days not in (7, 30, 90)) then
    raise exception 'invalid share link' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cv-links:' || v_me::text, 0));
  if (select count(*) from public.cv_share_links l
       where l.user_id = v_me and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())) >= 10 then
    raise exception 'up to 10 active share links: revoke one first' using errcode = '23514';
  end if;
  insert into public.cv_share_links (user_id, token_hash, label, expires_at)
  values (v_me, p_token_hash, nullif(btrim(p_label), ''),
          case when p_days is not null then now() + make_interval(days => p_days) end)
  returning id into v_id;
  return v_id;
end;
$$;

create function private.revoke_share_link(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.cv_share_links set revoked_at = now(), revoked_reason = 'owner'
   where id = p_id and user_id = (select auth.uid()) and revoked_at is null;
  if not found then
    raise exception 'share link not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Opening a share link: always the newest version; if that one is revoked (or the CV is
-- private, or the account can't have one) the link is "no longer available" and never falls
-- back to an older version (decisions.md 2026-10-01). A view is counted once per viewer per day.
create function private.open_shared_cv(p_token_hash text, p_viewer_key text)
returns table (
  state text, username text, code text, issued_at timestamptz, expires_at timestamptz, key_id text,
  snapshot jsonb, snapshot_hash text, signature text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.cv_share_links;
  v_rec public.cv_records;
  v_username text;
  v_view bigint;
begin
  select * into v_link from public.cv_share_links l
   where l.token_hash = p_token_hash and l.revoked_at is null and (l.expires_at is null or l.expires_at > now());
  if v_link.id is null then
    return query select 'invalid'::text, null::text, null::text, null::timestamptz, null::timestamptz, null::text,
                        null::jsonb, null::text, null::text;
    return;
  end if;
  select p.username into v_username from public.profiles p where p.user_id = v_link.user_id;
  select * into v_rec from public.cv_records r where r.user_id = v_link.user_id order by r.version desc limit 1;
  if v_rec.id is null or v_rec.revoked_at is not null or not private.cv_eligible(v_link.user_id)
     or coalesce((select s.visibility from public.cv_settings s where s.user_id = v_link.user_id), 'link') = 'private' then
    return query select 'unavailable'::text, v_username, null::text, null::timestamptz, null::timestamptz, null::text,
                        null::jsonb, null::text, null::text;
    return;
  end if;
  if p_viewer_key ~ '^[0-9a-f]{64}$' then
    insert into public.cv_views (user_id, record_id, link_id, source, viewer_key)
    values (v_link.user_id, v_rec.id, v_link.id, 'share_link', p_viewer_key)
    on conflict (link_id, viewer_key, day) do nothing
    returning id into v_view;
    if v_view is not null then
      update public.cv_share_links set view_count = view_count + 1, last_viewed_at = now() where id = v_link.id;
    end if;
  end if;
  return query select 'ok'::text, v_username, v_rec.code, v_rec.issued_at, v_rec.expires_at, v_rec.key_id,
                      v_rec.snapshot, v_rec.snapshot_hash, v_rec.signature;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Verify: anyone may check a code. Revoked records give only code and dates.
-- ---------------------------------------------------------------------------------------
create function private.verify_cv(p_code text, p_pdf_hash text default null)
returns table (
  code text, issued_at timestamptz, expires_at timestamptz, revoked_at timestamptz, superseded_at timestamptz,
  key_id text, public_key text, snapshot jsonb, snapshot_hash text, signature text, pdf_checked boolean,
  pdf_matches boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.code, r.issued_at,
         case when r.revoked_at is null then r.expires_at end,
         r.revoked_at,
         case when r.revoked_at is null then (select n.issued_at from public.cv_records n where n.id = r.superseded_by) end,
         case when r.revoked_at is null then r.key_id end,
         case when r.revoked_at is null then k.public_key end,
         case when r.revoked_at is null then r.snapshot end,
         case when r.revoked_at is null then r.snapshot_hash end,
         case when r.revoked_at is null then r.signature end,
         p_pdf_hash is not null,
         case when p_pdf_hash is not null and r.revoked_at is null then exists (
           select 1 from public.cv_pdf_exports e where e.record_id = r.id and e.pdf_hash = lower(p_pdf_hash)) end
    from public.cv_records r
    join public.signing_keys k on k.key_id = r.key_id
   where r.code = upper(p_code);
$$;

-- ---------------------------------------------------------------------------------------
-- Revocation
-- ---------------------------------------------------------------------------------------
create function private.revoke_cv(p_record uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.cv_records set revoked_at = now(), revoked_reason = 'owner', revoked_by = (select auth.uid())
   where id = p_record and user_id = (select auth.uid()) and revoked_at is null;
  if not found then
    raise exception 'CV version not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Every version and link of one account, for suspension, bans and deletion.
create function private.revoke_all_cvs(p_user uuid, p_reason text, p_by uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.cv_records set revoked_at = now(), revoked_reason = p_reason, revoked_by = p_by
   where user_id = p_user and revoked_at is null;
  get diagnostics v_n = row_count;
  update public.cv_share_links set revoked_at = now(), revoked_reason = p_reason
   where user_id = p_user and revoked_at is null;
  return v_n;
end;
$$;

-- A sign-in ban (the emergency procedure until phase 11 sets banned_until) revokes every
-- version and link; lifting the ban restores nothing.
create function private.cv_on_ban()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.banned_until is not null and new.banned_until > now()
     and (old.banned_until is null or old.banned_until <= now()) then
    perform private.revoke_all_cvs(new.id, 'suspended');
  end if;
  return null;
end;
$$;
create trigger cv_on_ban after update of banned_until on auth.users
  for each row execute function private.cv_on_ban();

-- Account deletion: every version revoked and its content wiped; code, dates and key stay so
-- the verify page says Revoked, not Not found.
create function private.cv_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cv_records
     set revoked_at = coalesce(revoked_at, now()), revoked_reason = coalesce(revoked_reason, 'deleted'), snapshot = null
   where user_id = old.id;
  return old;
end;
$$;
create trigger cv_on_delete before delete on auth.users
  for each row execute function private.cv_on_delete();

-- Trust reviewers: find CVs by code or username, and revoke one or all with a reason.
create function private.ops_cv_records(p_query text)
returns table (
  id uuid, user_id uuid, username text, full_name text, code text, version integer, issued_at timestamptz,
  revoked_at timestamptz, revoked_reason text, superseded boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_code text := upper(regexp_replace(btrim(coalesce(p_query, '')), '[\s-]', '', 'g'));
begin
  perform private.require_trust_reviewer();
  if char_length(v_q) < 3 then
    return;
  end if;
  return query
  select r.id, r.user_id, p.username, p.full_name, r.code, r.version, r.issued_at, r.revoked_at, r.revoked_reason,
         r.superseded_by is not null
    from public.cv_records r
    left join public.profiles p on p.user_id = r.user_id
   where r.code = v_code or p.username = ltrim(v_q, '@')
   order by r.issued_at desc
   limit 50;
end;
$$;

create function private.ops_revoke_cv(p_record uuid, p_all boolean, p_reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  v_rec public.cv_records;
  v_n integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 2000 then
    raise exception 'give a reason (3 to 2,000 characters)' using errcode = '22023';
  end if;
  select * into v_rec from public.cv_records where id = p_record;
  if v_rec.id is null or v_rec.user_id is null then
    raise exception 'CV version not found' using errcode = 'P0002';
  end if;
  if coalesce(p_all, false) then
    update public.cv_records set revoked_at = now(), revoked_reason = 'staff', revoked_by = v_me
     where user_id = v_rec.user_id and revoked_at is null;
  else
    update public.cv_records set revoked_at = now(), revoked_reason = 'staff', revoked_by = v_me
     where id = p_record and revoked_at is null;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'already revoked' using errcode = '55000';
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_all then 'cv.revoke_all' else 'cv.revoke' end, 'cv_record', p_record::text, btrim(p_reason),
          jsonb_build_object('code', v_rec.code, 'user_id', v_rec.user_id),
          jsonb_build_object('revoked', v_n));
  perform private.notify(v_rec.user_id, null, 'cv_revoked', 'cv', p_record,
                         jsonb_build_object('count', v_n, 'code', v_rec.code));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Issuing: re-issue after revoking the newest, and Pro's on-demand refresh
-- ---------------------------------------------------------------------------------------
-- The newest version's content, when the student revoked it and wants the same content
-- under a new code (no data refresh).
create function private.cv_reissue_prepare(p_user uuid)
returns table (snapshot jsonb, content_hash text, latest_content_hash text, issued_at text, expires_at text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := date_trunc('second', now());
begin
  if not private.cv_eligible(p_user) then
    return;
  end if;
  return query
  select r.snapshot, r.content_hash, null::text,
         to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         to_char((v_now + interval '12 months') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    from public.cv_records r
   where r.user_id = p_user and r.revoked_reason = 'owner' and r.snapshot is not null
     and r.version = (select max(x.version) from public.cv_records x where x.user_id = p_user);
end;
$$;

create or replace function private.cv_issue_commit(
  p_user uuid, p_code text, p_key_id text, p_issued_at timestamptz, p_expires_at timestamptz,
  p_snapshot jsonb, p_content_hash text, p_snapshot_hash text, p_signature text, p_source text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_newest public.cv_records;
begin
  perform pg_advisory_xact_lock(hashtextextended('cv:' || p_user::text, 0));
  if not private.cv_eligible(p_user) then
    return null;
  end if;
  select * into v_newest from public.cv_records r where r.user_id = p_user order by r.version desc limit 1;
  if p_source = 'first' and v_newest.id is not null then
    return null;
  end if;
  if p_source = 'monthly' and p_content_hash is not distinct from (
       select r.content_hash from public.cv_records r
        where r.user_id = p_user and r.revoked_at is null order by r.version desc limit 1) then
    return null;
  end if;
  if p_source = 'reissue' then
    if v_newest.id is null or v_newest.revoked_reason is distinct from 'owner'
       or v_newest.content_hash is distinct from p_content_hash then
      raise exception 'only the newest version, after you revoked it, can be re-issued' using errcode = '55000';
    end if;
    if not private.rate_limit('cv-reissue:' || p_user::text, 5, interval '1 day') then
      raise exception 'up to 5 re-issues a day' using errcode = '54000';
    end if;
  end if;
  if p_source = 'on_demand' then
    if not private.has_entitlement(p_user, 'cv.refresh_on_demand') then
      raise exception 'refreshing any time is a Student Pro feature' using errcode = '42501';
    end if;
    if not private.rate_limit('cv-refresh:' || p_user::text, 10, interval '1 day') then
      raise exception 'up to 10 refreshes a day' using errcode = '54000';
    end if;
  end if;
  if not exists (select 1 from public.signing_keys k where k.key_id = p_key_id) then
    raise exception 'unknown signing key' using errcode = '22023';
  end if;

  v_version := coalesce(v_newest.version, 0) + 1;
  insert into public.cv_records (user_id, code, version, snapshot, content_hash, snapshot_hash, signature,
                                 key_id, source, issued_at, expires_at)
  values (p_user, p_code, v_version, p_snapshot, p_content_hash, p_snapshot_hash, p_signature,
          p_key_id, p_source, p_issued_at, p_expires_at)
  returning id into v_id;

  update public.cv_records set superseded_by = v_id
   where user_id = p_user and id <> v_id and superseded_by is null;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- PDF exports
-- ---------------------------------------------------------------------------------------
-- What the student may export now (the upgrade sheet reads it; the route enforces it).
create function private.cv_export_rights()
returns table (pdf_export boolean, templates boolean, refresh_on_demand boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_entitlement((select auth.uid()), 'cv.pdf_export'),
         private.has_entitlement((select auth.uid()), 'cv.templates'),
         private.has_entitlement((select auth.uid()), 'cv.refresh_on_demand');
$$;

-- Records a PDF the route made: the MAC over the export's fields proves it came from the
-- route (HMAC-SHA256 with the Vault secret cv_export_secret), the file must be in the
-- student's folder with the stated size, and the version must be theirs and not revoked.
create function private.record_cv_export(p_export uuid, p_record uuid, p_template text, p_paper text,
                                         p_pdf_hash text, p_bytes integer, p_mac text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_secret text;
  v_path text := v_me::text || '/' || p_export::text || '.pdf';
begin
  if not private.has_entitlement(v_me, 'cv.pdf_export') then
    raise exception 'PDF export is a Student Pro feature' using errcode = '42501';
  end if;
  if p_template <> 'standard' and not private.has_entitlement(v_me, 'cv.templates') then
    raise exception 'that template is a Student Pro feature' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cv_records r where r.id = p_record and r.user_id = v_me and r.revoked_at is null) then
    raise exception 'CV version not found' using errcode = 'P0002';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cv_export_secret';
  if v_secret is null or p_mac is null or p_mac <> encode(extensions.hmac(
       p_export::text || '|' || p_record::text || '|' || p_template || '|' || p_paper || '|' || p_pdf_hash || '|' || p_bytes::text,
       v_secret, 'sha256'), 'hex') then
    raise exception 'this export wasn''t made by Skilient' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'cv-exports' and o.name = v_path
                    and coalesce((o.metadata ->> 'size')::integer, -1) = p_bytes) then
    raise exception 'the PDF file is missing' using errcode = 'P0002';
  end if;
  if not private.rate_limit('cv-export:' || v_me::text, 20, interval '1 day') then
    raise exception 'up to 20 PDF exports a day' using errcode = '54000';
  end if;
  insert into public.cv_pdf_exports (id, record_id, user_id, template, paper, pdf_hash, path, bytes)
  values (p_export, p_record, v_me, p_template, p_paper, p_pdf_hash, v_path, p_bytes);
end;
$$;

-- Daily: PDF files go after 30 days (hashes stay), and uploads never recorded after a day.
create function private.cv_exports_daily()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run uuid := public.job_run_start('cv-exports-daily');
  v_n integer := 0;
  r record;
begin
  begin
    for r in
      update public.cv_pdf_exports set file_deleted_at = now()
       where file_deleted_at is null and created_at < now() - interval '30 days'
      returning path
    loop
      perform private.queue_storage_cleanup('cv-exports', r.path);
      v_n := v_n + 1;
    end loop;
    for r in
      select o.name from storage.objects o
       where o.bucket_id = 'cv-exports' and o.created_at < now() - interval '1 day'
         and not exists (select 1 from public.cv_pdf_exports e where e.path = o.name)
    loop
      perform private.queue_storage_cleanup('cv-exports', r.name);
      v_n := v_n + 1;
    end loop;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return 0;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
  return v_n;
end;
$$;
select cron.schedule('cv-exports-daily', '23 19 * * *', $$select private.cv_exports_daily()$$); -- 00:23 PKT

-- ---------------------------------------------------------------------------------------
-- Notifications: a monthly refresh (in-app only) and a staff revocation
-- ---------------------------------------------------------------------------------------
insert into public.notification_types (type, category, emailed) values
  ('cv_refreshed', 'trust', false),
  ('cv_revoked', 'trust', true);

create function private.cv_refreshed_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(new.user_id, null, 'cv_refreshed', 'cv', new.id, jsonb_build_object('version', new.version));
  return null;
end;
$$;
create trigger cv_refreshed_notice after insert on public.cv_records
  for each row when (new.source = 'monthly') execute function private.cv_refreshed_notice();

-- ---------------------------------------------------------------------------------------
-- Grants and public wrappers (security invoker)
-- ---------------------------------------------------------------------------------------
revoke all on function
  private.save_cv_settings(text[], boolean, boolean, public.cv_visibility),
  private.create_share_link(text, text, integer),
  private.revoke_share_link(uuid),
  private.open_shared_cv(text, text),
  private.verify_cv(text, text),
  private.revoke_cv(uuid),
  private.revoke_all_cvs(uuid, text, uuid),
  private.cv_on_ban(),
  private.cv_on_delete(),
  private.ops_cv_records(text),
  private.ops_revoke_cv(uuid, boolean, text),
  private.cv_reissue_prepare(uuid),
  private.cv_export_rights(),
  private.record_cv_export(uuid, uuid, text, text, text, integer, text),
  private.cv_exports_daily(),
  private.cv_refreshed_notice()
  from public;
grant execute on function
  private.save_cv_settings(text[], boolean, boolean, public.cv_visibility),
  private.create_share_link(text, text, integer),
  private.revoke_share_link(uuid),
  private.revoke_cv(uuid),
  private.ops_cv_records(text),
  private.ops_revoke_cv(uuid, boolean, text),
  private.cv_export_rights(),
  private.record_cv_export(uuid, uuid, text, text, text, integer, text)
  to authenticated;
grant execute on function private.open_shared_cv(text, text), private.verify_cv(text, text) to anon, authenticated;

create function public.save_cv_settings(p_sections text[], p_show_percentile boolean, p_show_email boolean,
                                        p_visibility public.cv_visibility)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.save_cv_settings(p_sections, p_show_percentile, p_show_email, p_visibility) $$;

create function public.create_share_link(p_token_hash text, p_label text, p_days integer)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.create_share_link(p_token_hash, p_label, p_days) $$;

create function public.revoke_share_link(p_id uuid)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.revoke_share_link(p_id) $$;

create function public.open_shared_cv(p_token_hash text, p_viewer_key text)
returns table (
  state text, username text, code text, issued_at timestamptz, expires_at timestamptz, key_id text,
  snapshot jsonb, snapshot_hash text, signature text
)
language sql volatile security invoker set search_path = ''
as $$ select * from private.open_shared_cv(p_token_hash, p_viewer_key) $$;

create function public.verify_cv(p_code text, p_pdf_hash text default null)
returns table (
  code text, issued_at timestamptz, expires_at timestamptz, revoked_at timestamptz, superseded_at timestamptz,
  key_id text, public_key text, snapshot jsonb, snapshot_hash text, signature text, pdf_checked boolean,
  pdf_matches boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from private.verify_cv(p_code, p_pdf_hash) $$;

create function public.revoke_cv(p_record uuid)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.revoke_cv(p_record) $$;

create function public.ops_cv_records(p_query text)
returns table (
  id uuid, user_id uuid, username text, full_name text, code text, version integer, issued_at timestamptz,
  revoked_at timestamptz, revoked_reason text, superseded boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from private.ops_cv_records(p_query) $$;

create function public.ops_revoke_cv(p_record uuid, p_all boolean, p_reason text)
returns integer
language sql volatile security invoker set search_path = ''
as $$ select private.ops_revoke_cv(p_record, p_all, p_reason) $$;

create function public.cv_export_rights()
returns table (pdf_export boolean, templates boolean, refresh_on_demand boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.cv_export_rights() $$;

create function public.record_cv_export(p_export uuid, p_record uuid, p_template text, p_paper text,
                                        p_pdf_hash text, p_bytes integer, p_mac text)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.record_cv_export(p_export, p_record, p_template, p_paper, p_pdf_hash, p_bytes, p_mac) $$;

revoke all on function
  public.save_cv_settings(text[], boolean, boolean, public.cv_visibility),
  public.create_share_link(text, text, integer),
  public.revoke_share_link(uuid),
  public.open_shared_cv(text, text),
  public.verify_cv(text, text),
  public.revoke_cv(uuid),
  public.ops_cv_records(text),
  public.ops_revoke_cv(uuid, boolean, text),
  public.cv_export_rights(),
  public.record_cv_export(uuid, uuid, text, text, text, integer, text)
  from public, anon;
grant execute on function
  public.save_cv_settings(text[], boolean, boolean, public.cv_visibility),
  public.create_share_link(text, text, integer),
  public.revoke_share_link(uuid),
  public.revoke_cv(uuid),
  public.ops_cv_records(text),
  public.ops_revoke_cv(uuid, boolean, text),
  public.cv_export_rights(),
  public.record_cv_export(uuid, uuid, text, text, text, integer, text)
  to authenticated;
grant execute on function public.open_shared_cv(text, text), public.verify_cv(text, text) to anon, authenticated;
