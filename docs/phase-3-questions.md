# Phase 3: questions and decisions for Ahmed

Running list kept while the phase 3 slices are built and merged. Each item says what was
assumed so the work could continue; answer inline (or in chat) and the assumption is
either kept or changed in a follow-up PR. Answered items move to `docs/decisions.md`.

## Open

None. All answered 2026-09-30 (decisions.md).

## Answered

- **Friends and university-only profiles** (slice 1): friends see university-only profiles
  too; visibility is one ladder with one full profile. Done in slice 1.
- **Email budget** (2026-09-30): Supabase Auth emails share the Resend account, so
  notification emails stop at 60 a day; auth and security emails are never counted or
  held. Upgrade Resend to a paid plan before the closed beta (setup checklist).
- **Digest time**: 18:07 PKT, kept.
- **Post images**: public bucket kept; files are now deleted when the post is deleted or
  removed by moderation.
- **Staff announcements** and **Shipped posts**: as assumed.
- **Link preview images**: none for now.
- **Explore**: names and usernames across all universities (card fields, anti-scraping
  guards kept); department and batch only reach your own university plus Global profiles.
- **Chat reactions**: one per person.
- **Moderation notices**: removals and warnings are instant email by default.
- **Moderator powers**: also clear a profile's bio and photo and unlist a venture, audited;
  suspend and ban stay in phase 11.
- **Human step**: the Edge Function secrets `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` are set.
