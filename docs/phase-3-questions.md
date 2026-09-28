# Phase 3: questions and decisions for Ahmed

Running list kept while the phase 3 slices are built and merged. Each item says what was
assumed so the work could continue; answer inline (or in chat) and the assumption is
either kept or changed in a follow-up PR. Answered items move to `docs/decisions.md`.

## Open

1. **Email budget and security emails** (slice 2). Only notification emails are counted:
   a warning is logged past 80 a day, and at Resend's limit (~100) the queue waits for the
   next day. The app's security emails (new-device alerts, lock notices) use the same
   Resend account but aren't counted, so a busy day could crowd them out.
   *Assumed:* leave it. *Option:* stop notification emails at ~85 a day to keep ~15 for
   security emails.
2. **Digest time** (slice 2). *Assumed:* 18:07 Pakistan time daily. Change it?
3. **Human step** (slice 2): set the Edge Function secrets `RESEND_API_KEY`, `EMAIL_FROM`
   and `APP_URL` on the Supabase project (setup checklist, "Phase 3"). Until then,
   notifications are in-app only.

## Answered

- **Friends and university-only profiles** (slice 1): friends see university-only profiles
  too; visibility is one ladder with one full profile. Done in slice 1.
