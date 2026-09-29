-- Phase 4 answers (decisions.md 2026-09-30): Clear bio and photo and Unlist cost no points by
-- themselves; only Remove and Warn do. A moderator can add a Warn alongside them by giving a
-- severity. The reviewer of every decision stays recorded (credentials.reviewer_id,
-- review_flags.reviewer_id, anti_gaming_flags.reviewed_by, code_checks.grader_id, ops_audit_log).

create or replace function private.resolve_case(p_case uuid, p_action text, p_reason text, p_severity text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_moderator();
  c public.report_cases;
  v_status public.report_case_status;
  v_before jsonb;
  v_after jsonb := '{}'::jsonb;
  v_notice text;
  v_severity text := case when p_action = 'dismiss' then null else nullif(p_severity, '') end;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '23514';
  end if;
  select * into c from public.report_cases where id = p_case for update;
  if c.id is null or c.status <> 'open' then
    raise exception 'this case is already closed' using errcode = '55000';
  end if;
  if c.claimed_by is distinct from v_me then
    raise exception 'claim the case first' using errcode = '55000';
  end if;
  -- Remove and Warn cost points and need a severity. Clear and Unlist cost nothing by
  -- themselves; a severity there adds a Warn alongside (decisions.md 2026-09-30).
  if p_action in ('remove', 'warn') and (v_severity is null or v_severity not in ('low', 'medium', 'high')) then
    raise exception 'choose a severity: low, medium or high' using errcode = '22023';
  end if;
  if v_severity is not null and v_severity not in ('low', 'medium', 'high') then
    raise exception 'choose a severity: low, medium or high' using errcode = '22023';
  end if;
  v_before := jsonb_build_object('status', c.status, 'target_type', c.target_type, 'target_id', c.target_id);

  if p_action = 'dismiss' then
    v_status := 'dismissed';
    if c.target_type = 'post' then
      update public.post_stats set reports = 0, updated_at = now() where post_id = c.target_id;
      update public.posts p set stage = coalesce(private.compute_stage(p.id), 'seed'), stage_changed_at = now()
       where p.id = c.target_id and p.stage = 'held';
    end if;
  elsif p_action = 'remove' then
    v_status := 'removed';
    v_notice := 'removed';
    if c.target_type = 'post' then
      update public.posts set removed_at = now(), removed_by = v_me where id = c.target_id and removed_at is null;
    elsif c.target_type = 'comment' then
      update public.post_comments set deleted_at = coalesce(deleted_at, now()), body = '', pinned = false, removed_by = v_me
       where id = c.target_id;
    elsif c.target_type = 'message' then
      update public.chat_messages
         set deleted_at = coalesce(deleted_at, now()), body = '', media_path = null, media_width = null, media_height = null,
             removed_by = v_me
       where id = c.target_id;
      delete from public.chat_pins where message_id = c.target_id;
    else
      raise exception 'use "clear bio and photo" for a profile or "unlist" for a venture' using errcode = '22023';
    end if;
    v_after := jsonb_build_object('removed', true);
  elsif p_action = 'clear_profile' then
    if c.target_type <> 'profile' then
      raise exception 'only a profile''s bio and photo can be cleared' using errcode = '22023';
    end if;
    v_status := 'removed';
    v_notice := 'cleared';
    select v_before || jsonb_build_object('bio', p.bio, 'avatar_path', p.avatar_path) into v_before
      from public.profiles p where p.user_id = c.target_id;
    update public.profiles set bio = null, avatar_path = null where user_id = c.target_id;
    v_after := jsonb_build_object('bio', null, 'avatar_path', null);
  elsif p_action = 'unlist' then
    if c.target_type <> 'venture' then
      raise exception 'only a venture can be unlisted' using errcode = '22023';
    end if;
    v_status := 'removed';
    v_notice := 'unlisted';
    select v_before || jsonb_build_object('visibility', v.visibility) into v_before from public.ventures v where v.id = c.target_id;
    update public.ventures set visibility = 'unlisted' where id = c.target_id;
    v_after := jsonb_build_object('visibility', 'unlisted');
  elsif p_action = 'warn' then
    v_status := 'warned';
    if c.owner_id is null then
      raise exception 'there''s no one to warn' using errcode = '22023';
    end if;
    insert into public.sanctions (user_id, kind, reason, staff_id, case_id) values (c.owner_id, 'warn', btrim(p_reason), v_me, c.id);
    perform private.notify(c.owner_id, null, 'moderation_warning', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  else
    raise exception 'choose dismiss, remove, clear, unlist or warn' using errcode = '22023';
  end if;

  if v_notice is not null then
    perform private.notify(c.owner_id, null, 'content_removed', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'action', v_notice,
                                              'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  end if;

  if p_action in ('clear_profile', 'unlist') and v_severity is not null and c.owner_id is not null then
    insert into public.sanctions (user_id, kind, reason, staff_id, case_id) values (c.owner_id, 'warn', btrim(p_reason), v_me, c.id);
    perform private.notify(c.owner_id, null, 'moderation_warning', 'report_case', c.id,
                           jsonb_build_object('target_type', c.target_type, 'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120)));
  end if;

  -- An upheld report costs the owner points for 12 months (PRD 5.13 penalties).
  if v_severity is not null and c.owner_id is not null then
    insert into public.ranking_adjustments (user_id, kind, severity, reason, case_id, staff_id)
    values (c.owner_id, 'penalty', v_severity, btrim(p_reason), c.id, v_me);
    v_after := v_after || jsonb_build_object('severity', v_severity);
  end if;

  update public.report_cases
     set status = v_status, resolved_by = v_me, resolved_at = now(), resolution_reason = btrim(p_reason)
   where id = p_case;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'report.' || p_action, 'report_case', p_case::text, btrim(p_reason), v_before,
          v_after || jsonb_build_object('status', v_status));
end;
$$;
