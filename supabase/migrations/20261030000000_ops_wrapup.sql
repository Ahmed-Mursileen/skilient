-- Phase 11, slice 5 (PRD 5.26): the audit sweep, organisation verification documents and
-- university onboarding in /ops.
--
-- Audit sweep: every staff write function records both before and after in ops_audit_log
-- (pgTAP 49 checks the whole catalogue). Four functions from phases 4, 8 and 9 recorded only
-- one side; they are redefined below, unchanged except for the audit row.

CREATE OR REPLACE FUNCTION private.add_exam_period(p_university uuid, p_starts date, p_ends date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.require_accounts();
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
  if not exists (select 1 from public.universities u where u.id = p_university) then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.exam_periods e
              where e.university_id = p_university and e.starts_on <= p_ends and e.ends_on >= p_starts) then
    raise exception 'this overlaps an exam period already entered for that university' using errcode = '23514';
  end if;
  insert into public.exam_periods (university_id, starts_on, ends_on, reason, created_by)
  values (p_university, p_starts, p_ends, btrim(p_reason), v_me)
  returning id into v_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'exam_period.add', 'exam_period', v_id::text, btrim(p_reason), '{}'::jsonb,
          jsonb_build_object('university_id', p_university, 'starts_on', p_starts, 'ends_on', p_ends));
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.remove_exam_period(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.require_accounts();
  e public.exam_periods;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  delete from public.exam_periods where id = p_id returning * into e;
  if e.id is null then
    raise exception 'exam period not found' using errcode = 'P0002';
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'exam_period.remove', 'exam_period', p_id::text, btrim(p_reason),
          jsonb_build_object('university_id', e.university_id, 'starts_on', e.starts_on, 'ends_on', e.ends_on, 'reason', e.reason), jsonb_build_object('removed', true));
end;
$function$;

CREATE OR REPLACE FUNCTION private.ops_remove_uni_question(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'uni.question_remove', 'university', q.university_id::text, btrim(p_reason),
          jsonb_build_object('question', q.id, 'prompt', q.prompt, 'options', q.options), jsonb_build_object('question', q.id, 'removed', true));
  perform private.notify(a.user_id, null, 'uni_question_removed', 'university', q.university_id,
                         jsonb_build_object('prompt', q.prompt, 'reason', btrim(p_reason)))
     from public.university_admins a where a.university_id = q.university_id and a.role in ('owner', 'admin');
end;
$function$;

CREATE OR REPLACE FUNCTION private.ops_resolve_spam_review(p_id uuid, p_action text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := private.require_accounts();
  r public.org_spam_reviews;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into r from public.org_spam_reviews where id = p_id and status = 'open' for update;
  if not found then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if p_action not in ('clear', 'suspend') or char_length(v_reason) < 3 then
    raise exception 'pick clear or suspend and give a reason' using errcode = '22023';
  end if;
  update public.org_spam_reviews
     set status = case p_action when 'clear' then 'cleared' else 'suspended' end, resolved_by = v_me, resolved_at = now(), note = v_reason
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'org.spam_' || p_action, 'organization', r.org_id::text, v_reason,
          jsonb_build_object('review', p_id, 'status', r.status),
          jsonb_build_object('review', p_id, 'status', case p_action when 'clear' then 'cleared' else 'suspended' end));
  if p_action = 'suspend' then
    perform private.decide_org(r.org_id, 'suspend', v_reason);
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Organisation verification documents (optional; accounts staff only)
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column registration_doc_path text check (registration_doc_path is null or registration_doc_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$'),
  add column registration_doc_bytes integer check (registration_doc_bytes is null or registration_doc_bytes between 1 and 5242880),
  add column registration_doc_at timestamptz,
  add constraint organizations_doc_complete check ((registration_doc_path is null) = (registration_doc_bytes is null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-documents', 'org-documents', false, 5242880, array['application/pdf', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- org-documents/{org_id}/{uuid}.pdf: an active admin of that organisation, at most 5 files.
create function private.org_doc_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$'
     and exists (select 1 from public.org_members m
                  where m.user_id = (select auth.uid()) and m.role = 'admin' and m.status = 'active'
                    and m.org_id::text = (storage.foldername(p_name))[1])
     and (select count(*) from storage.objects o
           where o.bucket_id = 'org-documents' and (storage.foldername(o.name))[1] = (storage.foldername(p_name))[1]) < 5;
$$;
revoke all on function private.org_doc_upload_allowed(text) from public;
grant execute on function private.org_doc_upload_allowed(text) to authenticated;

create function private.org_doc_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff('accounts')
      or exists (select 1 from public.org_members m
                  where m.user_id = (select auth.uid()) and m.role = 'admin' and m.status = 'active'
                    and m.org_id::text = (storage.foldername(p_name))[1]);
$$;
revoke all on function private.org_doc_readable(text) from public;
grant execute on function private.org_doc_readable(text) to authenticated;

create policy org_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'org-documents' and (select private.org_doc_readable(name)));
create policy org_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-documents' and (select private.org_doc_upload_allowed(name)));

create or replace function private.queue_storage_cleanup(p_bucket text, p_path text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.send('storage_cleanup', jsonb_build_object('bucket', p_bucket, 'path', p_path))
   where p_path is not null
     and p_bucket in ('post-media', 'chat-media', 'avatars', 'credentials', 'cv-exports', 'feedback',
                      'university-claims', 'university-media', 'org-documents');
$$;

-- An organisation admin attaches the uploaded document; the previous one is deleted.
create function private.submit_org_document(p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_org uuid;
  v_object storage.objects;
  v_old text;
begin
  select m.org_id into v_org from public.org_members m where m.user_id = v_me and m.role = 'admin' and m.status = 'active';
  if v_org is null then
    raise exception 'only an admin of the organisation can add its document' using errcode = '42501';
  end if;
  if p_path is null or p_path !~ ('^' || v_org::text || '/[0-9a-f-]{36}\.(pdf|webp)$') then
    raise exception 'upload the document again' using errcode = '22023';
  end if;
  select * into v_object from storage.objects o where o.bucket_id = 'org-documents' and o.name = p_path;
  if v_object.id is null then
    raise exception 'upload the document again' using errcode = 'P0002';
  end if;
  select registration_doc_path into v_old from public.organizations where id = v_org for update;
  update public.organizations
     set registration_doc_path = p_path,
         registration_doc_bytes = greatest(1, least(5242880, coalesce((v_object.metadata ->> 'size')::integer, 1))),
         registration_doc_at = now()
   where id = v_org;
  if v_old is not null and v_old <> p_path then
    perform private.queue_storage_cleanup('org-documents', v_old);
  end if;
end;
$$;

create function private.my_org_document()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('path', o.registration_doc_path, 'at', o.registration_doc_at, 'status', o.status)
    from public.organizations o
    join public.org_members m on m.org_id = o.id
   where m.user_id = (select auth.uid()) and m.role = 'admin' and m.status = 'active';
$$;

create function private.ops_org_document(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
begin
  return (select jsonb_build_object('path', o.registration_doc_path, 'bytes', o.registration_doc_bytes, 'at', o.registration_doc_at,
                                    'type', case when o.registration_doc_path like '%.pdf' then 'pdf' when o.registration_doc_path is not null then 'image' end)
            from public.organizations o where o.id = p_org);
end;
$$;

-- ---------------------------------------------------------------------------
-- Universities: list, record, owner assignment and staff-added domains
-- ---------------------------------------------------------------------------
create function private.ops_uni_list(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_q text := btrim(coalesce(p_query, ''));
  v_like text := '%' || replace(replace(replace(lower(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', u.id, 'name', u.name, 'city', u.city, 'slug', u.slug, 'onboarded', u.owner_id is not null,
             'owner_name', p.full_name, 'plan', private.uni_plan(u.id),
             'admins', (select count(*) from public.university_admins a where a.university_id = u.id),
             'students', (select count(*) from public.profiles s where s.university_id = u.id and s.role = 'student'))
             order by u.owner_id is null, u.name)
      from (select * from public.universities u
             where v_q = '' or lower(u.name) like v_like escape '\' or exists (
                   select 1 from public.university_domains d where d.university_id = u.id and d.domain like v_like escape '\')
             order by u.owner_id is null, u.name
             limit 50) u
      left join public.profiles p on p.user_id = u.owner_id), '[]'::jsonb);
end;
$$;

create function private.ops_uni_record(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  u public.universities;
begin
  select * into u from public.universities where id = p_id;
  if u.id is null then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', u.id, 'name', u.name, 'city', u.city, 'slug', u.slug, 'final_year_batch', u.final_year_batch,
    'claimed_at', u.claimed_at, 'plan', private.uni_plan(u.id),
    'owner', (select jsonb_build_object('user_id', p.user_id, 'name', p.full_name) from public.profiles p where p.user_id = u.owner_id),
    'domains', coalesce((select jsonb_agg(jsonb_build_object('domain', d.domain, 'kind', d.kind, 'source', d.source) order by d.domain)
                           from public.university_domains d where d.university_id = u.id), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', p.full_name, 'email', au.email, 'role', a.role,
                                                            'department', dp.name, 'since', a.created_at) order by a.role, p.full_name)
                          from public.university_admins a
                          join auth.users au on au.id = a.user_id
                          left join public.profiles p on p.user_id = a.user_id
                          left join public.departments dp on dp.id = a.department_id
                         where a.university_id = u.id), '[]'::jsonb),
    'invites', (select count(*) from public.university_admin_invites i
                 where i.university_id = u.id and i.used_at is null and i.revoked_at is null and i.expires_at > now()),
    'ecosphere', (select jsonb_build_object('modules', e.modules, 'branding', e.branding, 'welcome', e.welcome, 'updated_at', e.updated_at)
                    from public.ecosphere_config e where e.university_id = u.id),
    'exam_periods', coalesce((select jsonb_agg(jsonb_build_object('starts_on', x.starts_on, 'ends_on', x.ends_on, 'reason', x.reason) order by x.starts_on desc)
                                from (select * from public.exam_periods x where x.university_id = u.id order by x.starts_on desc limit 20) x), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'total', i.total, 'currency', i.currency,
                                                              'status', i.status, 'issued_at', i.issued_at) order by i.issued_at desc)
                            from (select * from public.invoices i where i.subject_type = 'university' and i.subject_id = u.id
                                   order by i.issued_at desc limit 20) i), '[]'::jsonb),
    'students', (select count(*) from public.profiles s where s.university_id = u.id and s.role = 'student'),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'created_at', c.created_at) order by c.created_at desc)
                          from public.university_claims c where c.university_id = u.id), '[]'::jsonb));
end;
$$;

-- Onboarding without a claim (a partner that signed an MoU with Skilient): an existing official
-- account at this university, with two-factor on, becomes the owner.
create function private.ops_assign_uni_owner(p_university uuid, p_email text, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_user uuid;
begin
  if char_length(v_reason) < 3 then
    raise exception 'give a reason (the MoU or agreement it rests on)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uni-claim:' || p_university::text, 0));
  if not exists (select 1 from public.universities where id = p_university) then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.universities u where u.id = p_university and u.owner_id is not null) then
    raise exception 'this university already has an owner (see the dispute procedure)' using errcode = '55000';
  end if;
  select u.id into v_user from auth.users u where u.email = lower(btrim(coalesce(p_email, '')));
  if v_user is null or not exists (select 1 from public.profiles p where p.user_id = v_user and p.role = 'university_admin'
                                     and p.university_id = p_university and p.status = 'active') then
    raise exception 'that email isn''t a university staff account at this university' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.mfa_factors f where f.user_id = v_user and f.status = 'verified') then
    raise exception 'that account has no two-factor set up' using errcode = '55000';
  end if;
  if exists (select 1 from public.university_admins a where a.user_id = v_user) then
    raise exception 'that account already has a portal seat' using errcode = '55000';
  end if;
  insert into public.university_admins (user_id, university_id, role, invited_by) values (v_user, p_university, 'owner', v_me);
  update public.universities set owner_id = v_user, claimed_at = now() where id = p_university;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'uni.owner_assign', 'university', p_university::text, v_reason,
          jsonb_build_object('owner_id', null), jsonb_build_object('owner_id', v_user));
  perform private.notify(v_user, null, 'uni_claim_decided', 'university', p_university,
                         jsonb_build_object('approved', true, 'reason', v_reason));
  return v_user;
end;
$$;

-- Staff add an email domain for a university (source 'ops'; the HEC sync never touches it).
create function private.ops_add_uni_domain(p_university uuid, p_domain text, p_kind text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_domain text := lower(btrim(coalesce(p_domain, '')));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('student', 'faculty', 'both') then
    raise exception 'choose who the domain is for' using errcode = '22023';
  end if;
  if v_domain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception 'that isn''t a domain' using errcode = '22023';
  end if;
  if exists (select 1 from public.personal_email_domains e where e.domain = v_domain) then
    raise exception 'public email domains can never be university domains' using errcode = '22023';
  end if;
  if exists (select 1 from public.university_domains d where d.domain = v_domain) then
    raise exception 'that domain already belongs to a university' using errcode = '23505';
  end if;
  insert into public.university_domains (university_id, domain, kind, source) values (p_university, v_domain, p_kind::public.domain_kind, 'ops');
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'uni.domain_add', 'university', p_university::text, btrim(p_reason), '{}'::jsonb,
          jsonb_build_object('domain', v_domain, 'kind', p_kind));
end;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (security invoker)
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
  'submit_org_document', 'my_org_document', 'ops_org_document', 'ops_uni_list', 'ops_uni_record', 'ops_assign_uni_owner', 'ops_add_uni_domain'
]);
drop function pg_temp.expose(text[]);
