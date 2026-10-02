# Someone locked out of two-factor

For anyone who has lost both their authenticator and their backup codes: recruiters, university admins, staff, or students who
turned two-factor on. Since phase 11 a **super admin** resets it in `/ops` (decisions.md 2026-09-28 and "Phase 11"). It is the last
resort: it removes the only thing between an attacker and the account (for a recruiter, a company's candidate data), so check
identity first, every time.

## 1. Check it is them

1. The request must come from the account's **own email address**. If it comes from anywhere else, answer to the account's email
   address and wait for a reply there.
2. Confirm by a second route:
   - **Recruiter:** a different admin of the same organisation confirms in writing from their work email; for a sole admin, check
     that the company website lists them, or call a switchboard number from the company website (not one they give you).
   - **University admin:** the university owner (or, for the owner, the registrar's office through a number on the university
     website) confirms.
   - **Student or faculty:** a short video call where they show their university ID card, matching the profile name.
3. Write down who asked, who confirmed, how and when. That note is required.

## 2. Reset it in /ops

1. `/ops/users` → search the email → open the record.
2. **Reset two-factor** (super admins only): paste the identity-check note (at least 20 characters) → **Reset two-factor**.

What this does, in one step: every authenticator and backup code is removed, every device is signed out, the note goes into
`ops_audit_log` with the before/after (`user.mfa_reset`), the person gets an in-app notice and a security email telling them to
turn two-factor on again. Portals that need two-factor (`/recruit`, `/org`, `/uni`, `/ops`) send them to Settings → Security
before showing anything. Nothing else about the account, organisation or university changes.

## 3. Afterwards

If the request didn't come from them first, also tell the organisation's other admins (or the university owner) that a reset
happened. Never reset your own two-factor this way; another super admin does it.
