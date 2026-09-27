-- Profile image buckets (PRD 5.4): public read of the files, writes only into your own folder.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('50000000-0000-0000-0000-00000000000b', 'b@nu.edu.pk');

select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('avatars', 'covers') order by id $$,
  $$ values ('avatars', true, 5242880::bigint, array['image/webp']), ('covers', true, 8388608::bigint, array['image/webp']) $$,
  'avatars (5 MB) and covers (8 MB) accept WebP only'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "50000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '50000000-0000-0000-0000-00000000000a/one.webp', '50000000-0000-0000-0000-00000000000a') $$,
  'A uploads into her own avatar folder');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('covers', '50000000-0000-0000-0000-00000000000a/one.webp', '50000000-0000-0000-0000-00000000000a') $$,
  'A uploads into her own cover folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '50000000-0000-0000-0000-00000000000b/evil.webp', '50000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'A cannot upload into B''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', 'loose.webp', '50000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'A cannot upload outside a user folder');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "50000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is_empty(
  $$ select 1 from storage.objects where name like '50000000-0000-0000-0000-00000000000a/%' $$,
  'B cannot list A''s objects through the API');
reset role;

-- Storage refuses direct SQL deletes (only its API deletes), so check the policy it applies.
select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'profile_images_delete_own'
       and cmd = 'DELETE' and roles = array['authenticated']::name[]
       and qual like '%storage.foldername(name)%' and qual like '%auth.uid()%'
  ),
  'deleting a profile image is limited to your own folder'
);

set local role anon;
select is_empty($$ select 1 from storage.objects where bucket_id in ('avatars', 'covers') $$,
  'signed-out visitors cannot list profile images');
reset role;

select * from finish();
rollback;
