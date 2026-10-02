-- Phase 11, slice 3 (PRD 5.26): users, view-as and the staff two-factor reset.
--
-- Users: any staff role searches by name, username, email or GitHub login/id and reads a
-- read-only record. Trust reviewers force a GitHub re-sync or recompute skills (audited).
-- View as user: read-only, logged (a session per view, each page recorded) and the user is
-- told; never chats (no chat table is read, and chat notifications are left out).
-- Reset two-factor: super admins only, with an identity-check note; audited; the app emails the user.

insert into public.notification_types (type, category, emailed) values
  ('account_viewed', 'account', true),
  -- The app sends the security email itself (outside the notification email cap).
  ('mfa_reset', 'account', false);

-- ---------------------------------------------------------------------------
-- Users: search and record
-- ---------------------------------------------------------------------------
create function private.ops_user_search(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_like text;
begin
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  v_like := '%' || replace(replace(replace(ltrim(v_q, '@'), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(x.doc order by x.rank, x.name) from (
      select distinct on (u.id) u.id,
             case when u.email = v_q or p.username = ltrim(v_q, '@') or g.login ilike ltrim(v_q, '@') or g.github_id::text = v_q then 0 else 1 end as rank,
             p.full_name as name,
             jsonb_build_object('user_id', u.id, 'name', p.full_name, 'username', p.username, 'email', u.email, 'role', p.role,
                                'university', un.name, 'status', p.status, 'github_login', g.login,
                                'restriction', (private.active_restriction(u.id)).kind, 'created_at', u.created_at) as doc
        from auth.users u
        join public.profiles p on p.user_id = u.id
        left join public.universities un on un.id = p.university_id
        left join public.github_accounts g on g.user_id = u.id
       where u.email = v_q or u.email like v_like escape '\'
          or p.username = ltrim(v_q, '@') or lower(p.full_name) like v_like escape '\'
          or g.login ilike ltrim(v_q, '@') or g.github_id::text = v_q
       order by u.id
       limit 50) x), '[]'::jsonb);
end;
$$;

create function private.ops_user_record(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  u auth.users;
  p public.profiles;
begin
  select * into u from auth.users where id = p_user;
  select * into p from public.profiles where user_id = p_user;
  if u.id is null or p.user_id is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'user_id', u.id, 'is_me', u.id = v_me,
    'account', jsonb_build_object(
      'email', u.email, 'name', p.full_name, 'username', p.username, 'role', p.role, 'status', p.status,
      'university', (select un.name from public.universities un where un.id = p.university_id),
      'department', p.department, 'graduation_year', p.graduation_year, 'visibility', p.visibility,
      'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at, 'email_confirmed', u.email_confirmed_at is not null,
      'banned_until', u.banned_until, 'delete_after', p.delete_after,
      'two_factor', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
      'backup_codes', (select count(*) from private.mfa_backup_codes b where b.user_id = u.id and b.used_at is null),
      'staff_roles', private.staff_roles_of(u.id)),
    'github', (select jsonb_build_object('login', g.login, 'github_id', g.github_id, 'connected_at', g.connected_at, 'revoked_at', g.revoked_at,
                                         'last_sync', (select jsonb_build_object('status', j.status, 'trigger', j.trigger, 'created_at', j.created_at,
                                                                                 'finished_at', j.finished_at, 'error', j.error)
                                                         from public.sync_jobs j where j.user_id = g.user_id order by j.created_at desc limit 1))
                 from public.github_accounts g where g.user_id = u.id),
    'score', (select jsonb_build_object('total', s.total, 'tier', s.tier, 'ranked', s.ranked, 'percentile', s.percentile, 'held', s.held,
                                        'proof', s.proof, 'momentum', s.momentum, 'adjustments', s.adjustments, 'components', s.components,
                                        'computed_at', s.computed_at, 'formula_version', s.formula_version)
                from public.ranking_scores s where s.user_id = u.id),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', k.name, 'level', us.level, 'repos', us.repos, 'last_used_at', us.last_used_at)
                                         order by us.level desc, k.name)
                          from public.user_skills us join public.skills k on k.id = us.skill_id where us.user_id = u.id and us.level > 0), '[]'::jsonb),
    'credentials', coalesce((select jsonb_object_agg(x.status, x.n) from (select c.status::text as status, count(*) as n from public.credentials c where c.user_id = u.id group by c.status) x), '{}'::jsonb),
    'code_checks', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'skill', k.name, 'status', c.status, 'requested_at', c.requested_at) order by c.requested_at desc)
                               from (select * from public.code_checks c where c.user_id = u.id order by c.requested_at desc limit 10) c
                               join public.skills k on k.id = c.skill_id), '[]'::jsonb),
    'cvs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'version', r.version, 'issued_at', r.issued_at,
                                                         'revoked_at', r.revoked_at, 'revoked_reason', r.revoked_reason) order by r.issued_at desc)
                       from (select * from public.cv_records r where r.user_id = u.id order by r.issued_at desc limit 20) r), '[]'::jsonb),
    'sanctions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'until', s.until, 'reason', s.reason, 'created_at', s.created_at,
                                                               'lifted_at', s.lifted_at, 'staff_name', sp.full_name) order by s.created_at desc)
                             from public.sanctions s left join public.profiles sp on sp.user_id = s.staff_id where s.user_id = u.id), '[]'::jsonb),
    'restriction', private.sanction_json(private.active_restriction(u.id)),
    'appeals', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'type', a.decision_type, 'status', a.status, 'created_at', a.created_at) order by a.created_at desc)
                           from public.appeals a where a.appellant_id = u.id), '[]'::jsonb),
    -- Ban-evasion hints: the same GitHub account tried on another Skilient account, or the same
    -- email name at another domain on a restricted or deleting account.
    'hints', coalesce((select jsonb_agg(h.doc) from (
        select jsonb_build_object('user_id', o.id, 'name', op.full_name, 'why', 'same GitHub account',
                                  'restriction', (private.active_restriction(o.id)).kind) as doc
          from public.github_link_clashes c
          join auth.users o on o.id = case when c.user_id = u.id then c.linked_user_id else c.user_id end
          left join public.profiles op on op.user_id = o.id
         where (c.user_id = u.id or c.linked_user_id = u.id) and o.id <> u.id
        union
        select jsonb_build_object('user_id', o.id, 'name', op.full_name, 'why', 'same email name at ' || split_part(o.email, '@', 2),
                                  'restriction', (private.active_restriction(o.id)).kind)
          from auth.users o
          left join public.profiles op on op.user_id = o.id
         where o.id <> u.id and split_part(o.email, '@', 1) = split_part(u.email, '@', 1)
           and ((private.active_restriction(o.id)).id is not null or o.banned_until > now() or op.status = 'deleting')
        limit 20) h), '[]'::jsonb));
end;
$$;

-- Trust reviewers: queue a GitHub re-sync (the student's own button is rate-limited; this isn't).
create function private.ops_github_resync(p_user uuid, p_reason text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  v_job bigint;
  v_before jsonb;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if not exists (select 1 from public.github_accounts g where g.user_id = p_user and g.revoked_at is null) then
    raise exception 'this account has no connected GitHub' using errcode = '55000';
  end if;
  select jsonb_build_object('job', j.id, 'status', j.status) into v_before
    from public.sync_jobs j where j.user_id = p_user order by j.created_at desc limit 1;
  v_job := private.start_github_sync(p_user, 'resync');
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'user.github_resync', 'user', p_user::text, btrim(p_reason), coalesce(v_before, '{}'::jsonb),
          jsonb_build_object('job', v_job, 'status', (select status from public.sync_jobs where id = v_job)));
  return v_job;
end;
$$;

-- Trust reviewers: recompute the student's skill levels now; the score follows at the next nightly run.
create function private.ops_recompute_skills(p_user uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  v_before jsonb;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  v_before := coalesce((select jsonb_object_agg(us.skill_id, us.level) from public.user_skills us where us.user_id = p_user), '{}'::jsonb);
  perform private.recompute_user_skills(p_user);
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'user.recompute_skills', 'user', p_user::text, btrim(p_reason), jsonb_build_object('levels', v_before),
          jsonb_build_object('levels', coalesce((select jsonb_object_agg(us.skill_id, us.level) from public.user_skills us where us.user_id = p_user), '{}'::jsonb)));
end;
$$;

-- ---------------------------------------------------------------------------
-- View as user
-- ---------------------------------------------------------------------------
create table public.ops_view_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  pages text[] not null default '{}',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  check (expires_at > started_at),
  check (staff_id <> user_id)
);
comment on table public.ops_view_sessions is
  'Read-only "view as user" sessions (PRD 5.26): who looked, why, which pages. Written only by functions; staff read through the audit log.';
create index ops_view_sessions_staff_idx on public.ops_view_sessions (staff_id, user_id, expires_at desc);
create index ops_view_sessions_user_idx on public.ops_view_sessions (user_id, started_at desc);
alter table public.ops_view_sessions enable row level security;
revoke all on table public.ops_view_sessions from anon, authenticated;

create function private.ops_view_as_start(p_user uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'give a reason (the user reads it)' using errcode = '22023';
  end if;
  if p_user = v_me then
    raise exception 'you can''t view your own account as a user here' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  insert into public.ops_view_sessions (staff_id, user_id, reason) values (v_me, p_user, v_reason) returning id into v_id;
  perform private.notify(p_user, null, 'account_viewed', 'ops_view', v_id,
                         jsonb_build_object('reason', v_reason, 'viewed_at', now()));
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'view_as.start', 'user', p_user::text, v_reason, null,
          jsonb_build_object('session', v_id, 'expires_at', now() + interval '1 hour'));
  return v_id;
end;
$$;

-- One page of the user's account as they see it, read-only. Needs a view session this staff
-- member started for this user in the last hour; each page is recorded on the session. No page
-- reads a chat, and chat notifications are left out.
create function private.ops_view_as_page(p_user uuid, p_page text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  v_session uuid;
  p public.profiles;
  v_doc jsonb;
begin
  if p_page not in ('profile', 'me', 'cv', 'opportunities', 'privacy', 'notifications') then
    raise exception 'that page isn''t available in view-as' using errcode = '22023';
  end if;
  select s.id into v_session from public.ops_view_sessions s
   where s.staff_id = v_me and s.user_id = p_user and s.expires_at > now()
   order by s.started_at desc limit 1
   for update;
  if v_session is null then
    raise exception 'start a view first, with a reason' using errcode = '42501';
  end if;
  update public.ops_view_sessions set pages = array_append(pages, p_page) where id = v_session;
  select * into p from public.profiles where user_id = p_user;

  if p_page = 'profile' then
    v_doc := jsonb_build_object(
      'name', p.full_name, 'username', p.username, 'bio', p.bio, 'department', p.department, 'programme', p.programme,
      'graduation_year', p.graduation_year, 'visibility', p.visibility, 'looking_for', p.looking_for,
      'university', (select un.name from public.universities un where un.id = p.university_id),
      'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', k.name, 'level', us.level) order by us.level desc, k.name)
                            from public.user_skills us join public.skills k on k.id = us.skill_id where us.user_id = p_user and us.level > 0), '[]'::jsonb),
      'ventures', coalesce((select jsonb_agg(jsonb_build_object('title', v.title, 'role', m.team_role, 'visibility', v.visibility) order by m.joined_at desc)
                              from public.venture_members m join public.ventures v on v.id = m.venture_id where m.user_id = p_user), '[]'::jsonb),
      'endorsements', (select count(*) from public.endorsements e where e.endorsee_id = p_user));
  elsif p_page = 'me' then
    v_doc := jsonb_build_object(
      'score', (select jsonb_build_object('total', s.total, 'tier', s.tier, 'ranked', s.ranked, 'percentile', s.percentile,
                                          'proof', s.proof, 'momentum', s.momentum, 'adjustments', s.adjustments, 'held', s.held)
                  from public.ranking_scores s where s.user_id = p_user),
      'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', k.name, 'level', us.level, 'repos', us.repos) order by us.level desc, k.name)
                            from public.user_skills us join public.skills k on k.id = us.skill_id where us.user_id = p_user and us.level > 0), '[]'::jsonb),
      'work', coalesce((select jsonb_agg(jsonb_build_object('title', v.title, 'role', m.team_role, 'joined_at', m.joined_at) order by m.joined_at desc)
                          from public.venture_members m join public.ventures v on v.id = m.venture_id where m.user_id = p_user), '[]'::jsonb));
  elsif p_page = 'cv' then
    v_doc := jsonb_build_object(
      'settings', (select jsonb_build_object('visibility', c.visibility, 'sections', c.sections, 'show_email', c.show_email)
                     from public.cv_settings c where c.user_id = p_user),
      'records', coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'version', r.version, 'issued_at', r.issued_at,
                                                               'expires_at', r.expires_at, 'revoked_at', r.revoked_at, 'revoked_reason', r.revoked_reason)
                                            order by r.issued_at desc)
                             from public.cv_records r where r.user_id = p_user), '[]'::jsonb));
  elsif p_page = 'opportunities' then
    v_doc := jsonb_build_object(
      'applications', coalesce((select jsonb_agg(jsonb_build_object('job', j.title, 'org', o.name, 'stage', a.stage, 'applied_at', a.applied_at)
                                                 order by a.applied_at desc)
                                  from public.job_applications a join public.job_posts j on j.id = a.job_id join public.organizations o on o.id = j.org_id
                                 where a.student_id = p_user), '[]'::jsonb),
      'contact_requests', coalesce((select jsonb_agg(jsonb_build_object('org', o.name, 'role_title', c.role_title, 'status', c.status, 'created_at', c.created_at)
                                                     order by c.created_at desc)
                                      from public.contact_requests c join public.organizations o on o.id = c.org_id where c.student_id = p_user), '[]'::jsonb));
  elsif p_page = 'privacy' then
    v_doc := jsonb_build_object(
      'visibility', p.visibility, 'recruiter_visible', p.recruiter_visible, 'leaderboard_opt_out', p.leaderboard_opt_out,
      'chat_read_receipts', p.chat_read_receipts,
      'cv_visibility', (select c.visibility from public.cv_settings c where c.user_id = p_user),
      'blocked_companies', (select count(*) from public.company_blocks b where b.student_id = p_user));
  else
    v_doc := jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'entity_type', n.entity_type, 'entity_id', n.entity_id,
                                                             'data', n.data, 'created_at', n.created_at, 'read', n.read_at is not null)
                                          order by n.created_at desc)
                           from (select * from public.notifications n
                                  where n.user_id = p_user and n.type not like 'chat%' and n.entity_type is distinct from 'chat_thread'
                                  order by n.created_at desc limit 30) n), '[]'::jsonb));
  end if;
  return jsonb_build_object('page', p_page, 'session', v_session, 'name', p.full_name, 'doc', v_doc);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reset two-factor (super admin, last resort)
-- ---------------------------------------------------------------------------
-- Removes every authenticator and backup code and signs the account out everywhere; the next
-- sign-in has no second step, and portals that need two-factor send them to set it up again.
-- Returns the account's email for the app's security email.
create function private.ops_reset_mfa(p_user uuid, p_identity_note text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_super_admin();
  v_note text := btrim(coalesce(p_identity_note, ''));
  v_email text;
  v_factors integer;
  v_codes integer;
  v_sessions integer;
begin
  if char_length(v_note) < 20 then
    raise exception 'write down how you checked who they are (at least 20 characters)' using errcode = '22023';
  end if;
  if p_user = v_me then
    raise exception 'you can''t reset your own two-factor here' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = p_user for update;
  if v_email is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  select count(*) into v_factors from auth.mfa_factors where user_id = p_user;
  select count(*) into v_codes from private.mfa_backup_codes where user_id = p_user and used_at is null;
  if v_factors = 0 and v_codes = 0 then
    raise exception 'this account has no two-factor to reset' using errcode = '55000';
  end if;
  delete from auth.mfa_factors where user_id = p_user;
  delete from private.mfa_backup_codes where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_sessions = row_count;
  perform private.notify(p_user, null, 'mfa_reset', 'user', p_user, jsonb_build_object('reset_at', now()));
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'user.mfa_reset', 'user', p_user::text, v_note,
          jsonb_build_object('factors', v_factors, 'backup_codes', v_codes),
          jsonb_build_object('factors', 0, 'backup_codes', 0, 'sessions_ended', v_sessions));
  return v_email;
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
  'ops_user_search', 'ops_user_record', 'ops_github_resync', 'ops_recompute_skills', 'ops_view_as_start', 'ops_view_as_page', 'ops_reset_mfa'
]);
drop function pg_temp.expose(text[]);
