### 5.22 Multi-university and global feed

- Adding a university is a data row (name, one or more email domains, logo) plus a university-admin account.
- Posts get an audience selector (my university or global). A global feed and global explore sit alongside the university views, and cross-university ventures are allowed.

#### Build: multi-university and global feed

- **Data:** `universities(id, name, slug, logo_path, final_year_batch, customisation jsonb)` and `university_domains(university_id, domain, kind)` (5.27), all HEC universities preloaded (5.23); Accounts staff edit them in `/ops`.
- **University admins:** `university_admins(university_id, user_id, role)` with seats checked against `uni.admin_seats`.
- **Audience:** `posts.audience` enum university | global (default university); RLS allows global posts to every signed-in user and university posts to the same university; the feed audience switch just changes the query filter.
- **Cross-university ventures:** `ventures.visibility` (5.28): Public ventures accept applicants from any university; University-only ventures refuse other universities; Unlisted ventures accept invites only.
- **Done when:** a second university's students see only global posts from the first; a new domain works for signup immediately after insert.
