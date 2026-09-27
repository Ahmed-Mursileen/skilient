-- Phase 2 slice 1: GitHub App connection (PRD 5.5 "Connect and identity binding" and
-- "Import pipeline", PRD 8 must-fix 2 and 3).
--
-- Identity is bound server-side. The browser only ever hands over GitHub's one-time OAuth
-- code, through a ticket written under its own auth.uid(); the github-link Edge Function
-- exchanges that code with GitHub and records the numeric GitHub id GitHub returns. No
-- function here accepts a user id or GitHub username from a signed-in user.
--
-- Tokens live in Vault and are read only by the Edge Functions (direct database
-- connection). Webhooks are stored once per delivery and queued in pgmq; pg_cron wakes the
-- github-worker Edge Function each minute while the queue has work.
--
-- Same pattern as the identity migration: public = SECURITY INVOKER; privileged work in
-- the unexposed `private` schema with a fixed search_path.

create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;

select pgmq.create('github_jobs');

-- ---------------------------------------------------------------------------
-- Accounts, tokens and installations
-- ---------------------------------------------------------------------------
create table public.github_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  github_id bigint not null unique check (github_id > 0),
  login text not null check (login ~ '^[A-Za-z0-9-]{1,39}$'),
  connected_at timestamptz not null default now(),
  -- Set when the student revokes Skilient on GitHub or a token refresh fails: evidence
  -- stays, syncing stops until they reconnect.
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.github_accounts is
  'One GitHub account per student, bound from the App callback by numeric GitHub id (PRD 5.5 P0).';
create trigger github_accounts_updated_at before update on public.github_accounts
  for each row execute function private.set_updated_at();

alter table public.github_accounts enable row level security;
revoke all on table public.github_accounts from anon, authenticated;
grant select on table public.github_accounts to authenticated;
-- The owner, and anyone who can read the owner's full profile (the profile's GitHub link).
-- The subquery runs under the viewer's own profiles RLS.
create policy github_accounts_read on public.github_accounts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.user_id = github_accounts.user_id)
  );

-- Vault secret ids for the student's user-to-server token. Never exposed.
create table private.github_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_secret_id uuid not null,
  access_expires_at timestamptz,
  refresh_secret_id uuid,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.github_tokens enable row level security;

-- Tokens waiting to be revoked at GitHub (disconnect, account deletion, relink).
create table private.github_revocations (
  id bigint generated always as identity primary key,
  access_secret_id uuid not null,
  refresh_secret_id uuid,
  created_at timestamptz not null default now()
);
alter table private.github_revocations enable row level security;

create table public.github_installations (
  installation_id bigint primary key check (installation_id > 0),
  account_id bigint not null check (account_id > 0),
  account_login text not null check (account_login ~ '^[A-Za-z0-9-]{1,39}$'),
  account_type text not null check (account_type in ('User', 'Organization')),
  repository_selection text not null default 'selected' check (repository_selection in ('all', 'selected')),
  suspended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger github_installations_updated_at before update on public.github_installations
  for each row execute function private.set_updated_at();

-- An installation (e.g. on a club's organisation) can serve several students.
create table public.github_user_installations (
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id bigint not null references public.github_installations (installation_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, installation_id)
);
create index github_user_installations_installation_idx on public.github_user_installations (installation_id);

alter table public.github_installations enable row level security;
alter table public.github_user_installations enable row level security;
revoke all on table public.github_installations, public.github_user_installations from anon, authenticated;
grant select on table public.github_installations, public.github_user_installations to authenticated;
create policy github_user_installations_read_own on public.github_user_installations
  for select to authenticated using (user_id = (select auth.uid()));
create policy github_installations_read_own on public.github_installations
  for select to authenticated
  using (exists (
    select 1 from public.github_user_installations ui
    where ui.installation_id = github_installations.installation_id and ui.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Repositories (discover + classify stages)
-- ---------------------------------------------------------------------------
create type public.github_repo_kind as enum ('owned', 'collaborator', 'fork', 'template');

-- Shared metadata: a team repository is one row however many students it serves.
create table public.github_repos (
  repo_id bigint primary key check (repo_id > 0),
  full_name text not null check (full_name ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$' and char_length(full_name) <= 140),
  owner_id bigint not null check (owner_id > 0),
  private boolean not null,
  fork boolean not null default false,
  parent_full_name text check (parent_full_name is null or char_length(parent_full_name) <= 140),
  template_full_name text check (template_full_name is null or char_length(template_full_name) <= 140),
  default_branch text check (default_branch is null or char_length(default_branch) <= 255),
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger github_repos_updated_at before update on public.github_repos
  for each row execute function private.set_updated_at();

create table public.github_user_repos (
  user_id uuid not null references auth.users (id) on delete cascade,
  repo_id bigint not null references public.github_repos (repo_id) on delete cascade,
  installation_id bigint not null references public.github_installations (installation_id) on delete cascade,
  kind public.github_repo_kind,          -- null until classified
  excluded boolean not null default false, -- the student's choice (Settings -> GitHub)
  discovered_at timestamptz not null default now(),
  classified_at timestamptz,
  last_synced_at timestamptz,
  primary key (user_id, repo_id)
);
create index github_user_repos_repo_idx on public.github_user_repos (repo_id);
create index github_user_repos_installation_idx on public.github_user_repos (installation_id);

alter table public.github_repos enable row level security;
alter table public.github_user_repos enable row level security;
revoke all on table public.github_repos, public.github_user_repos from anon, authenticated;
grant select on table public.github_repos, public.github_user_repos to authenticated;
grant update (excluded) on table public.github_user_repos to authenticated;
-- Owner-only: private repository names never reach anyone else (PRD 5.5).
create policy github_user_repos_read_own on public.github_user_repos
  for select to authenticated using (user_id = (select auth.uid()));
create policy github_user_repos_exclude_own on public.github_user_repos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy github_repos_read_own on public.github_repos
  for select to authenticated
  using (exists (
    select 1 from public.github_user_repos ur
    where ur.repo_id = github_repos.repo_id and ur.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Sync jobs (progress the student sees; errors only staff see)
-- ---------------------------------------------------------------------------
create type public.sync_status as enum ('queued', 'running', 'done', 'failed', 'cancelled');

create table public.sync_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  trigger text not null check (trigger in ('connect', 'resync', 'webhook', 'nightly')),
  status public.sync_status not null default 'queued',
  stage text check (stage is null or stage ~ '^[a-z_]{1,30}$'),
  repos_total integer not null default 0 check (repos_total >= 0),
  repos_done integer not null default 0 check (repos_done >= 0),
  commits_analysed integer not null default 0 check (commits_analysed >= 0),
  skills_found integer not null default 0 check (skills_found >= 0),
  error text check (error is null or char_length(error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_jobs_user_idx on public.sync_jobs (user_id, created_at desc);
create unique index sync_jobs_one_open_per_user on public.sync_jobs (user_id) where status in ('queued', 'running');
create trigger sync_jobs_updated_at before update on public.sync_jobs
  for each row execute function private.set_updated_at();

alter table public.sync_jobs enable row level security;
revoke all on table public.sync_jobs from anon, authenticated;
-- Every column but `error` (internal detail for admins).
grant select (id, user_id, trigger, status, stage, repos_total, repos_done, commits_analysed, skills_found,
              created_at, updated_at, finished_at) on table public.sync_jobs to authenticated;
create policy sync_jobs_read_own on public.sync_jobs
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Link tickets and clashes
-- ---------------------------------------------------------------------------
create table private.github_link_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text check (code is null or char_length(code) between 1 and 200), -- wiped once claimed
  installation_id bigint,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  result text check (result is null or result in ('linked', 'clash', 'other_account', 'failed'))
);
create index github_link_tickets_user_idx on private.github_link_tickets (user_id);
alter table private.github_link_tickets enable row level security;

create table public.github_link_clashes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  github_id bigint not null,
  github_login text not null,
  linked_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
comment on table public.github_link_clashes is
  'A GitHub account already linked to another student (PRD 5.5: goes to admin). Trust staff only.';
create index github_link_clashes_user_idx on public.github_link_clashes (user_id);
create index github_link_clashes_linked_user_idx on public.github_link_clashes (linked_user_id);
create index github_link_clashes_resolved_by_idx on public.github_link_clashes (resolved_by);
alter table public.github_link_clashes enable row level security;
revoke all on table public.github_link_clashes from anon, authenticated;
grant select on table public.github_link_clashes to authenticated;
create policy github_link_clashes_read_trust on public.github_link_clashes
  for select to authenticated using ((select private.is_staff('trust_reviewer')));

-- ---------------------------------------------------------------------------
-- Webhook deliveries
-- ---------------------------------------------------------------------------
create table private.github_webhook_events (
  delivery_id uuid primary key,
  event text not null check (event ~ '^[a-z_]{1,60}$'),
  action text check (action is null or action ~ '^[a-z_]{1,60}$'),
  installation_id bigint,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'), -- trimmed by the route
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index github_webhook_events_received_idx on private.github_webhook_events (received_at);
alter table private.github_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- Queue helpers
-- ---------------------------------------------------------------------------
create function private.enqueue_github(p_message jsonb, p_delay integer default 0)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.send(queue_name => 'github_jobs', msg => p_message, delay => greatest(p_delay, 0));
$$;
revoke all on function private.enqueue_github(jsonb, integer) from public;
grant execute on function private.enqueue_github(jsonb, integer) to service_role;

-- Opens a sync for the student (or returns the one already open) and queues discovery.
create function private.start_github_sync(p_user uuid, p_trigger text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job bigint;
begin
  select id into v_job from public.sync_jobs where user_id = p_user and status in ('queued', 'running');
  if v_job is not null then
    return v_job;
  end if;
  insert into public.sync_jobs (user_id, trigger, stage) values (p_user, p_trigger, 'discover')
  returning id into v_job;
  perform private.enqueue_github(jsonb_build_object('stage', 'discover', 'user_id', p_user, 'job_id', v_job));
  return v_job;
end;
$$;
revoke all on function private.start_github_sync(uuid, text) from public;

-- Token rows removed for any reason (disconnect, relink, account deletion) are revoked at
-- GitHub by the worker, which then deletes the Vault secrets.
create function private.github_tokens_revoke()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into private.github_revocations (access_secret_id, refresh_secret_id)
  values (old.access_secret_id, old.refresh_secret_id)
  returning id into v_id;
  perform private.enqueue_github(jsonb_build_object('stage', 'revoke', 'revocation_id', v_id));
  return old;
end;
$$;
revoke all on function private.github_tokens_revoke() from public;
create trigger github_tokens_revoke after delete on private.github_tokens
  for each row execute function private.github_tokens_revoke();

-- ---------------------------------------------------------------------------
-- Linking (called by the signed-in student, then by the github-link Edge Function)
-- ---------------------------------------------------------------------------
create function private.start_github_link(p_code text, p_installation_id bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_ticket uuid;
begin
  if v_user is null or not exists (select 1 from public.profiles where user_id = v_user) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{1,200}$' then
    raise exception 'invalid code' using errcode = '22023';
  end if;
  if not private.rate_limit('github_link:' || v_user::text, 10, interval '1 hour') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  delete from private.github_link_tickets where user_id = v_user and created_at < now() - interval '1 day';
  insert into private.github_link_tickets (user_id, code, installation_id)
  values (v_user, p_code, case when p_installation_id > 0 then p_installation_id end)
  returning id into v_ticket;
  return v_ticket;
end;
$$;
revoke all on function private.start_github_link(text, bigint) from public;
grant execute on function private.start_github_link(text, bigint) to authenticated;

create function public.start_github_link(p_code text, p_installation_id bigint default null)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.start_github_link(p_code, p_installation_id);
$$;
revoke all on function public.start_github_link(text, bigint) from public, anon;
grant execute on function public.start_github_link(text, bigint) to authenticated;

-- Claims a fresh ticket exactly once and hands its code to the Edge Function; the code is
-- wiped from the table as it's handed over.
create function private.claim_github_link_ticket(p_ticket uuid)
returns table (user_id uuid, code text, installation_id bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select t.id, t.code from private.github_link_tickets t
    where t.id = p_ticket and t.claimed_at is null and t.created_at > now() - interval '10 minutes'
    for update
  )
  update private.github_link_tickets t
     set claimed_at = now(), code = null
    from claimed c
   where t.id = c.id
  returning t.user_id, c.code, t.installation_id;
end;
$$;
revoke all on function private.claim_github_link_ticket(uuid) from public;

-- Writes a Vault secret, or replaces it in place.
create function private.put_secret(p_id uuid, p_secret text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_secret is null then
    if p_id is not null then
      delete from vault.secrets where id = p_id;
    end if;
    return null;
  end if;
  if p_id is null then
    return vault.create_secret(p_secret);
  end if;
  perform vault.update_secret(p_id, p_secret);
  return p_id;
end;
$$;
revoke all on function private.put_secret(uuid, text) from public;

-- Stores a fresh token pair for a student (link, or the worker's refresh).
create function private.store_github_tokens(
  p_user uuid,
  p_access_token text,
  p_access_expires_at timestamptz,
  p_refresh_token text,
  p_refresh_expires_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row private.github_tokens;
begin
  select * into v_row from private.github_tokens where user_id = p_user for update;
  if found then
    update private.github_tokens
       set access_secret_id = private.put_secret(v_row.access_secret_id, p_access_token),
           access_expires_at = p_access_expires_at,
           refresh_secret_id = private.put_secret(v_row.refresh_secret_id, p_refresh_token),
           refresh_expires_at = p_refresh_expires_at,
           updated_at = now()
     where user_id = p_user;
  else
    insert into private.github_tokens (user_id, access_secret_id, access_expires_at, refresh_secret_id, refresh_expires_at)
    values (p_user, private.put_secret(null, p_access_token), p_access_expires_at,
            private.put_secret(null, p_refresh_token), p_refresh_expires_at);
  end if;
end;
$$;
revoke all on function private.store_github_tokens(uuid, text, timestamptz, text, timestamptz) from public;

-- The installations GitHub lists for a student are authoritative: upsert them, and drop
-- the student's access (and repositories) through any installation no longer listed.
-- p_installations: [{id, account_id, account_login, account_type, repository_selection, suspended?}]
create function private.sync_user_installations(p_user uuid, p_installations jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
begin
  insert into public.github_installations
    (installation_id, account_id, account_login, account_type, repository_selection, suspended_at)
  select (i ->> 'id')::bigint, (i ->> 'account_id')::bigint, i ->> 'account_login', i ->> 'account_type',
         coalesce(i ->> 'repository_selection', 'selected'),
         case when coalesce((i ->> 'suspended')::boolean, false) then now() end
    from jsonb_array_elements(coalesce(p_installations, '[]'::jsonb)) i
  on conflict (installation_id) do update
    set account_login = excluded.account_login,
        repository_selection = excluded.repository_selection,
        suspended_at = case when excluded.suspended_at is null then null
                            else coalesce(public.github_installations.suspended_at, excluded.suspended_at) end,
        deleted_at = null;

  select coalesce(array_agg((i ->> 'id')::bigint), '{}') into v_ids
    from jsonb_array_elements(coalesce(p_installations, '[]'::jsonb)) i;
  insert into public.github_user_installations (user_id, installation_id)
  select p_user, id from unnest(v_ids) id
  on conflict do nothing;

  delete from public.github_user_repos
   where user_id = p_user and not (installation_id = any (v_ids));
  delete from public.github_user_installations
   where user_id = p_user and not (installation_id = any (v_ids));
  delete from public.github_repos r
   where not exists (select 1 from public.github_user_repos ur where ur.repo_id = r.repo_id);
end;
$$;
revoke all on function private.sync_user_installations(uuid, jsonb) from public;

-- The student revoked Skilient on GitHub, or the token can no longer be refreshed: keep
-- the link and the evidence, stop syncing until they reconnect.
create function private.mark_github_revoked(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.github_accounts set revoked_at = now() where user_id = p_user and revoked_at is null;
  delete from private.github_tokens where user_id = p_user;
  update public.sync_jobs set status = 'cancelled', finished_at = now()
   where user_id = p_user and status in ('queued', 'running');
end;
$$;
revoke all on function private.mark_github_revoked(uuid) from public;

-- After the worker has revoked a token at GitHub (or GitHub no longer knew it).
create function private.finish_github_revocation(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row private.github_revocations;
begin
  delete from private.github_revocations where id = p_id returning * into v_row;
  if found then
    delete from vault.secrets where id in (v_row.access_secret_id, v_row.refresh_secret_id);
  end if;
end;
$$;
revoke all on function private.finish_github_revocation(bigint) from public;

-- The GitHub side of the link, as GitHub itself reported it to the Edge Function.
-- p_installations: [{id, account_id, account_login, account_type, repository_selection}]
create function private.complete_github_link(
  p_ticket uuid,
  p_github_id bigint,
  p_login text,
  p_access_token text,
  p_access_expires_at timestamptz,
  p_refresh_token text,
  p_refresh_expires_at timestamptz,
  p_installations jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_existing uuid;
begin
  select t.user_id into v_user from private.github_link_tickets t
   where t.id = p_ticket and t.claimed_at > now() - interval '10 minutes' and t.result is null
   for update;
  if v_user is null then
    return 'expired';
  end if;

  select a.user_id into v_existing from public.github_accounts a where a.github_id = p_github_id;
  if v_existing is not null and v_existing <> v_user then
    insert into public.github_link_clashes (user_id, github_id, github_login, linked_user_id)
    values (v_user, p_github_id, p_login, v_existing);
    update private.github_link_tickets set result = 'clash' where id = p_ticket;
    return 'clash';
  end if;
  if exists (select 1 from public.github_accounts a where a.user_id = v_user and a.github_id <> p_github_id) then
    update private.github_link_tickets set result = 'other_account' where id = p_ticket;
    return 'other_account';
  end if;

  insert into public.github_accounts (user_id, github_id, login)
  values (v_user, p_github_id, p_login)
  on conflict (user_id) do update set login = excluded.login, revoked_at = null;

  perform private.store_github_tokens(v_user, p_access_token, p_access_expires_at, p_refresh_token, p_refresh_expires_at);

  perform private.sync_user_installations(v_user, p_installations);

  insert into public.security_events (user_id, kind, meta)
  values (v_user, 'github_connected', jsonb_build_object('login', p_login));
  perform private.start_github_sync(v_user, 'connect');
  update private.github_link_tickets set result = 'linked' where id = p_ticket;
  return 'linked';
end;
$$;
revoke all on function private.complete_github_link(uuid, bigint, text, text, timestamptz, text, timestamptz, jsonb) from public;

create function private.fail_github_link(p_ticket uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update private.github_link_tickets set result = 'failed' where id = p_ticket and result is null;
$$;
revoke all on function private.fail_github_link(uuid) from public;

-- ---------------------------------------------------------------------------
-- Student actions: resync, disconnect
-- ---------------------------------------------------------------------------
create function private.request_github_resync()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.github_accounts where user_id = v_user and revoked_at is null) then
    return false;
  end if;
  if not private.rate_limit('github_resync:' || v_user::text, 5, interval '1 hour') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  perform private.start_github_sync(v_user, 'resync');
  return true;
end;
$$;
revoke all on function private.request_github_resync() from public;
grant execute on function private.request_github_resync() to authenticated;

create function public.request_github_resync()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_github_resync();
$$;
revoke all on function public.request_github_resync() from public, anon;
grant execute on function public.request_github_resync() to authenticated;

-- Removes the link and the repository data behind it; the token is revoked at GitHub by
-- the worker (github_tokens_revoke). Evidence from teammates, teachers and code checks is
-- untouched (PRD 5.5).
create function private.remove_github_data(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.sync_jobs set status = 'cancelled', finished_at = now()
   where user_id = p_user and status in ('queued', 'running');
  delete from private.github_tokens where user_id = p_user;
  delete from public.github_user_repos where user_id = p_user;
  delete from public.github_user_installations where user_id = p_user;
  delete from public.github_accounts where user_id = p_user;
  -- Repository rows nobody else needs.
  delete from public.github_repos r
   where not exists (select 1 from public.github_user_repos ur where ur.repo_id = r.repo_id);
end;
$$;
revoke all on function private.remove_github_data(uuid) from public;

create function private.disconnect_github()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_login text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select login into v_login from public.github_accounts where user_id = v_user;
  if v_login is null then
    return false;
  end if;
  perform private.remove_github_data(v_user);
  insert into public.security_events (user_id, kind, meta)
  values (v_user, 'github_disconnected', jsonb_build_object('login', v_login));
  return true;
end;
$$;
revoke all on function private.disconnect_github() from public;
grant execute on function private.disconnect_github() to authenticated;

create function public.disconnect_github()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.disconnect_github();
$$;
revoke all on function public.disconnect_github() from public, anon;
grant execute on function public.disconnect_github() to authenticated;

alter table public.security_events drop constraint security_events_kind_check;
alter table public.security_events add constraint security_events_kind_check check (kind in (
  'signup', 'sign_in', 'sign_in_failed', 'account_locked', 'new_device', 'not_me',
  'password_reset_requested', 'password_changed', 'mfa_enrolled', 'mfa_unenrolled',
  'signed_out_everywhere', 'github_connected', 'github_disconnected'
));

-- ---------------------------------------------------------------------------
-- Webhooks: stored once per delivery (replays are no-ops), then queued
-- ---------------------------------------------------------------------------
create function private.record_github_webhook(
  p_delivery_id uuid,
  p_event text,
  p_action text,
  p_installation_id bigint,
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.github_webhook_events (delivery_id, event, action, installation_id, payload)
  values (p_delivery_id, p_event, p_action, p_installation_id, p_payload)
  on conflict (delivery_id) do nothing;
  if not found then
    return false;
  end if;
  perform private.enqueue_github(jsonb_build_object('stage', 'webhook', 'delivery_id', p_delivery_id));
  return true;
end;
$$;
revoke all on function private.record_github_webhook(uuid, text, text, bigint, jsonb) from public;
grant execute on function private.record_github_webhook(uuid, text, text, bigint, jsonb) to service_role;

-- Only the webhook route (service role, after checking GitHub's signature) calls this.
create function public.record_github_webhook(
  p_delivery_id uuid,
  p_event text,
  p_payload jsonb,
  p_action text default null,
  p_installation_id bigint default null
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_github_webhook(p_delivery_id, p_event, p_action, p_installation_id, p_payload);
$$;
revoke all on function public.record_github_webhook(uuid, text, jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.record_github_webhook(uuid, text, jsonb, text, bigint) to service_role;

-- Applies installation-level events in the database and returns follow-up work for the
-- worker: {"discover": [user ids]}. Commit and pull request events arrive with the
-- harvest stages (phase 2 slice 3); until then they're only marked processed.
create function private.process_github_webhook(p_delivery_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event private.github_webhook_events;
  v_installation bigint;
  v_discover uuid[] := '{}';
  v_user uuid;
begin
  select * into v_event from private.github_webhook_events where delivery_id = p_delivery_id for update;
  if not found or v_event.processed_at is not null then
    return '{}'::jsonb;
  end if;
  v_installation := coalesce(v_event.installation_id, (v_event.payload #>> '{installation,id}')::bigint);

  if v_event.event = 'installation' then
    if v_event.action = 'deleted' then
      update public.github_installations set deleted_at = now() where installation_id = v_installation;
      delete from public.github_user_repos where installation_id = v_installation;
      delete from public.github_user_installations where installation_id = v_installation;
      delete from public.github_repos r
       where not exists (select 1 from public.github_user_repos ur where ur.repo_id = r.repo_id);
    elsif v_event.action = 'suspend' then
      update public.github_installations set suspended_at = now() where installation_id = v_installation;
    elsif v_event.action = 'unsuspend' then
      update public.github_installations set suspended_at = null where installation_id = v_installation;
      select coalesce(array_agg(user_id), '{}') into v_discover
        from public.github_user_installations where installation_id = v_installation;
    end if;
  elsif v_event.event = 'installation_repositories' then
    delete from public.github_user_repos ur
     where ur.installation_id = v_installation
       and ur.repo_id in (select (r ->> 'id')::bigint from jsonb_array_elements(coalesce(v_event.payload -> 'repositories_removed', '[]')) r);
    delete from public.github_repos r
     where not exists (select 1 from public.github_user_repos ur where ur.repo_id = r.repo_id);
    update public.github_installations
       set repository_selection = coalesce(v_event.payload ->> 'repository_selection', repository_selection)
     where installation_id = v_installation;
    select coalesce(array_agg(user_id), '{}') into v_discover
      from public.github_user_installations where installation_id = v_installation;
  elsif v_event.event = 'github_app_authorization' and v_event.action = 'revoked' then
    select user_id into v_user from public.github_accounts
     where github_id = (v_event.payload #>> '{sender,id}')::bigint;
    if v_user is not null then
      perform private.mark_github_revoked(v_user);
    end if;
  end if;

  update private.github_webhook_events set processed_at = now() where delivery_id = p_delivery_id;
  return jsonb_build_object('discover', to_jsonb(v_discover));
end;
$$;
revoke all on function private.process_github_webhook(uuid) from public;

-- ---------------------------------------------------------------------------
-- Discover and classify (called by the worker)
-- ---------------------------------------------------------------------------
-- p_repos: [{id, full_name, owner_id, private, fork, default_branch, pushed_at}] for one
-- installation, as GitHub lists them for this user. Returns the repo ids to classify.
create function private.upsert_discovered_repos(p_user uuid, p_installation_id bigint, p_repos jsonb)
returns bigint[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
  v_classify bigint[];
begin
  select coalesce(array_agg((r ->> 'id')::bigint), '{}') into v_ids from jsonb_array_elements(p_repos) r;

  insert into public.github_repos (repo_id, full_name, owner_id, private, fork, default_branch, pushed_at)
  select (r ->> 'id')::bigint, r ->> 'full_name', (r ->> 'owner_id')::bigint, (r ->> 'private')::boolean,
         coalesce((r ->> 'fork')::boolean, false), r ->> 'default_branch', (r ->> 'pushed_at')::timestamptz
    from jsonb_array_elements(p_repos) r
  on conflict (repo_id) do update
    set full_name = excluded.full_name,
        owner_id = excluded.owner_id,
        private = excluded.private,
        fork = excluded.fork,
        default_branch = excluded.default_branch,
        pushed_at = excluded.pushed_at;

  insert into public.github_user_repos (user_id, repo_id, installation_id)
  select p_user, id, p_installation_id from unnest(v_ids) id
  on conflict (user_id, repo_id) do update set installation_id = excluded.installation_id;

  delete from public.github_user_repos ur
   where ur.user_id = p_user and ur.installation_id = p_installation_id and not (ur.repo_id = any (v_ids));

  select coalesce(array_agg(ur.repo_id), '{}') into v_classify
    from public.github_user_repos ur
   where ur.user_id = p_user and ur.repo_id = any (v_ids) and not ur.excluded;
  return v_classify;
end;
$$;
revoke all on function private.upsert_discovered_repos(uuid, bigint, jsonb) from public;

create function private.classify_repo(
  p_user uuid,
  p_repo_id bigint,
  p_github_owner_id bigint,
  p_fork boolean,
  p_parent_full_name text,
  p_template_full_name text
)
returns public.github_repo_kind
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_github_id bigint;
  v_kind public.github_repo_kind;
begin
  select github_id into v_github_id from public.github_accounts where user_id = p_user;
  v_kind := case
    when p_fork then 'fork'
    when p_template_full_name is not null then 'template'
    when p_github_owner_id = v_github_id then 'owned'
    else 'collaborator'
  end;
  update public.github_repos
     set fork = p_fork, parent_full_name = p_parent_full_name, template_full_name = p_template_full_name
   where repo_id = p_repo_id;
  update public.github_user_repos
     set kind = v_kind, classified_at = now()
   where user_id = p_user and repo_id = p_repo_id;
  return v_kind;
end;
$$;
revoke all on function private.classify_repo(uuid, bigint, bigint, boolean, text, text) from public;

-- Progress for the student's open sync. p_stage null = leave as is.
create function private.update_sync_job(
  p_job bigint,
  p_stage text default null,
  p_repos_total integer default null,
  p_repos_done_increment integer default 0,
  p_finish public.sync_status default null,
  p_error text default null
)
returns public.sync_jobs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.sync_jobs;
begin
  update public.sync_jobs
     set stage = coalesce(p_stage, stage),
         status = case when p_finish is not null then p_finish when status = 'queued' then 'running' else status end,
         repos_total = coalesce(p_repos_total, repos_total),
         repos_done = least(repos_done + p_repos_done_increment, coalesce(p_repos_total, repos_total)),
         error = coalesce(left(p_error, 2000), error),
         finished_at = case when p_finish is not null then now() else finished_at end
   where id = p_job and status in ('queued', 'running')
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function private.update_sync_job(bigint, text, integer, integer, public.sync_status, text) from public;

-- ---------------------------------------------------------------------------
-- Waking the worker, and housekeeping
-- ---------------------------------------------------------------------------
-- The worker's bearer secret is generated here, never stored in the repo. The Edge
-- Function reads it back through its database connection.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'github_worker_secret',
  'Bearer secret pg_cron uses to wake the github-worker Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'github_worker_secret');

-- Needs a Vault secret `project_url` (https://<ref>.supabase.co), set once in the
-- dashboard; without it (local, CI) this is a no-op.
create function private.wake_github_worker()
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
  if not exists (select 1 from pgmq.q_github_jobs where vt <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'github_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/github-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function private.wake_github_worker() from public;

select cron.schedule('github-worker', '* * * * *', $$select private.wake_github_worker()$$);

-- Webhook payloads are kept 30 days (PRD 10: logs 30 days); spent link tickets a day.
create function private.purge_github_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_rows integer := 0;
  v_n integer;
begin
  v_run := public.job_run_start('purge-github-data');
  begin
    delete from private.github_webhook_events where received_at < now() - interval '30 days';
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
    delete from private.github_link_tickets where created_at < now() - interval '1 day';
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_rows);
end;
$$;
revoke all on function private.purge_github_data() from public;

select cron.schedule('purge-github-data', '37 3 * * *', $$select private.purge_github_data()$$);
