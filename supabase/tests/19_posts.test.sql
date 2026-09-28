-- Posts (PRD 5.6, 5.28): every limit refused in SQL, cross-university reads return
-- nothing, blocks hide posts both ways, polls allow one vote, edits only for 15 minutes,
-- announcements staff-only, invites owner-only, Shipped posts on completion.
-- A and B study at NUTECH, C at FAST; S is staff.
begin;
select plan(46);

insert into auth.users (id, email) values
  ('19000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('19000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('19000000-0000-0000-0000-00000000000c', 'c@nu.edu.pk'),
  ('19000000-0000-0000-0000-00000000000e', 'e@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'ps_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '19000000-%';
insert into public.staff_roles (user_id, role, granted_by)
values ('19000000-0000-0000-0000-00000000000e', 'moderator', '19000000-0000-0000-0000-00000000000e');

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '19000000-0000-0000-0000-00000000000' || p_id, 'role', 'authenticated',
                      'aal', case when p_id = 'e' then 'aal2' else 'aal1' end)::text, true);
end;
$$;
create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('19000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.clear_rl() returns void language sql security definer as $$ delete from private.rate_limit_events $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select pg_temp.as_user('a');

-- ---------------------------------------------------------------------------
-- Direct writes refused
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.posts (author_id, university_id, audience, type, body)
                    values (pg_temp.uid('a'), null, 'global', 'general', 'x') $$, '42501', null, 'posts are not inserted directly');
select throws_ok($$ insert into public.poll_votes (post_id, user_id, position) values (gen_random_uuid(), pg_temp.uid('a'), 1) $$,
  '42501', null, 'votes are not inserted directly');
select throws_ok($$ insert into public.event_rsvps (post_id, user_id, status) values (gen_random_uuid(), pg_temp.uid('a'), 'going') $$,
  '42501', null, 'RSVPs are not inserted directly');
select throws_ok($$ insert into public.post_media (post_id, position, path, width, height) values (gen_random_uuid(), 1, 'x', 1, 1) $$,
  '42501', null, 'media rows are not inserted directly');

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.create_post('{"type":"general","body":"   "}') $$, '23514', null, 'an empty post is refused');
select throws_ok($$ select public.create_post(jsonb_build_object('type', 'general', 'body', repeat('x', 2001))) $$,
  '23514', null, 'a post over 2,000 characters is refused');
select throws_ok($$ select public.create_post('{"type":"shipped","body":"x"}') $$, '42501', null, 'nobody posts a Shipped post by hand');
select throws_ok($$ select public.create_post('{"type":"announcement","body":"x"}') $$, '42501', null,
  'students cannot post announcements');
select throws_ok($$ select public.create_post('{"type":"general","body":"x","media":[{"path":"19000000-0000-0000-0000-00000000000b/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp","width":1,"height":1}]}') $$,
  '22023', null, 'someone else''s image path is refused');
select throws_ok($$ select public.create_post('{"type":"general","body":"x","media":[{"path":"19000000-0000-0000-0000-00000000000a/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp","width":1,"height":1}]}') $$,
  '22023', null, 'an image that was never uploaded is refused');
select throws_ok($$ select public.create_post('{"type":"general","body":"x","media":[{},{},{},{},{}]}') $$,
  '23514', null, 'more than 4 images is refused');
select throws_ok($$ select public.create_post('{"type":"poll","body":"Pick","poll":{"options":["only one"],"days":2}}') $$,
  '23514', null, 'a poll needs 2 to 4 options');
select throws_ok($$ select public.create_post('{"type":"poll","body":"Pick","poll":{"options":["a","b"],"days":9}}') $$,
  '23514', null, 'a poll closes within 7 days');
select throws_ok($$ select public.create_post('{"type":"event","body":"Meetup","event":{"place":"Lab 3"}}') $$,
  '22023', null, 'an event needs a date');

-- Uploaded images count once they exist in the author's folder.
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values ('post-media', '19000000-0000-0000-0000-00000000000a/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp', '19000000-0000-0000-0000-00000000000a');
set local role authenticated;
select set_config('test.p1', public.create_post('{"type":"general","audience":"university","body":"Hello NUTECH","media":[{"path":"19000000-0000-0000-0000-00000000000a/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp","width":800,"height":600}]}')::text, false);
select is((select count(*)::integer from public.post_media where post_id = pg_temp.v('p1')), 1, 'the post keeps its image');
select throws_ok($$ select public.create_post('{"type":"general","body":"again"}') $$, '54000', null,
  'a second post within 30 seconds is refused');

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------
select pg_temp.clear_rl();
select set_config('test.pg', public.create_post('{"type":"general","audience":"global","body":"Hello everyone"}')::text, false);
select pg_temp.as_user('b');
select set_eq($$ select body from public.posts $$,
  $$ values ('Hello NUTECH'::text), ('Hello everyone'::text) $$, 'a classmate sees both');
select pg_temp.as_user('c');
select results_eq($$ select body from public.posts $$, $$ values ('Hello everyone'::text) $$,
  'another university sees only the global post');
select is_empty($$ select 1 from public.posts where id = pg_temp.v('p1') $$, 'a university post by id returns nothing');
select is_empty($$ select 1 from public.post_cards(array[pg_temp.v('p1')]) $$, 'nor through post_cards');
select is_empty($$ select 1 from public.post_media where post_id = pg_temp.v('p1') $$, 'nor its images');
select results_eq($$ select count(*)::integer from public.list_posts('university') $$, $$ values (0) $$,
  'C''s University Feed has none of NUTECH''s posts');
select results_eq($$ select count(*)::integer from public.list_posts('global') $$, $$ values (1) $$, 'C''s Global Feed has the global one');

reset role;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('b'), pg_temp.uid('a'));
set local role authenticated;
select pg_temp.as_user('b');
select is_empty($$ select 1 from public.posts where author_id = pg_temp.uid('a') $$, 'the blocker no longer sees A''s posts');
select pg_temp.as_user('a');
select pg_temp.clear_rl();
select set_config('test.pb', public.create_post('{"type":"general","audience":"global","body":"From A again"}')::text, false);
select pg_temp.as_user('b');
select is_empty($$ select 1 from public.posts where id = pg_temp.v('pb') $$, 'nor new ones');
reset role;
delete from public.blocks;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Editing and deleting
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b');
select throws_ok($$ select public.edit_post(pg_temp.v('p1'), 'hijack') $$, '42501', null, 'only the author edits');
select throws_ok($$ select public.delete_post(pg_temp.v('p1')) $$, '42501', null, 'only the author deletes');
select pg_temp.as_user('a');
select lives_ok($$ select public.edit_post(pg_temp.v('p1'), 'Hello NUTECH (fixed)') $$, 'the author edits within 15 minutes');
select isnt((select edited_at from public.posts where id = pg_temp.v('p1')), null, 'and it shows as edited');
reset role;
update public.posts set created_at = now() - interval '16 minutes' where id = pg_temp.v('p1');
set local role authenticated;
select throws_ok($$ select public.edit_post(pg_temp.v('p1'), 'too late') $$, '55000', null, 'no edits after 15 minutes');
select results_eq($$ select public.delete_post(pg_temp.v('p1')) $$,
  $$ values (array['19000000-0000-0000-0000-00000000000a/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp']) $$,
  'deleting returns the image paths to remove');

-- ---------------------------------------------------------------------------
-- Polls and events
-- ---------------------------------------------------------------------------
select pg_temp.clear_rl();
select set_config('test.poll', public.create_post('{"type":"poll","audience":"global","body":"Best lab?","poll":{"options":["Lab 1","Lab 2"],"days":1}}')::text, false);
select pg_temp.as_user('c');
select results_eq($$ select (poll->'options'->0->>'votes') is null from public.post_cards(array[pg_temp.v('poll')]) $$,
  $$ values (true) $$, 'results are hidden before voting');
select lives_ok($$ select public.vote_poll(pg_temp.v('poll'), 2::smallint) $$, 'C votes');
select throws_ok($$ select public.vote_poll(pg_temp.v('poll'), 1::smallint) $$, '23505', null, 'a second vote is refused');
select results_eq($$ select (poll->'options'->1->>'votes')::integer, (poll->>'my_vote')::integer from public.post_cards(array[pg_temp.v('poll')]) $$,
  $$ values (1, 2) $$, 'results show after voting');
reset role;
update public.post_polls set closes_at = now() - interval '1 minute' where post_id = pg_temp.v('poll');
set local role authenticated;
select pg_temp.as_user('b');
select throws_ok($$ select public.vote_poll(pg_temp.v('poll'), 1::smallint) $$, '55000', null, 'a closed poll takes no votes');

select pg_temp.as_user('a');
select pg_temp.clear_rl();
select set_config('test.ev', public.create_post(jsonb_build_object('type', 'event', 'audience', 'global', 'body', 'Hack night',
  'event', jsonb_build_object('starts_at', now() + interval '2 days', 'place', 'Lab 3')))::text, false);
select pg_temp.as_user('c');
select lives_ok($$ select public.rsvp_event(pg_temp.v('ev'), 'going') $$, 'C is going');
select lives_ok($$ select public.rsvp_event(pg_temp.v('ev'), 'interested') $$, 'and can change to interested');
select results_eq($$ select (event->>'going')::integer, (event->>'interested')::integer, event->>'mine' from public.post_cards(array[pg_temp.v('ev')]) $$,
  $$ values (0, 1, 'interested'::text) $$, 'counts and her choice');

-- ---------------------------------------------------------------------------
-- Invites, announcements, Shipped
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select set_config('test.v', public.create_venture('{"type":"project","title":"Robots","description":"d","visibility":"university"}')::text, false);
select pg_temp.clear_rl();
select pg_temp.as_user('b');
select throws_ok(format($$ select public.create_post('{"type":"invite","body":"Join","venture_id":"%s"}') $$, pg_temp.v('v')),
  '42501', null, 'only the owner posts an invite');
select pg_temp.as_user('a');
select throws_ok(format($$ select public.create_post('{"type":"invite","audience":"global","body":"Join","venture_id":"%s"}') $$, pg_temp.v('v')),
  '22023', null, 'a university-only venture can''t be posted globally');
select set_config('test.inv', public.create_post(format('{"type":"invite","body":"Join us","venture_id":"%s"}', pg_temp.v('v'))::jsonb)::text, false);
select results_eq($$ select venture->>'title', (venture->>'is_member')::boolean from public.post_cards(array[pg_temp.v('inv')]) $$,
  $$ values ('Robots'::text, true) $$, 'the invite card carries the venture');

select pg_temp.as_user('e');
select lives_ok($$ select public.create_post('{"type":"announcement","body":"Welcome to Skilient","pin_days":10}') $$,
  'staff post an announcement');
select results_eq($$ select audience::text, pinned_until <= now() + interval '7 days' from public.posts where type = 'announcement' $$,
  $$ values ('global'::text, true) $$, 'as platform news, pinned for at most 7 days');

-- Completing a venture posts Shipped at Full.
reset role;
insert into public.venture_members (venture_id, user_id) values (pg_temp.v('v'), pg_temp.uid('b'));
update public.ventures set status = 'completed', completed_at = now() where id = pg_temp.v('v');
select results_eq($$ select type::text, stage::text, audience::text, author_id from public.posts where venture_id = pg_temp.v('v') and type = 'shipped' $$,
  $$ values ('shipped'::text, 'full'::text, 'university'::text, '19000000-0000-0000-0000-00000000000a'::uuid) $$,
  'a Shipped post starts at Full in the venture''s audience');

set local role anon;
select throws_ok($$ select * from public.list_posts('global') $$, '42501', null, 'signed-out visitors read nothing');
reset role;

select * from finish();
rollback;
