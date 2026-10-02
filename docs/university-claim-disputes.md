# University claim disputes (manual, until the phase 11 ops tools)

Decisions.md 2026-10-04 (Ahmed): disputes are fixed by Skilient staff in the SQL editor. Always add an `ops_audit_log`
row in the same transaction, with your own staff user id and a reason the team can read later.

## 1. Two people claim the same university

Only one claim can be open at a time (`university_claims_one_open_idx`), so the second person sees "a claim is already
waiting". Decide the open one first at `/ops/universities`. If it was the wrong person:

1. Reject it there with a reason ("We verified a different official").
2. Tell the right person to send their claim; approve it.

If the wrong person was already approved, follow section 2.

## 2. Replace an owner (left the university, or approved by mistake)

Check the new owner's identity the same way as a claim (letter on letterhead, official email). The new owner needs an
account first: a `university_admin` account (signup at `/signup?role=university_admin`) or a faculty account at that
university. Then, in one transaction:

```sql
begin;
-- who is who
select u.id as university_id, u.name, u.owner_id from public.universities u where u.slug = '<slug>';
select user_id from public.profiles p join auth.users a on a.id = p.user_id where a.email = '<new owner email>';

-- the old owner loses the portal (or becomes an admin: update ... set role = 'admin' instead of delete)
delete from public.university_admins where user_id = '<old owner id>';
-- the new owner (if they already hold a seat, update its role instead)
insert into public.university_admins (user_id, university_id, role) values ('<new owner id>', '<university id>', 'owner')
  on conflict (user_id) do update set role = 'owner', department_id = null;
update public.universities set owner_id = '<new owner id>' where id = '<university id>';

insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
values ('<your staff user id>', 'uni.owner_replace', 'university', '<university id>', '<why, and how identity was checked>',
        jsonb_build_object('owner', '<old owner id>'), jsonb_build_object('owner', '<new owner id>'));
commit;
```

`university_admins_one_owner_idx` refuses two owners, so run the delete (or demotion) before the insert.

## 3. Nobody is left

Delete the seats and clear the owner; the university becomes free and unclaimed, and a new claim can be made. All its data
(ecosphere settings, departments, awards, events) is kept.

```sql
begin;
delete from public.university_admins where university_id = '<university id>';
update public.universities set owner_id = null, claimed_at = null where id = '<university id>';
insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason)
values ('<your staff user id>', 'uni.unclaim', 'university', '<university id>', '<why>');
commit;
```
