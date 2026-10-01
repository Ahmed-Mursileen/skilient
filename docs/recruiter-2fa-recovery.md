# Recruiter locked out of two-factor (until phase 11)

The staff "reset 2FA" action in `/ops` arrives in phase 11 (decisions.md, 2026-09-28). A recruiter without their authenticator or
backup codes can't open the portal (it needs two-factor in the route and in the database), so until then a **super admin** resets
it by hand. This needs an identity check first: it removes the only thing between an attacker and a company's candidate data.

## 1. Check it is them

1. The request must come from the recruiter's **work email** (the one on the account). If it comes from anywhere else, answer
   from the work email address and wait for a reply there.
2. Ask a **different admin of the same organisation** to confirm in writing (reply from their work email), or, for a sole admin,
   check that the company website lists them (or call a switchboard number from the company website, not one they give you).
3. Write down who confirmed, how and when. You need it for step 3.

## 2. Remove the factors

In the Supabase **SQL Editor** (replace `<recruiter user id>`; find it with
`select id from auth.users where email = lower('<work email>');`):

```sql
delete from auth.mfa_factors where user_id = '<recruiter user id>';
delete from private.mfa_backup_codes where user_id = '<recruiter user id>';
-- Signs out every device: the old sessions may carry two-factor.
delete from auth.sessions where user_id = '<recruiter user id>';
```

What this does: the next sign-in has no second step, and the portal sends the recruiter to **Settings → Security** to turn two-factor
on again before it shows anything. Nothing about the organisation, shortlists or notes changes.

## 3. Record it in `ops_audit_log`

```sql
insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, after)
values (
  '<your user id>',
  'recruiter_2fa_reset',
  'user',
  '<recruiter user id>',
  '<who asked, who confirmed, how, when>',
  jsonb_build_object('via', 'sql_editor')
);
```

## 4. Tell them

Email the recruiter from the Skilient address: two-factor was reset after the identity check, sign in and turn it on straight away,
and keep the new backup codes somewhere other than the authenticator's device. If you didn't hear from them first, also email the
organisation's other admins that a reset happened.
