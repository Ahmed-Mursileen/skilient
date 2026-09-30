-- Student portal (PRD 5.25, 5.27; decisions.md 2026-10-02): account status and the graduate
-- rules, the deletion cooling-off and removal, tours, tips and day-dismissals, the progress
-- card reads, the Opportunities hub, the feedback centre and its staff triage.
-- A is an active student, G graduates, X another student, Z is deleted with a team behind
-- them, T is accounts staff (aal2).
begin;
select plan(85);

insert into auth.users (id, email)
select ('93900000-0000-0000-0000-0000000000' || x.k)::uuid, 'sp' || x.k || '@nutech.edu.pk'
  from (values ('01'), ('02'), ('03'), ('04'), ('05'), ('06')) as x(k);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('93900000-0000-0000-0000-0000000000' || case p when 'A' then '01' when 'G' then '02' when 'X' then '03'
    when 'Z' then '04' when 'T' then '05' when 'M' then '06' end)::uuid
$$;
update public.profiles set onboarding_complete = true, username = 'sp_' || right(user_id::text, 2),
       full_name = 'Student ' || right(user_id::text, 2), department = 'Computer Science', graduation_year = 2028
 where user_id::text like '93900000-%';
update public.profiles set graduation_year = 2026 where user_id in (pg_temp.u('G'), pg_temp.u('Z'));
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('T'), 'accounts', pg_temp.u('T'));
create function pg_temp.as_user(p text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Default deny: no direct writes, only your own rows
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('A');
select throws_ok($$insert into public.ui_state (user_id, key, value) values (pg_temp.u('A'), 'checklist_dismissed', 'true')$$,
  '42501', null, 'ui_state has no direct writes');
select throws_ok($$insert into public.tour_progress (user_id, tour_id) values (pg_temp.u('A'), 'student')$$,
  '42501', null, 'tour_progress has no direct writes');
select throws_ok($$insert into public.tips_seen (user_id, tip_id) values (pg_temp.u('A'), 'cv')$$,
  '42501', null, 'tips_seen has no direct writes');
select throws_ok($$insert into public.feedback (user_id, type, body) values (pg_temp.u('A'), 'bug', 'a bug')$$,
  '42501', null, 'feedback has no direct writes');
select throws_ok($$update public.profiles set status = 'graduate' where user_id = pg_temp.u('A')$$,
  '42501', null, 'the client can''t set its own account status');
select throws_ok($$update public.profiles set delete_after = now() where user_id = pg_temp.u('A')$$,
  '42501', null, 'or its deletion date');

-- ---------------------------------------------------------------------------
-- Graduate rollover
-- ---------------------------------------------------------------------------
reset role;
update public.universities set final_year_batch = 2026
 where id = (select university_id from public.profiles where user_id = pg_temp.u('A'));
select is(private.graduate_rollover(), 2, 'the rollover graduates the batch (G and Z)');
select is((select status::text from public.profiles where user_id = pg_temp.u('G')), 'graduate', 'G is a graduate');
select is((select status::text from public.profiles where user_id = pg_temp.u('A')), 'active', 'A (batch 2028) is not');
select isnt((select graduated_at from public.profiles where user_id = pg_temp.u('G')), null, 'with the date');
select is(private.graduate_rollover(), 0, 'running it again changes nothing');
-- Z stays active in this test: keep them out of the graduate rules below.
update public.profiles set status = 'active', graduated_at = null where user_id = pg_temp.u('Z');

-- A university-only venture by A; a public one.
set local role authenticated;
select pg_temp.as_user('A');
select pg_temp.remember('uv', public.create_venture('{"type":"project","title":"Uni only","description":"d","visibility":"university","skill_ids":["react"]}'));
select pg_temp.remember('pv', public.create_venture('{"type":"project","title":"Open one","description":"d","visibility":"public","skill_ids":["react"]}'));

select pg_temp.as_user('G');
select throws_ok($$select public.create_post('{"type":"general","audience":"university","body":"hello"}')$$,
  '42501', null, 'a graduate can''t post to the University Feed');
select lives_ok($$select public.create_post('{"type":"general","audience":"global","body":"hello"}')$$,
  'a graduate can post to the Global Feed');
select throws_ok($$select public.apply_to_venture(pg_temp.v('uv'), 'may I join?')$$,
  '42501', null, 'a graduate can''t apply to a university-only venture');
select lives_ok($$select public.apply_to_venture(pg_temp.v('pv'), 'may I join?')$$,
  'a graduate can apply to a public venture');
reset role;
select throws_ok($$insert into public.venture_members (venture_id, user_id) values (pg_temp.v('uv'), pg_temp.u('G'))$$,
  '42501', null, 'and can''t be made a member of a university-only venture either');
select lives_ok($$insert into public.posts (author_id, university_id, audience, type, body, venture_id)
  select pg_temp.u('G'), university_id, 'university', 'shipped', 'Shipped: it', pg_temp.v('uv') from public.profiles where user_id = pg_temp.u('G')$$,
  'the automatic shipped post is not a graduate posting');

-- ---------------------------------------------------------------------------
-- Leaderboards: graduates leave the university board after 12 months
-- ---------------------------------------------------------------------------
insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked, tier, tier_met,
                                   percentile, computed_at, published_at)
select u, 1, '{}', 200, 0, 0, 200, true, 'spark', 'spark', 0.8, now(), now() from unnest(array[pg_temp.u('A'), pg_temp.u('G')]) u;
select pg_temp.as_user('A');
select is((select count(*)::integer from private.board('university', null, null)), 2, 'a recent graduate is on the university board');
update public.profiles set graduated_at = now() - interval '13 months' where user_id = pg_temp.u('G');
select is((select count(*)::integer from private.board('university', null, null)), 1, 'after 12 months they leave it');
select is((select count(*)::integer from private.board('global', null, null)), 2, 'the global board keeps them');

-- ---------------------------------------------------------------------------
-- Account deletion: cooling-off, cancel, removal
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('A');
select ok(public.request_account_deletion() between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour',
  'deletion is set 14 days out');
select is((select status::text from public.profiles where user_id = pg_temp.u('A')), 'deleting', 'the account is deleting');
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u('A') and type = 'deletion_requested'), 1,
  'A is told');
select is(public.request_account_deletion(), (select delete_after from public.profiles where user_id = pg_temp.u('A')),
  'asking twice keeps the same date');
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u('A') and type = 'deletion_requested'), 1,
  'and doesn''t notify twice');
select lives_ok($$select public.cancel_account_deletion()$$, 'A cancels');
select is((select status::text from public.profiles where user_id = pg_temp.u('A')), 'active', 'the account is fully back');
select is((select delete_after from public.profiles where user_id = pg_temp.u('A')), null, 'with no date');
select throws_ok($$select public.cancel_account_deletion()$$, '55000', null, 'nothing left to cancel');
select pg_temp.as_user('G');
select public.request_account_deletion();
select public.cancel_account_deletion();
select is((select status::text from public.profiles where user_id = pg_temp.u('G')), 'graduate', 'a graduate who cancels is a graduate again');
select pg_temp.as_user('T', 'aal2');
select throws_ok($$select public.request_account_deletion()$$, '55000', null, 'staff accounts are removed by a super admin');
reset role;

-- Z owns "Zed's venture" with M on the team, and a solo venture; both go with the account.
set local role authenticated;
select pg_temp.as_user('Z');
select pg_temp.remember('zv', public.create_venture('{"type":"project","title":"Zed team","description":"d","visibility":"public","skill_ids":["react"]}'));
select pg_temp.remember('zs', public.create_venture('{"type":"project","title":"Zed solo","description":"d","visibility":"public","skill_ids":["react"]}'));
select public.create_post('{"type":"general","audience":"university","body":"Zed was here"}');
select public.request_account_deletion();
reset role;
insert into public.venture_members (venture_id, user_id) values (pg_temp.v('zv'), pg_temp.u('M'));
select throws_ok($$select private.delete_account(pg_temp.u('Z'))$$, '55000', null, 'not due yet: refused');
select is(private.account_deletion_run(), 0, 'the job leaves accounts inside their window');
update public.profiles set delete_after = now() - interval '1 minute' where user_id = pg_temp.u('Z');
select is(private.account_deletion_run(), 1, 'the job removes the account after the window');
select is((select count(*)::integer from auth.users where id = pg_temp.u('Z')), 0, 'the auth user is gone');
select is((select count(*)::integer from public.profiles where user_id = pg_temp.u('Z')), 0, 'and the profile');
select is((select owner_id from public.ventures where id = pg_temp.v('zv')), pg_temp.u('M'), 'the team venture passes to a member');
select is((select count(*)::integer from public.ventures where id = pg_temp.v('zs')), 0, 'the solo venture goes');
select is((select count(*)::integer from public.posts where author_id = pg_temp.u('Z')), 0, 'their posts go');

-- ---------------------------------------------------------------------------
-- Tours, tips and day-dismissals
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('A');
select is(public.tour_state('student'), '{"started": false, "step": 0, "completed": false, "skipped": false}'::jsonb, 'no tour yet');
select public.save_tour('student', 3, 'progress');
select is(public.tour_state('student')->>'step', '3', 'the step is saved');
select public.save_tour('student', 8, 'skipped');
select is((public.tour_state('student')->>'skipped')::boolean, true, 'a skipped tour stays skipped');
select public.save_tour('student', 2, 'progress');
select is((public.tour_state('student')->>'skipped')::boolean, true, 'later progress can''t undo it');
select public.restart_tour('student');
select is((public.tour_state('student')->>'started')::boolean, false, 'replaying starts over');
select throws_ok($$select public.save_tour('admin', 1, 'progress')$$, '22023', null, 'unknown tours are refused');
select throws_ok($$select public.save_tour('student', 1, 'finished')$$, '22023', null, 'and unknown outcomes');
select public.see_tip('cv');
select public.see_tip('cv');
select is((select count(*)::integer from public.tips_seen), 1, 'a tip is seen once');
select throws_ok($$select public.see_tip('everything')$$, '22023', null, 'unknown tips are refused');
select lives_ok($$select public.set_ui_state('progress_card_dismissed_on', '"2026-10-02"')$$, 'the card can be dismissed for a day');
select throws_ok($$select public.set_ui_state('anything_else', 'true')$$, '22023', null, 'only known keys are stored');
select pg_temp.as_user('X');
select is((select count(*)::integer from public.ui_state), 0, 'nobody reads another student''s state');
select is((select count(*)::integer from public.tips_seen), 0, 'or tips');

-- ---------------------------------------------------------------------------
-- Progress card reads
-- ---------------------------------------------------------------------------
select pg_temp.as_user('X');
select is(public.next_best_action()->>'key', 'join_venture', 'a new student is asked to join a venture');
select is((public.getting_started()->>'total')::integer, 6, 'six checklist items');
select is((public.getting_started()->>'done')::integer, 0, 'none done for a new student');
select is((select count(*)::integer from jsonb_array_elements(public.getting_started()->'items') i where (i->>'points') is not null), 3,
  'three items show the points the formula pays');
reset role;
insert into public.friend_requests (sender_id, receiver_id) values (pg_temp.u('A'), pg_temp.u('X'));
set local role authenticated;
select pg_temp.as_user('X');
select is((public.nav_badges()->>'friends')::integer, 1, 'the Friends badge counts a pending request');
select is((public.todo_counts()->>'total')::integer, 1, 'and the to-do count includes it');
select pg_temp.as_user('A');
select is((public.todo_counts()->>'applications')::integer, 1, 'A has G''s application waiting');
select is((public.nav_badges()->>'ventures')::integer, 1, 'shown on Ventures');

-- ---------------------------------------------------------------------------
-- Opportunities hub
-- ---------------------------------------------------------------------------
select throws_ok($$select * from public.opportunities('bogus')$$, '22023', null, 'unknown tabs are refused');
select is((select count(*)::integer from public.opportunities('for_you')), 0, 'nothing to show yet, without an error');
reset role;
select ok((select prosrc !~* 'sponsor' from pg_proc where oid = 'private.opportunities(text, integer)'::regprocedure),
  '"For you" has no sponsorship input');

-- ---------------------------------------------------------------------------
-- Feedback and triage
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('X');
select pg_temp.remember('f1', public.submit_feedback('confusing', 'What does Momentum mean?', null, '/me/score', 'Chrome on Linux', '1.0'));
select isnt(pg_temp.v('f1'), null, 'feedback is saved');
select throws_ok($$select public.submit_feedback('bug', 'x', null, null, null, null)$$, '23514', null, 'too short is refused');
select throws_ok($$select public.submit_feedback('bug', 'It broke', pg_temp.u('X') || '/93900000-0000-0000-0000-000000000001.webp', null, null, null)$$,
  '22023', null, 'a screenshot that was never uploaded is refused');
select throws_ok($$select public.submit_feedback('bug', 'It broke', pg_temp.u('A') || '/93900000-0000-0000-0000-000000000001.webp', null, null, null)$$,
  '22023', null, 'and someone else''s');
select lives_ok($$select public.submit_feedback('idea', 'Idea number ' || g, null, null, null, null) from generate_series(1, 9) g$$, 'nine more');
select throws_ok($$select public.submit_feedback('praise', 'One too many', null, null, null, null)$$, '54000', null, 'ten a day at most');
select is((select count(*)::integer from public.my_feedback()), 10, 'my feedback lists them');
select pg_temp.as_user('A');
select is((select count(*)::integer from public.feedback), 0, 'nobody reads another student''s feedback');
select throws_ok($$select * from public.feedback_queue()$$, '42501', null, 'the queue is staff only');
select pg_temp.as_user('T', 'aal1');
select throws_ok($$select * from public.feedback_queue()$$, '42501', null, 'and needs two-factor');
select pg_temp.as_user('T', 'aal2');
select is((select count(*)::integer from public.feedback_queue(true)), 10, 'staff see the open queue');
select throws_ok($$select public.respond_feedback(pg_temp.v('f1'), 'reviewing', 'Looking')$$, '55000', null, 'a reply needs a claim');
select lives_ok($$select public.claim_feedback(pg_temp.v('f1'), true)$$, 'staff claim it');
select lives_ok($$select public.respond_feedback(pg_temp.v('f1'), 'planned', 'Momentum is your recent activity; we''ll explain it better.')$$, 'and reply');
select throws_ok($$select public.respond_feedback(pg_temp.v('f1'), 'planned', null)$$, '55000', null, 'a reply that changes nothing is refused');
reset role;
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u('X') and type = 'feedback_update'), 1, 'the student is told');
select is((select count(*)::integer from public.ops_audit_log where target_type = 'feedback' and target_id = pg_temp.v('f1')::text), 2, 'claim and reply are audited');

-- ---------------------------------------------------------------------------
-- Final-year batch (accounts staff)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('A');
select throws_ok($$select public.ops_set_final_year_batch((select university_id from public.profiles where user_id = pg_temp.u('A')), 2027::smallint, 'yearly')$$,
  '42501', null, 'students can''t set a batch');
select pg_temp.as_user('T', 'aal2');
select throws_ok($$select public.ops_set_final_year_batch((select university_id from public.profiles where user_id = pg_temp.u('A')), 2027::smallint, 'x')$$,
  '22023', null, 'a reason is required');
select lives_ok($$select public.ops_set_final_year_batch((select university_id from public.profiles where user_id = pg_temp.u('A')), 2027::smallint, 'Batch of 2027 finishes')$$,
  'accounts staff set it');
reset role;
select is((select final_year_batch from public.universities where id = (select university_id from public.profiles where user_id = pg_temp.u('A'))), 2027::smallint, 'it is saved');
select is((select count(*)::integer from public.ops_audit_log where action = 'university.final_year_batch'), 1, 'and audited');

select * from finish();
rollback;
