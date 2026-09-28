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
3. **Post images are public-read by URL** (slice 3). Like avatars, post images sit in a
   public bucket under unguessable paths, so anyone holding an image's URL can open it,
   even for a University-only post. *Assumed:* fine (fast, cacheable). *Option:* a private
   bucket with short-lived signed URLs (one extra request per image, no CDN caching).
4. **Staff announcements** (slice 3). *Assumed:* platform news goes to every feed (both
   University and Global), one pinned at a time for up to 7 days. University admins and
   faculty get per-university announcements in phases 7 and 9.
5. **Shipped posts** (slice 3). *Assumed:* authored by the venture owner, worded
   "<owner> shipped <title>.", posted to the Global Feed for Public ventures and the
   University Feed for University-only ones, and not at all for Unlisted ventures.
6. **Link preview images** (slice 4). *Assumed:* no preview image on cards (title,
   description and site only), for privacy and the CSP. *Option:* fetch the image through
   our own server (re-encoded like post images) so it can be shown without exposing readers.
7. **Human step** (slice 2): set the Edge Function secrets `RESEND_API_KEY`, `EMAIL_FROM`
   and `APP_URL` on the Supabase project (setup checklist, "Phase 3"). Until then,
   notifications are in-app only.

## Answered

- **Friends and university-only profiles** (slice 1): friends see university-only profiles
  too; visibility is one ladder with one full profile. Done in slice 1.
