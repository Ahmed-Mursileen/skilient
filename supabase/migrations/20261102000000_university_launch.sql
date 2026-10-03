-- Phase 12, slice 4 (PRD 5.1): "when a university goes live, the university-launch job emails
-- confirmed requesters once". A trigger on universities.live_at queues one message per request
-- on pgmq notification_emails (kind university_launch); the notify worker sends it. notified_at
-- is set when the message is queued, so a request is emailed at most once even if staff close and
-- reopen the university.

create function private.queue_university_launch(p_university uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    update public.university_requests r
       set notified_at = now()
     where r.university_id = p_university
       and r.consent
       and r.confirmed_at is not null
       and r.unsubscribed_at is null
       and r.notified_at is null
    returning r.id
  )
  select count(*)::integer into v_count
    from due, lateral pgmq.send('notification_emails', jsonb_build_object('kind', 'university_launch', 'request_id', due.id));
  return v_count;
end;
$$;
revoke all on function private.queue_university_launch(uuid) from public, anon, authenticated;

create function private.university_went_live()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_university_launch(new.id);
  return null;
end;
$$;
revoke all on function private.university_went_live() from public, anon, authenticated;

create trigger universities_launch_emails
  after update of live_at on public.universities
  for each row
  when (old.live_at is null and new.live_at is not null)
  execute function private.university_went_live();

-- What the worker needs to build the email: the address and the university, only while the
-- request still wants it (not unsubscribed since it was queued) and the university is still live.
create function private.university_launch_email(p_request uuid)
returns table (email text, university text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.email, u.name, u.slug
    from public.university_requests r
    join public.universities u on u.id = r.university_id
   where r.id = p_request
     and r.unsubscribed_at is null
     and u.live_at is not null
$$;
revoke all on function private.university_launch_email(uuid) from public, anon, authenticated;

comment on column public.university_requests.notified_at is
  'When the launch email was queued (once per request, by the universities_launch_emails trigger).';
