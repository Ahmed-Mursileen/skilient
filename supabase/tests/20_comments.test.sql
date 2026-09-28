-- Comments, hides, mutes, link previews (PRD 5.28). A, B and C study at NUTECH, D at FAST.
begin;
select plan(35);

insert into auth.users (id, email) values
  ('20c00000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('20c00000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('20c00000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('20c00000-0000-0000-0000-00000000000d', 'd@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'cm_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '20c00000-%';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '20c00000-0000-0000-0000-00000000000' || p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('20c00000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.clear_rl() returns void language sql security definer as $$ delete from private.rate_limit_events $$;
create function pg_temp.n(p_user text, p_type text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where user_id = pg_temp.uid(p_user) and type = p_type
$$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select pg_temp.as_user('a');
select set_config('test.p', public.create_post('{"type":"general","audience":"university","body":"Campus hackathon next week"}')::text, false);

-- Direct writes refused
select throws_ok($$ insert into public.post_comments (post_id, author_id, body) values (pg_temp.v('p'), pg_temp.uid('a'), 'x') $$,
  '42501', null, 'comments are not inserted directly');
select throws_ok($$ insert into public.post_hides (user_id, post_id) values (pg_temp.uid('a'), pg_temp.v('p')) $$,
  '42501', null, 'hides are not inserted directly');
select throws_ok($$ insert into public.user_mutes (user_id, muted_id) values (pg_temp.uid('a'), pg_temp.uid('b')) $$,
  '42501', null, 'mutes are not inserted directly');
select throws_ok($$ insert into public.link_previews (url_hash, url, status) values (repeat('a', 64), 'https://x', 'ok') $$,
  '42501', null, 'link previews are not written by users');

-- Limits and nesting
select pg_temp.as_user('b');
select throws_ok($$ select public.add_comment(pg_temp.v('p'), null, '  ') $$, '23514', null, 'an empty comment is refused');
select throws_ok($$ select public.add_comment(pg_temp.v('p'), null, repeat('x', 1001)) $$, '23514', null, 'over 1,000 characters is refused');
select set_config('test.c1', public.add_comment(pg_temp.v('p'), null, 'Count me in, @cm_c and @nobody_here')::text, false);
select throws_ok($$ select public.add_comment(pg_temp.v('p'), null, 'again') $$, '54000', null, 'a second comment within 10 seconds is refused');
select is(pg_temp.n('a', 'comment_received'), 1, 'the post author is notified once');
select is(pg_temp.n('c', 'comment_mention'), 1, 'the mentioned classmate is notified');
select pg_temp.as_user('c');
select pg_temp.clear_rl();
select set_config('test.r1', public.add_comment(pg_temp.v('p'), pg_temp.v('c1'), 'Me too')::text, false);
select is(pg_temp.n('b', 'comment_reply'), 1, 'the parent''s author hears about the reply');
select is(pg_temp.n('a', 'comment_received'), 2, 'and the post author about the new comment');
select pg_temp.clear_rl();
select throws_ok($$ select public.add_comment(pg_temp.v('p'), pg_temp.v('r1'), 'nested') $$, '23514', null,
  'a reply to a reply is refused');
reset role;
select throws_ok($$ insert into public.post_comments (post_id, parent_id, author_id, body) values (pg_temp.v('p'), pg_temp.v('r1'), pg_temp.uid('c'), 'deep') $$,
  '23514', null, 'the table itself refuses a second level');
set local role authenticated;

-- Another university can't see or comment on a University post
select pg_temp.as_user('d');
select is_empty($$ select 1 from public.post_comments where post_id = pg_temp.v('p') $$, 'another university reads no comments');
select throws_ok($$ select public.add_comment(pg_temp.v('p'), null, 'hi') $$, 'P0002', null, 'and can''t comment');
select is_empty($$ select * from public.post_comment_list(pg_temp.v('p')) $$, 'nor through the list function');

-- Order: pinned first, replies after their parent
select pg_temp.as_user('a');
select pg_temp.clear_rl();
select set_config('test.c2', public.add_comment(pg_temp.v('p'), null, 'Details soon')::text, false);
select throws_ok($$ select public.pin_comment(pg_temp.v('r1'), true) $$, '22023', null, 'replies can''t be pinned');
select lives_ok($$ select public.pin_comment(pg_temp.v('c2'), true) $$, 'the post author pins a comment');
select results_eq($$ select body from public.post_comment_list(pg_temp.v('p')) $$,
  $$ values ('Details soon'::text), ('Count me in, @cm_c and @nobody_here'::text), ('Me too'::text) $$,
  'pinned first, then oldest, replies under their parent');
select pg_temp.as_user('b');
select throws_ok($$ select public.pin_comment(pg_temp.v('c1'), true) $$, '42501', null, 'only the post author pins');

-- Deleting keeps the place; the post author may delete others' comments
select throws_ok($$ select public.delete_comment(pg_temp.v('r1')) $$, '42501', null, 'B can''t delete C''s reply');
select lives_ok($$ select public.delete_comment(pg_temp.v('c1')) $$, 'B deletes her own comment');
select results_eq($$ select deleted, body, author_name from public.post_comment_list(pg_temp.v('p')) where id = pg_temp.v('c1') $$,
  $$ values (true, ''::text, null::text) $$, 'it stays as a deleted placeholder without author or text');
select pg_temp.as_user('a');
select lives_ok($$ select public.delete_comment(pg_temp.v('r1')) $$, 'the post author removes a reply');
select results_eq($$ select comment_count from public.post_cards(array[pg_temp.v('p')]) $$, $$ values (1) $$,
  'the card counts live comments only');

-- Blocks hide comments both ways and stop new ones
reset role;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('c'), pg_temp.uid('a'));
set local role authenticated;
select pg_temp.as_user('c');
select pg_temp.clear_rl();
select is_empty($$ select 1 from public.post_comments where author_id = pg_temp.uid('a') $$, 'the blocker sees none of A''s comments');
reset role;
delete from public.blocks;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('b'));
set local role authenticated;
select pg_temp.as_user('b');
select pg_temp.clear_rl();
select throws_ok($$ select public.add_comment(pg_temp.v('p'), null, 'let me in') $$, 'P0002', null,
  'someone the author blocked can''t comment');
reset role;
delete from public.blocks;
set local role authenticated;

-- Hides and mutes take posts out of the feeds, not out of the author's profile
select pg_temp.as_user('b');
select results_eq($$ select count(*)::integer from public.list_posts('university') where id = pg_temp.v('p') $$, $$ values (1) $$, 'B sees the post');
select lives_ok($$ select public.hide_post(pg_temp.v('p'), true) $$, 'B hides it ("Not for me")');
select results_eq($$ select count(*)::integer from public.list_posts('university') where id = pg_temp.v('p') $$, $$ values (0) $$, 'gone from B''s feed');
select lives_ok($$ select public.hide_post(pg_temp.v('p'), false) $$, 'and back after un-hiding');
select lives_ok($$ select public.mute_user('cm_a', true) $$, 'B mutes A');
select results_eq($$ select count(*)::integer from public.list_posts('university') where id = pg_temp.v('p') $$, $$ values (0) $$,
  'a muted author''s posts leave the feed');
select results_eq($$ select count(*)::integer from public.list_posts('author', 'all', null, null, pg_temp.uid('a')) $$, $$ values (1) $$,
  'but stay on the author''s profile');
select results_eq($$ select username from public.my_mutes() $$, $$ values ('cm_a'::text) $$, 'B sees her mutes');

select * from finish();
rollback;
