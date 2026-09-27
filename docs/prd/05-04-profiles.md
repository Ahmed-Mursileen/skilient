### 5.4 Profiles

- `/profile/[username]`: avatar, cover image, name, username, university, department, batch, bio, GitHub link, skills as level chips (L1–L4) that open their evidence, tier badge. L0 skills are never shown to others.
- Visibility setting: `friends` | `university` | `global`, enforced by RLS. A restricted viewer sees only the public card (name, department, batch). Friends must see a friends-only profile in full (the reference build wrongly hides it from everyone).
- Actions on another user's profile: Add friend / Request sent, Message (friends only), Report.
- `/profile/edit`: identity fields, visibility, avatar and cover upload, private L0 skills. GitHub connection, repo exclusions, resync and disconnect live in Settings → GitHub (section 5.5). Replacing an image deletes the old storage object.

#### Build: profiles

- **Routes:** `app/profile/[username]/page.tsx` (server component; tabs are nested segments `overview`, `ventures`, `skills`, `activity`), `app/settings/profile/page.tsx` (edit).
- **Read path:** `lib/data/profiles.ts#getProfile(username)` selects from `profiles` with RLS; if no row comes back but `profiles_public_card` has one, render the restricted card. Visibility is decided only by the RLS policy `profiles_select_visible`: owner, or `global`, or `university` + same `university_id`, or `friends` + `are_friends(auth.uid(), user_id)` (security-definer function to avoid recursive policies), and never if either user blocked the other (`is_blocked(a, b)`).
- **Skills:** the Skills tab reads `user_skills` joined to `skills` where `level >= 1`, plus the owner's L0 list only when `auth.uid() = user_id`.
- **Edit:** server action `updateProfile(input)` with Zod (name 2–60, bio ≤ 280, department from list, visibility enum, `looking_for` ≤ 120); `count: exact` write check.
- **Avatar and cover:** client crops (react-easy-crop) to 512×512 / 1500×500, uploads to `avatars/{user_id}/{uuid}.webp` (storage policy: insert/delete only under own folder, ≤ 5 MB / 8 MB, `image/*`); server action `setAvatar(path)` verifies the path prefix, updates the row, then deletes the previous object.
- **Actions on others:** Add friend, Message (visible only if friends), Report; all server actions (sections 5.8, 5.9, 5.12).
- **Done when:** RLS tests for each visibility × viewer (owner, friend, same university, other university, blocked) return exactly the expected rows; image replace leaves no orphan objects.
