-- Phase 4, slice 3: credentials and the /ops trust queue (PRD 5.19, 5.26; decisions.md
-- 2026-09-30). Students upload a certificate (PDF up to 5 MB as-is, or an image the server
-- re-encodes without metadata) with its issuer and dates; a trust reviewer on two-factor
-- claims it in /ops, looks at the file through a short signed URL, and approves (picking a
-- recognised issuer, if any) or rejects with a reason. Every staff step writes ops_audit_log.
-- Expired credentials drop out daily; rejected files are deleted after 30 days; uploads never
-- submitted are deleted after a day. The GitHub review flags from phase 2 get the same
-- claim-and-audit treatment for their /ops tab. Staff see how much of the Free plan's 1 GB of
-- storage is used.

insert into public.platform_config (key, version, value, reason) values
  ('credentials.limits', 1, '{"max_pdf_bytes": 5242880, "max_active": 20, "max_pending": 5, "rejected_file_days": 30}',
   'PRD 5.19 with the 5 MB PDF limit (decisions.md 2026-09-30)'),
  ('storage.quota_bytes', 1, '1073741824', 'Supabase Free plan storage (decisions.md 2026-09-30)');

-- ---------------------------------------------------------------------------
-- Recognised issuers (staff-managed; the /ops editor comes in phase 11)
-- ---------------------------------------------------------------------------
create table public.recognised_issuers (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 2 and 120),
  -- Other names people type for the same issuer, lower case, for the reviewer's suggestion.
  aliases text[] not null default '{}',
  retired_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.recognised_issuers is
  'Issuers whose credentials earn the 1.5x multiplier (PRD 5.19). The reviewer picks one when approving.';
alter table public.recognised_issuers enable row level security;
revoke all on table public.recognised_issuers from anon, authenticated;
grant select on table public.recognised_issuers to authenticated;
create policy recognised_issuers_read on public.recognised_issuers for select to authenticated using (true);

insert into public.recognised_issuers (id, name, aliases) values
  ('hec', 'Higher Education Commission (HEC)', array['hec', 'higher education commission']),
  ('navttc', 'NAVTTC', array['navttc', 'national vocational and technical training commission']),
  ('pseb', 'Pakistan Software Export Board (PSEB)', array['pseb', 'pakistan software export board']),
  ('piaic', 'PIAIC', array['piaic', 'presidential initiative for artificial intelligence and computing']),
  ('nftp', 'National Freelance Training Programme (NFTP)', array['nftp', 'national freelance training programme', 'national freelance training program']),
  ('digiskills', 'DigiSkills.pk', array['digiskills', 'digiskills.pk', 'digi skills']),
  ('google', 'Google', array['google', 'google cloud', 'google career certificates']),
  ('microsoft', 'Microsoft', array['microsoft', 'microsoft learn', 'azure']),
  ('aws', 'Amazon Web Services (AWS)', array['aws', 'amazon web services', 'amazon']),
  ('cisco', 'Cisco', array['cisco', 'cisco networking academy']),
  ('oracle', 'Oracle', array['oracle', 'oracle university']),
  ('meta', 'Meta', array['meta', 'facebook']),
  ('ibm', 'IBM', array['ibm']),
  ('comptia', 'CompTIA', array['comptia']),
  ('linux-foundation', 'The Linux Foundation', array['linux foundation', 'the linux foundation', 'cncf']),
  ('red-hat', 'Red Hat', array['red hat', 'redhat']),
  ('huawei', 'Huawei', array['huawei', 'huawei ict academy']);

-- ---------------------------------------------------------------------------
-- Credentials
-- ---------------------------------------------------------------------------
create type public.credential_status as enum ('pending', 'approved', 'rejected', 'expired');

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  issuer text not null check (char_length(btrim(issuer)) between 2 and 120),
  issued_on date not null check (issued_on >= date '1980-01-01'),
  expires_on date check (expires_on is null or expires_on > issued_on),
  verify_url text check (verify_url is null or (verify_url ~ '^https://[^\s]+$' and char_length(verify_url) <= 500)),
  -- credentials/{user_id}/{uuid}.pdf|.webp; the file is never public.
  file_path text not null unique check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$'),
  file_type text not null check (file_type in ('pdf', 'image')),
  file_bytes integer not null check (file_bytes > 0),
  status public.credential_status not null default 'pending',
  recognised_issuer_id text references public.recognised_issuers (id),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(btrim(review_reason)) between 3 and 2000),
  file_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (recognised_issuer_id is null or status in ('approved', 'expired')),
  check ((status = 'pending') = (reviewed_at is null))
);
comment on table public.credentials is
  'Certificates (PRD 5.19). Only approved, unexpired ones reach the profile, the CV and the ranking.';
create index credentials_user_idx on public.credentials (user_id, created_at desc);
create index credentials_pending_idx on public.credentials (created_at) where status = 'pending';
create index credentials_expiry_idx on public.credentials (expires_on) where status = 'approved' and expires_on is not null;
create index credentials_issuer_idx on public.credentials (recognised_issuer_id) where recognised_issuer_id is not null;
create index credentials_claimed_by_idx on public.credentials (claimed_by) where claimed_by is not null;
create index credentials_reviewer_idx on public.credentials (reviewer_id) where reviewer_id is not null;

-- The owner reads their own rows (status and reason included); everyone else reads through
-- credentials_for(); staff through the queue functions. No direct writes.
alter table public.credentials enable row level security;
revoke all on table public.credentials from anon, authenticated;
grant select on table public.credentials to authenticated;
create policy credentials_read_own on public.credentials for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('credentials', 'credentials', false, 5242880, array['application/pdf', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- An upload into your own folder, with a fresh name, while you're under the limit of files.
create function private.credential_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$'
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and (select count(*) from storage.objects o
           where o.bucket_id = 'credentials' and o.owner_id = (select auth.uid())::text)
         < (private.config('credentials.limits') ->> 'max_active')::integer + 5;
$$;
revoke all on function private.credential_upload_allowed(text) from public;
grant execute on function private.credential_upload_allowed(text) to authenticated;

-- A file not yet attached to a credential (the student may take back an upload).
create function private.credential_file_unused(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.credentials c where c.file_path = p_name);
$$;
revoke all on function private.credential_file_unused(text) from public;
grant execute on function private.credential_file_unused(text) to authenticated;

create policy credentials_files_read on storage.objects for select to authenticated
  using (bucket_id = 'credentials'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff('trust_reviewer'))));
create policy credentials_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'credentials' and private.credential_upload_allowed(name));
create policy credentials_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'credentials' and owner_id = (select auth.uid())::text and private.credential_file_unused(name));

-- Deleted and rejected files go through the storage-cleanup worker (service role).
create or replace function private.queue_storage_cleanup(p_bucket text, p_path text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.send('storage_cleanup', jsonb_build_object('bucket', p_bucket, 'path', p_path))
   where p_path is not null and p_bucket in ('post-media', 'chat-media', 'avatars', 'credentials');
$$;

create function private.credential_file_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.file_deleted_at is null then
    perform private.queue_storage_cleanup('credentials', old.file_path);
  end if;
  return null;
end;
$$;
revoke all on function private.credential_file_cleanup() from public;
create trigger credentials_file_cleanup after delete on public.credentials
  for each row execute function private.credential_file_cleanup();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
insert into public.notification_types (type, category, emailed) values
  ('credential_reviewed', 'trust', true),
  ('credential_expired', 'trust', false);

-- ---------------------------------------------------------------------------
-- Student side
-- ---------------------------------------------------------------------------
-- p: {title, issuer, issued_on, expires_on?, verify_url?, path}. The file must already be the
-- caller's object in the bucket; its size and type come from storage, not the browser.
create function private.submit_credential(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_limits jsonb := private.config('credentials.limits');
  v_path text := p ->> 'path';
  v_object storage.objects;
  v_mime text;
  v_bytes bigint;
  v_issued date;
  v_expires date;
  v_id uuid;
begin
  if v_path is null or v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$' or split_part(v_path, '/', 1) <> v_me::text then
    raise exception 'upload the file first' using errcode = '22023';
  end if;
  select * into v_object from storage.objects o where o.bucket_id = 'credentials' and o.name = v_path;
  if not found or v_object.owner_id is distinct from v_me::text then
    raise exception 'upload the file first' using errcode = '22023';
  end if;
  if exists (select 1 from public.credentials where file_path = v_path) then
    raise exception 'that file is already attached to a credential' using errcode = '23505';
  end if;
  v_mime := v_object.metadata ->> 'mimetype';
  v_bytes := coalesce((v_object.metadata ->> 'size')::bigint, 0);
  if not ((v_path like '%.pdf' and v_mime = 'application/pdf') or (v_path like '%.webp' and v_mime = 'image/webp')) then
    raise exception 'upload a PDF or an image' using errcode = '22023';
  end if;
  if v_bytes <= 0 or v_bytes > (v_limits ->> 'max_pdf_bytes')::bigint then
    raise exception 'files can be up to 5 MB' using errcode = '23514';
  end if;

  begin
    v_issued := (p ->> 'issued_on')::date;
    v_expires := nullif(p ->> 'expires_on', '')::date;
  exception when others then
    raise exception 'check the dates' using errcode = '22023';
  end;
  if v_issued is null or v_issued > (now() at time zone 'Asia/Karachi')::date then
    raise exception 'the issue date can''t be in the future' using errcode = '22023';
  end if;
  if v_expires is not null and v_expires <= v_issued then
    raise exception 'the expiry date must be after the issue date' using errcode = '22023';
  end if;

  if (select count(*) from public.credentials where user_id = v_me and status in ('pending', 'approved'))
     >= (v_limits ->> 'max_active')::integer then
    raise exception 'you can keep up to % credentials; delete one first', v_limits ->> 'max_active' using errcode = '23514';
  end if;
  if (select count(*) from public.credentials where user_id = v_me and status = 'pending')
     >= (v_limits ->> 'max_pending')::integer then
    raise exception 'wait for your pending credentials to be reviewed first' using errcode = '23514';
  end if;
  if not private.rate_limit('credential:' || v_me::text, 10, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;

  insert into public.credentials (user_id, title, issuer, issued_on, expires_on, verify_url, file_path, file_type, file_bytes)
  values (v_me, btrim(p ->> 'title'), btrim(p ->> 'issuer'), v_issued, v_expires,
          nullif(btrim(coalesce(p ->> 'verify_url', '')), ''), v_path,
          case when v_path like '%.pdf' then 'pdf' else 'image' end, v_bytes)
  returning id into v_id;
  return v_id;
end;
$$;

-- The owner deletes a credential at any time (it drops out of the score at the next run).
create function private.delete_credential(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.credentials where id = p_id and user_id = v_me;
  if not found then
    raise exception 'credential not found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

-- What others see on a profile: approved credentials that haven't expired.
create function private.credentials_for(p_user uuid)
returns table (id uuid, title text, issuer text, issued_on date, expires_on date, recognised boolean, verify_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, coalesce(r.name, c.issuer), c.issued_on, c.expires_on, c.recognised_issuer_id is not null, c.verify_url
    from public.credentials c
    left join public.recognised_issuers r on r.id = c.recognised_issuer_id
   where c.user_id = p_user and c.status = 'approved'
     and (c.expires_on is null or c.expires_on >= (now() at time zone 'Asia/Karachi')::date)
     and private.can_view_profile(p_user)
   order by c.issued_on desc;
$$;

-- ---------------------------------------------------------------------------
-- Staff side (trust reviewers, on two-factor)
-- ---------------------------------------------------------------------------
create function private.require_trust_reviewer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('trust_reviewer') then
    raise exception 'trust reviewers only, with two-factor on' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function private.require_trust_reviewer() from public;

-- The issuer a reviewer is likely to pick: a recognised issuer whose name or alias matches.
create function private.suggest_issuer(p_issuer text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.recognised_issuers r
   where r.retired_at is null
     and (lower(btrim(p_issuer)) = any (r.aliases) or lower(btrim(p_issuer)) = lower(r.name)
          or exists (select 1 from unnest(r.aliases) a where char_length(a) >= 4 and lower(p_issuer) like '%' || a || '%'))
   order by r.id
   limit 1;
$$;
revoke all on function private.suggest_issuer(text) from public;

create function private.credential_queue(p_status text default 'pending')
returns table (id uuid, student_name text, student_username text, university_name text, title text, issuer text,
               suggested_issuer text, file_type text, status public.credential_status, claimed_by_name text,
               claimed_by_me boolean, created_at timestamptz, reviewed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
begin
  return query
  select c.id, p.full_name, p.username, u.name, c.title, c.issuer, private.suggest_issuer(c.issuer), c.file_type, c.status,
         cp.full_name, c.claimed_by = v_me, c.created_at, c.reviewed_at
    from public.credentials c
    join public.profiles p on p.user_id = c.user_id
    left join public.universities u on u.id = p.university_id
    left join public.profiles cp on cp.user_id = c.claimed_by
   where (p_status = 'pending' and c.status = 'pending')
      or (p_status = 'reviewed' and c.status <> 'pending' and c.reviewed_at > now() - interval '30 days')
   order by case when p_status = 'pending' then c.created_at end asc, c.reviewed_at desc
   limit 200;
end;
$$;

create function private.credential_case(p_id uuid)
returns table (id uuid, user_id uuid, student_name text, student_username text, university_name text, title text,
               issuer text, issued_on date, expires_on date, verify_url text, file_path text, file_type text,
               file_bytes integer, status public.credential_status, suggested_issuer text, recognised_issuer_id text,
               claimed_by_name text, claimed_by_me boolean, reviewer_name text, review_reason text,
               created_at timestamptz, reviewed_at timestamptz, file_deleted boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
begin
  return query
  select c.id, c.user_id, p.full_name, p.username, u.name, c.title, c.issuer, c.issued_on, c.expires_on, c.verify_url,
         c.file_path, c.file_type, c.file_bytes, c.status, private.suggest_issuer(c.issuer), c.recognised_issuer_id,
         cp.full_name, c.claimed_by = v_me, rp.full_name, c.review_reason, c.created_at, c.reviewed_at,
         c.file_deleted_at is not null
    from public.credentials c
    join public.profiles p on p.user_id = c.user_id
    left join public.universities u on u.id = p.university_id
    left join public.profiles cp on cp.user_id = c.claimed_by
    left join public.profiles rp on rp.user_id = c.reviewer_id
   where c.id = p_id;
end;
$$;

create function private.claim_credential(p_id uuid, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  c public.credentials;
begin
  select * into c from public.credentials where id = p_id for update;
  if c.id is null or c.status <> 'pending' then
    raise exception 'this credential isn''t waiting for review' using errcode = '55000';
  end if;
  if c.user_id = v_me then
    raise exception 'you can''t review your own credential' using errcode = '42501';
  end if;
  if p_claim then
    if c.claimed_by is not null and c.claimed_by <> v_me then
      raise exception 'someone else is reviewing this credential' using errcode = '55000';
    end if;
    update public.credentials set claimed_by = v_me, claimed_at = now() where id = p_id;
  else
    if c.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this credential' using errcode = '55000';
    end if;
    update public.credentials set claimed_by = null, claimed_at = null where id = p_id;
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_claim then 'credential.claim' else 'credential.release' end, 'credential', p_id::text,
          case when p_claim then 'claimed to review' else 'released' end,
          jsonb_build_object('claimed_by', c.claimed_by), jsonb_build_object('claimed_by', case when p_claim then v_me end));
end;
$$;

-- Approve (optionally as a recognised issuer) or reject, with a reason the student reads.
create function private.review_credential(p_id uuid, p_approve boolean, p_reason text, p_issuer text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  c public.credentials;
  v_issuer text := nullif(btrim(coalesce(p_issuer, '')), '');
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select * into c from public.credentials where id = p_id for update;
  if c.id is null or c.status <> 'pending' then
    raise exception 'this credential isn''t waiting for review' using errcode = '55000';
  end if;
  if c.claimed_by is distinct from v_me then
    raise exception 'claim the credential before deciding' using errcode = '55000';
  end if;
  if not coalesce(p_approve, false) then
    v_issuer := null;
  elsif v_issuer is not null and not exists (select 1 from public.recognised_issuers where id = v_issuer and retired_at is null) then
    raise exception 'unknown issuer' using errcode = '22023';
  end if;
  update public.credentials
     set status = case when p_approve then 'approved' else 'rejected' end::public.credential_status,
         recognised_issuer_id = v_issuer,
         reviewer_id = v_me, reviewed_at = now(), review_reason = left(btrim(p_reason), 2000),
         claimed_by = null, claimed_at = null
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_approve then 'credential.approve' else 'credential.reject' end, 'credential', p_id::text,
          btrim(p_reason), jsonb_build_object('status', c.status),
          jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'recognised_issuer', v_issuer));
  perform private.notify(c.user_id, null, 'credential_reviewed', 'credential', c.id,
                         jsonb_build_object('title', c.title, 'approved', coalesce(p_approve, false), 'reason', left(btrim(p_reason), 280)));
end;
$$;

-- ---------------------------------------------------------------------------
-- GitHub review flags in /ops: claims and the audit log
-- ---------------------------------------------------------------------------
alter table public.review_flags add column claimed_by uuid references auth.users (id) on delete set null;
alter table public.review_flags add column claimed_at timestamptz;
create index review_flags_claimed_by_idx on public.review_flags (claimed_by) where claimed_by is not null;
create index review_flags_reviewer_idx on public.review_flags (reviewer_id) where reviewer_id is not null;

create function private.review_flag_queue()
returns table (id bigint, student_name text, student_username text, kind public.review_flag_kind, commits integer,
               claimed_by_name text, claimed_by_me boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
begin
  return query
  select f.id, p.full_name, p.username, f.kind,
         (select count(*)::integer from private.review_flag_commits l where l.flag_id = f.id),
         cp.full_name, f.claimed_by = v_me, f.created_at
    from public.review_flags f
    join public.profiles p on p.user_id = f.user_id
    left join public.profiles cp on cp.user_id = f.claimed_by
   where f.status = 'open'
   order by f.created_at
   limit 200;
end;
$$;

-- One flag with the commits it holds (repository names included: this is the reviewer's job).
create function private.review_flag_case(p_flag bigint)
returns table (id bigint, user_id uuid, student_name text, kind public.review_flag_kind, key text, refs jsonb,
               status public.review_flag_status, claimed_by_name text, claimed_by_me boolean, created_at timestamptz,
               commits jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
begin
  return query
  select f.id, f.user_id, p.full_name, f.kind, f.key, f.refs, f.status, cp.full_name, f.claimed_by = v_me, f.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('repo', g.full_name, 'sha', l.sha, 'lines', c.meaningful_lines,
                                                       'occurred_at', c.occurred_at, 'status', c.status)
                                    order by c.occurred_at)
                     from private.review_flag_commits l
                     join public.github_commits c on c.user_id = l.user_id and c.repo_id = l.repo_id and c.sha = l.sha
                     join public.github_repos g on g.repo_id = l.repo_id
                    where l.flag_id = f.id), '[]'::jsonb)
    from public.review_flags f
    join public.profiles p on p.user_id = f.user_id
    left join public.profiles cp on cp.user_id = f.claimed_by
   where f.id = p_flag;
end;
$$;

create function private.claim_review_flag(p_flag bigint, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  f public.review_flags;
begin
  select * into f from public.review_flags where id = p_flag for update;
  if f.id is null or f.status <> 'open' then
    raise exception 'this flag is resolved' using errcode = '55000';
  end if;
  if f.user_id = v_me then
    raise exception 'you can''t review your own flag' using errcode = '42501';
  end if;
  if p_claim then
    if f.claimed_by is not null and f.claimed_by <> v_me then
      raise exception 'someone else is reviewing this flag' using errcode = '55000';
    end if;
    update public.review_flags set claimed_by = v_me, claimed_at = now() where id = p_flag;
  else
    if f.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this flag' using errcode = '55000';
    end if;
    update public.review_flags set claimed_by = null, claimed_at = null where id = p_flag;
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_claim then 'review_flag.claim' else 'review_flag.release' end, 'review_flag', p_flag::text,
          case when p_claim then 'claimed to review' else 'released' end,
          jsonb_build_object('claimed_by', f.claimed_by), jsonb_build_object('claimed_by', case when p_claim then v_me end));
end;
$$;

-- Clear or uphold a flag: now claimed first, and recorded in ops_audit_log.
create or replace function private.resolve_review_flag(p_flag bigint, p_upheld boolean, p_note text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reviewer uuid := private.require_trust_reviewer();
  f public.review_flags;
begin
  if p_note is null or char_length(btrim(p_note)) < 3 then
    raise exception 'a note is required' using errcode = '22023';
  end if;
  select * into f from public.review_flags where id = p_flag for update;
  if f.id is null or f.status <> 'open' then
    return false;
  end if;
  if f.claimed_by is distinct from v_reviewer then
    raise exception 'claim the flag before deciding' using errcode = '55000';
  end if;
  update public.review_flags
     set status = case when p_upheld then 'upheld' else 'cleared' end::public.review_flag_status,
         reviewer_id = v_reviewer, note = left(p_note, 2000), resolved_at = now(), claimed_by = null, claimed_at = null
   where id = p_flag;

  if p_upheld then
    update public.github_commits g
       set status = 'excluded', exclusion = 'review'
      from private.review_flag_commits l
     where l.flag_id = p_flag and g.user_id = l.user_id and g.repo_id = l.repo_id and g.sha = l.sha
       and g.status in ('held', 'counted');
  else
    -- Back to counted unless another open flag still holds the commit.
    update public.github_commits g
       set status = 'counted'
      from private.review_flag_commits l
     where l.flag_id = p_flag and g.user_id = l.user_id and g.repo_id = l.repo_id and g.sha = l.sha
       and g.status = 'held'
       and not exists (
         select 1 from private.review_flag_commits l2
           join public.review_flags f2 on f2.id = l2.flag_id and f2.status = 'open'
          where l2.user_id = g.user_id and l2.repo_id = g.repo_id and l2.sha = g.sha
       );
  end if;
  perform private.recompute_user_skills(f.user_id);
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_reviewer, case when p_upheld then 'review_flag.uphold' else 'review_flag.clear' end, 'review_flag', p_flag::text,
          left(btrim(p_note), 2000), jsonb_build_object('status', 'open'),
          jsonb_build_object('status', case when p_upheld then 'upheld' else 'cleared' end));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage use against the Free plan's 1 GB (any staff role)
-- ---------------------------------------------------------------------------
create function private.storage_usage()
returns table (bucket text, objects bigint, bytes bigint, quota_bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only, with two-factor on' using errcode = '42501';
  end if;
  return query
  select b.id, count(o.id), coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint,
         (private.config('storage.quota_bytes') #>> '{}')::bigint
    from storage.buckets b
    left join storage.objects o on o.bucket_id = b.id
   group by b.id
   order by 3 desc, b.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily: expire credentials, delete rejected files after 30 days and uploads never used
-- ---------------------------------------------------------------------------
create function private.credentials_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_days integer := (private.config('credentials.limits') ->> 'rejected_file_days')::integer;
  c record;
  v_n integer := 0;
begin
  v_run := public.job_run_start('credentials-daily');
  begin
    for c in
      update public.credentials set status = 'expired'
       where status = 'approved' and expires_on is not null and expires_on < v_today
      returning id, user_id, title
    loop
      perform private.notify(c.user_id, null, 'credential_expired', 'credential', c.id, jsonb_build_object('title', c.title));
      v_n := v_n + 1;
    end loop;
    for c in
      update public.credentials set file_deleted_at = now()
       where status = 'rejected' and file_deleted_at is null and reviewed_at < now() - make_interval(days => v_days)
      returning file_path
    loop
      perform private.queue_storage_cleanup('credentials', c.file_path);
      v_n := v_n + 1;
    end loop;
    for c in
      select o.name from storage.objects o
       where o.bucket_id = 'credentials' and o.created_at < now() - interval '1 day'
         and not exists (select 1 from public.credentials x where x.file_path = o.name)
    loop
      perform private.queue_storage_cleanup('credentials', c.name);
      v_n := v_n + 1;
    end loop;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
end;
$$;
revoke all on function private.credentials_daily() from public;
select cron.schedule('credentials-daily', '13 19 * * *', $$select private.credentials_daily()$$); -- 00:13 PKT

-- ---------------------------------------------------------------------------
-- Grants and public wrappers (security invoker)
-- ---------------------------------------------------------------------------
revoke all on function
  private.submit_credential(jsonb),
  private.delete_credential(uuid),
  private.credentials_for(uuid),
  private.credential_queue(text),
  private.credential_case(uuid),
  private.claim_credential(uuid, boolean),
  private.review_credential(uuid, boolean, text, text),
  private.review_flag_queue(),
  private.review_flag_case(bigint),
  private.claim_review_flag(bigint, boolean),
  private.storage_usage()
  from public;
grant execute on function
  private.submit_credential(jsonb),
  private.delete_credential(uuid),
  private.credentials_for(uuid),
  private.credential_queue(text),
  private.credential_case(uuid),
  private.claim_credential(uuid, boolean),
  private.review_credential(uuid, boolean, text, text),
  private.review_flag_queue(),
  private.review_flag_case(bigint),
  private.claim_review_flag(bigint, boolean),
  private.storage_usage()
  to authenticated;

create function public.submit_credential(p jsonb) returns uuid
language sql volatile security invoker set search_path = '' as $$ select private.submit_credential(p) $$;
create function public.delete_credential(p_id uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select private.delete_credential(p_id) $$;
create function public.credentials_for(p_user uuid)
returns table (id uuid, title text, issuer text, issued_on date, expires_on date, recognised boolean, verify_url text)
language sql stable security invoker set search_path = '' as $$ select * from private.credentials_for(p_user) $$;
create function public.credential_queue(p_status text default 'pending')
returns table (id uuid, student_name text, student_username text, university_name text, title text, issuer text,
               suggested_issuer text, file_type text, status public.credential_status, claimed_by_name text,
               claimed_by_me boolean, created_at timestamptz, reviewed_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.credential_queue(p_status) $$;
create function public.credential_case(p_id uuid)
returns table (id uuid, user_id uuid, student_name text, student_username text, university_name text, title text,
               issuer text, issued_on date, expires_on date, verify_url text, file_path text, file_type text,
               file_bytes integer, status public.credential_status, suggested_issuer text, recognised_issuer_id text,
               claimed_by_name text, claimed_by_me boolean, reviewer_name text, review_reason text,
               created_at timestamptz, reviewed_at timestamptz, file_deleted boolean)
language sql stable security invoker set search_path = '' as $$ select * from private.credential_case(p_id) $$;
create function public.claim_credential(p_id uuid, p_claim boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select private.claim_credential(p_id, p_claim) $$;
create function public.review_credential(p_id uuid, p_approve boolean, p_reason text, p_issuer text default null) returns void
language sql volatile security invoker set search_path = '' as $$ select private.review_credential(p_id, p_approve, p_reason, p_issuer) $$;
create function public.review_flag_queue()
returns table (id bigint, student_name text, student_username text, kind public.review_flag_kind, commits integer,
               claimed_by_name text, claimed_by_me boolean, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.review_flag_queue() $$;
create function public.review_flag_case(p_flag bigint)
returns table (id bigint, user_id uuid, student_name text, kind public.review_flag_kind, key text, refs jsonb,
               status public.review_flag_status, claimed_by_name text, claimed_by_me boolean, created_at timestamptz,
               commits jsonb)
language sql stable security invoker set search_path = '' as $$ select * from private.review_flag_case(p_flag) $$;
create function public.claim_review_flag(p_flag bigint, p_claim boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select private.claim_review_flag(p_flag, p_claim) $$;
create function public.storage_usage()
returns table (bucket text, objects bigint, bytes bigint, quota_bytes bigint)
language sql stable security invoker set search_path = '' as $$ select * from private.storage_usage() $$;

revoke all on function
  public.submit_credential(jsonb),
  public.delete_credential(uuid),
  public.credentials_for(uuid),
  public.credential_queue(text),
  public.credential_case(uuid),
  public.claim_credential(uuid, boolean),
  public.review_credential(uuid, boolean, text, text),
  public.review_flag_queue(),
  public.review_flag_case(bigint),
  public.claim_review_flag(bigint, boolean),
  public.storage_usage()
  from public, anon;
grant execute on function
  public.submit_credential(jsonb),
  public.delete_credential(uuid),
  public.credentials_for(uuid),
  public.credential_queue(text),
  public.credential_case(uuid),
  public.claim_credential(uuid, boolean),
  public.review_credential(uuid, boolean, text, text),
  public.review_flag_queue(),
  public.review_flag_case(bigint),
  public.claim_review_flag(bigint, boolean),
  public.storage_usage()
  to authenticated;
