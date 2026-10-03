-- Product analytics outbox (PRD 10 "Product analytics (PostHog)"; phase 13 slice 1, questions file Q1).
-- Server-side events are written here, in the same transaction as the change they describe, by
-- triggers on the tables where the change happens: a server action, a job, a webhook or the API all
-- produce the same event, and nothing waits on PostHog in a request. private.track() puts one message
-- on pgmq `analytics`; the analytics-worker Edge Function (woken each minute) sends batches to
-- PostHog EU. Properties are ids, enums, counts and booleans only: never names, emails, usernames or
-- content. `distinct_id` is the internal user uuid, the same one the browser identifies with.
-- Deleting an account queues the deletion of the person, their events and their recordings.

select pgmq.create('analytics');

-- ---------------------------------------------------------------------------
-- Config: events staff can mute from /ops/config if the free quota runs short (Q6)
-- ---------------------------------------------------------------------------
insert into public.platform_config (key, version, value, reason) values
  ('analytics.muted_events', 1, '[]',
   'PRD 10: PostHog stays on the free tier. Staff mute a noisy event here instead of deploying.');
insert into public.config_keys (key, area, description, applies, schema) values
  ('analytics.muted_events', 'analytics',
   'Server-side analytics events the worker drops instead of sending to PostHog (to stay inside the free event quota).',
   'now',
   '{"type": "array", "uniqueItems": true, "maxItems": 50, "items": {"type": "string", "pattern": "^[a-z][a-z0-9_]{2,40}$"}}');

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------
-- "First time" events (first L2 skill, GitHub connected, each onboarding step) fire once per user,
-- however often the underlying row changes.
create table private.analytics_once (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{2,60}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);
comment on table private.analytics_once is 'Which once-per-user analytics events have been sent (PRD 10). Written only by private.track_once().';
alter table private.analytics_once enable row level security;
revoke all on table private.analytics_once from public, anon, authenticated;

create function private.track(
  p_user uuid,
  p_event text,
  p_props jsonb default '{}'::jsonb,
  p_set jsonb default null,
  p_set_once jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    return;
  end if;
  if p_event !~ '^(\$set|[a-z][a-z0-9_]{2,40})$' then
    raise exception 'bad analytics event name %', p_event using errcode = '22023';
  end if;
  perform pgmq.send('analytics', jsonb_strip_nulls(jsonb_build_object(
    'kind', 'capture',
    'uuid', gen_random_uuid(),
    'event', p_event,
    'distinct_id', p_user,
    'at', clock_timestamp(),
    'props', coalesce(p_props, '{}'::jsonb),
    'set', p_set,
    'set_once', p_set_once
  )));
end;
$$;

create function private.track_once(
  p_user uuid,
  p_once text,
  p_event text,
  p_props jsonb default '{}'::jsonb,
  p_set jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    return;
  end if;
  insert into private.analytics_once (user_id, name) values (p_user, p_once) on conflict do nothing;
  if found then
    perform private.track(p_user, p_event, p_props, p_set);
  end if;
end;
$$;
revoke all on function private.track(uuid, text, jsonb, jsonb, jsonb) from public;
revoke all on function private.track_once(uuid, text, text, jsonb, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Signup funnel and onboarding
-- ---------------------------------------------------------------------------
create function private.analytics_profile_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.user_id, 'account_created', jsonb_build_object('role', new.role),
    jsonb_strip_nulls(jsonb_build_object('role', new.role, 'university_id', new.university_id)),
    jsonb_build_object('signup_week', to_char(new.created_at at time zone 'Asia/Karachi', 'IYYY-"W"IW')));
  return null;
end;
$$;
create trigger profiles_analytics_created after insert on public.profiles
  for each row execute function private.analytics_profile_created();

-- University and role are person properties, so every dashboard can be filtered by university.
create function private.analytics_profile_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.user_id, '$set', '{}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object('role', new.role, 'university_id', new.university_id)));
  return null;
end;
$$;
create trigger profiles_analytics_changed after update of university_id, role on public.profiles
  for each row when (old.university_id is distinct from new.university_id or old.role is distinct from new.role)
  execute function private.analytics_profile_changed();

create function private.analytics_email_verified()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track_once(new.id, 'email_verified', 'email_verified');
  return null;
end;
$$;
-- Google sign-in arrives already confirmed; a code confirms it later.
create trigger analytics_email_verified_insert after insert on auth.users
  for each row when (new.email_confirmed_at is not null) execute function private.analytics_email_verified();
create trigger analytics_email_verified_update after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.analytics_email_verified();

create function private.analytics_agreement_accepted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Only the first acceptance is a funnel step; later versions are re-acceptances.
  perform private.track_once(new.user_id, 'agreement_accepted', 'agreement_accepted', jsonb_build_object('version', new.version));
  return null;
end;
$$;
create trigger agreement_acceptances_analytics after insert on public.agreement_acceptances
  for each row execute function private.analytics_agreement_accepted();

create function private.analytics_onboarding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.step > old.step then
    perform private.track_once(new.user_id, 'onboarding_step_' || new.step, 'onboarding_step',
      jsonb_build_object('step', new.step, 'role', new.role));
  end if;
  if old.completed_at is null and new.completed_at is not null then
    perform private.track_once(new.user_id, 'onboarding_completed', 'onboarding_completed', jsonb_build_object('role', new.role));
  end if;
  return null;
end;
$$;
create trigger onboarding_state_analytics after update of step, completed_at on public.onboarding_state
  for each row when (new.step > old.step or (old.completed_at is null and new.completed_at is not null))
  execute function private.analytics_onboarding();

create function private.analytics_tour()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.completed_at is null and new.completed_at is not null then
    perform private.track(new.user_id, 'tour_completed', jsonb_build_object('tour', new.tour_id));
  elsif old.skipped_at is null and new.skipped_at is not null then
    perform private.track(new.user_id, 'tour_skipped', jsonb_build_object('tour', new.tour_id, 'step', new.step));
  end if;
  return null;
end;
$$;
create trigger tour_progress_analytics after update of completed_at, skipped_at on public.tour_progress
  for each row when ((old.completed_at is null and new.completed_at is not null) or (old.skipped_at is null and new.skipped_at is not null))
  execute function private.analytics_tour();

-- ---------------------------------------------------------------------------
-- Proof: GitHub, skills, contributions, CV
-- ---------------------------------------------------------------------------
create function private.analytics_github_connected()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track_once(new.user_id, 'github_connected', 'github_connected');
  return null;
end;
$$;
create trigger github_accounts_analytics after insert on public.github_accounts
  for each row execute function private.analytics_github_connected();

create function private.analytics_first_l2()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track_once(new.user_id, 'first_l2_skill', 'first_l2_skill', jsonb_build_object('level', new.level));
  return null;
end;
$$;
create trigger user_skills_analytics_insert after insert on public.user_skills
  for each row when (new.level >= 2) execute function private.analytics_first_l2();
create trigger user_skills_analytics_update after update of level on public.user_skills
  for each row when (new.level >= 2 and old.level < 2) execute function private.analytics_first_l2();

create function private.analytics_contribution()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.user_id, 'contribution_logged', jsonb_build_object('kind', new.kind));
  return null;
end;
$$;
-- Imported commits arrive by the hundred; only contributions a person logs count as the event.
create trigger contributions_analytics after insert on public.contributions
  for each row when (new.source = 'manual' and new.corrects_id is null) execute function private.analytics_contribution();

create function private.analytics_cv_exported()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.user_id, 'cv_exported', jsonb_build_object('template', new.template));
  return null;
end;
$$;
create trigger cv_pdf_exports_analytics after insert on public.cv_pdf_exports
  for each row execute function private.analytics_cv_exported();

-- Tier is a person property (filterable), set when it changes.
create function private.analytics_tier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.user_id, '$set', '{}'::jsonb, jsonb_build_object('tier', new.tier));
  return null;
end;
$$;
create trigger ranking_scores_analytics_insert after insert on public.ranking_scores
  for each row when (new.tier is not null) execute function private.analytics_tier();
create trigger ranking_scores_analytics_update after update of tier on public.ranking_scores
  for each row when (new.tier is distinct from old.tier and new.tier is not null) execute function private.analytics_tier();

-- ---------------------------------------------------------------------------
-- Social: posts, survey, comments, chat, feedback
-- ---------------------------------------------------------------------------
create function private.analytics_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.author_id, 'post_created', jsonb_build_object('type', new.type, 'audience', new.audience));
  return null;
end;
$$;
create trigger posts_analytics after insert on public.posts
  for each row execute function private.analytics_post();

create function private.analytics_survey()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.user_id, 'survey_answered', jsonb_build_object('dimension', new.dimension));
  return null;
end;
$$;
create trigger micro_survey_responses_analytics after insert on public.micro_survey_responses
  for each row execute function private.analytics_survey();

create function private.analytics_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.author_id, 'comment_added', jsonb_build_object('reply', new.parent_id is not null));
  return null;
end;
$$;
create trigger post_comments_analytics after insert on public.post_comments
  for each row execute function private.analytics_comment();

create function private.analytics_chat_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.sender_id, 'chat_message_sent', jsonb_build_object(
    'thread_type', (select t.type from public.chat_threads t where t.id = new.thread_id),
    'image', new.media_path is not null));
  return null;
end;
$$;
create trigger chat_messages_analytics after insert on public.chat_messages
  for each row execute function private.analytics_chat_message();

create function private.analytics_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.user_id, 'feedback_sent', jsonb_build_object('type', new.type));
  return null;
end;
$$;
create trigger feedback_analytics after insert on public.feedback
  for each row execute function private.analytics_feedback();

-- ---------------------------------------------------------------------------
-- Ventures
-- ---------------------------------------------------------------------------
create function private.analytics_venture_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.owner_id, 'venture_created', jsonb_build_object('type', new.type, 'visibility', new.visibility));
  return null;
end;
$$;
create trigger ventures_analytics_created after insert on public.ventures
  for each row execute function private.analytics_venture_created();

create function private.analytics_venture_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The owner's own row is written with the venture; joining means someone else.
  if not exists (select 1 from public.ventures v where v.id = new.venture_id and v.owner_id = new.user_id) then
    perform private.track(new.user_id, 'venture_joined', jsonb_build_object('team_role', new.team_role));
  end if;
  return null;
end;
$$;
create trigger venture_members_analytics after insert on public.venture_members
  for each row execute function private.analytics_venture_joined();

create function private.analytics_venture_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  for v_member in select m.user_id from public.venture_members m where m.venture_id = new.id loop
    perform private.track(v_member, 'venture_completed', jsonb_build_object('type', new.type, 'owner', v_member = new.owner_id));
  end loop;
  return null;
end;
$$;
create trigger ventures_analytics_completed after update of status on public.ventures
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function private.analytics_venture_completed();

-- ---------------------------------------------------------------------------
-- Recruiting: contact requests, applications, hires
-- ---------------------------------------------------------------------------
create function private.analytics_contact_sent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.recruiter_id, 'contact_request_sent');
  return null;
end;
$$;
create trigger contact_requests_analytics_sent after insert on public.contact_requests
  for each row execute function private.analytics_contact_sent();

create function private.analytics_contact_accepted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(new.student_id, 'contact_request_accepted');
  return null;
end;
$$;
create trigger contact_requests_analytics_accepted after update of status on public.contact_requests
  for each row when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function private.analytics_contact_accepted();

create function private.analytics_application()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.track(new.student_id, 'application_stage_changed', jsonb_build_object('to', new.stage));
  else
    -- The person who moved it (recruiter, or the student withdrawing); a job's own changes carry no person.
    perform private.track((select auth.uid()), 'application_stage_changed', jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return null;
end;
$$;
create trigger job_applications_analytics_insert after insert on public.job_applications
  for each row execute function private.analytics_application();
create trigger job_applications_analytics_update after update of stage on public.job_applications
  for each row when (new.stage is distinct from old.stage) execute function private.analytics_application();

create function private.analytics_hire()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.track(coalesce(new.hired_by, (select auth.uid())), 'hire_confirmed',
    jsonb_build_object('kind', new.kind, 'job_type', new.job_type));
  return null;
end;
$$;
create trigger hires_analytics after insert on public.hires
  for each row execute function private.analytics_hire();

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
create function private.analytics_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(new.created_by, case when new.subject_type = 'user' then new.subject_id end);
  v_props jsonb := jsonb_build_object('subject_type', new.subject_type, 'plan_id', new.plan_id, 'status', new.status,
    'gateway', new.gateway, 'live', new.live);
begin
  if tg_op = 'INSERT' then
    perform private.track(v_user, 'subscription_started', v_props,
      case when new.subject_type = 'user' then jsonb_build_object('plan', new.plan_id) end);
  elsif (new.cancel_at_period_end and not old.cancel_at_period_end)
     or (new.status = 'cancelled' and old.status <> 'cancelled' and not old.cancel_at_period_end) then
    perform private.track(v_user, 'subscription_cancelled', v_props);
  end if;
  return null;
end;
$$;
create trigger subscriptions_analytics_insert after insert on public.subscriptions
  for each row execute function private.analytics_subscription();
create trigger subscriptions_analytics_update after update of status, cancel_at_period_end on public.subscriptions
  for each row when ((new.cancel_at_period_end and not old.cancel_at_period_end)
                  or (new.status = 'cancelled' and old.status <> 'cancelled'))
  execute function private.analytics_subscription();

revoke all on function private.analytics_profile_created(), private.analytics_profile_changed(), private.analytics_email_verified(),
  private.analytics_agreement_accepted(), private.analytics_onboarding(), private.analytics_tour(), private.analytics_github_connected(),
  private.analytics_first_l2(), private.analytics_contribution(), private.analytics_cv_exported(), private.analytics_tier(),
  private.analytics_post(), private.analytics_survey(), private.analytics_comment(), private.analytics_chat_message(),
  private.analytics_feedback(), private.analytics_venture_created(), private.analytics_venture_joined(),
  private.analytics_venture_completed(), private.analytics_contact_sent(), private.analytics_contact_accepted(),
  private.analytics_application(), private.analytics_hire(), private.analytics_subscription() from public;

-- People who already passed a "first time" step before this file aren't counted again.
insert into private.analytics_once (user_id, name)
select distinct user_id, 'first_l2_skill' from public.user_skills where level >= 2
union select user_id, 'github_connected' from public.github_accounts
union select distinct user_id, 'agreement_accepted' from public.agreement_acceptances
union select id, 'email_verified' from auth.users where email_confirmed_at is not null
union select user_id, 'onboarding_completed' from public.onboarding_state where completed_at is not null
union select o.user_id, 'onboarding_step_' || s.step from public.onboarding_state o, generate_series(2, o.step) s(step)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Account deletion: remove the PostHog person, events and recordings (PRD 10, 5.25)
-- ---------------------------------------------------------------------------
-- Sent an hour later, so every event already queued for the person is ingested first and can't
-- bring the person back.
create function private.analytics_forget_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send('analytics', jsonb_build_object('kind', 'delete_person', 'distinct_id', old.id), 3600);
  return null;
end;
$$;
revoke all on function private.analytics_forget_user() from public;
create trigger analytics_forget_user after delete on auth.users
  for each row execute function private.analytics_forget_user();

-- ---------------------------------------------------------------------------
-- Worker wake-up and queue upkeep
-- ---------------------------------------------------------------------------
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'analytics_worker_secret',
  'Bearer secret pg_cron uses to wake the analytics-worker Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'analytics_worker_secret');

create function private.wake_analytics_worker()
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
  if not exists (select 1 from pgmq.q_analytics where vt <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'analytics_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/analytics-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function private.wake_analytics_worker() from public;

-- Events PostHog never received (worker unconfigured or down) are dropped after 7 days: analytics are
-- best-effort. Deletions stay until they succeed.
create function private.purge_analytics_queue()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from pgmq.q_analytics where enqueued_at < now() - interval '7 days' and message ->> 'kind' = 'capture';
  delete from pgmq.a_analytics where archived_at < now() - interval '30 days';
$$;
revoke all on function private.purge_analytics_queue() from public;

select cron.schedule('analytics-worker', '* * * * *', $$select private.wake_analytics_worker()$$);
select cron.schedule('purge-analytics', '47 3 * * *', $$select private.purge_analytics_queue()$$);
