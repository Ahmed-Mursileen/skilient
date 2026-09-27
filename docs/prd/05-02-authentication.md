### 5.2 Authentication

- Email + password, or Google sign-in restricted to university-domain accounts (5.27), via Supabase Auth with email confirmation, PKCE, cookies via `@supabase/ssr`.
- Student and faculty signup is domain-gated against `university_domains`; recruiter signup (`/signup/recruiter`) requires a work email and org verification (5.20, 5.26); university admins come in by claim or invite (5.23); staff are granted `staff_roles` by a super admin. Client-side domain checks are for fast feedback only.
- Duplicate email: if `signUp()` returns an empty `identities` array, show "already registered — sign in instead".
- After signup, a "check your inbox" screen listens to `onAuthStateChange` and auto-redirects once confirmed. The confirmation link lands on static `/auth/confirmed`.
- Sign-in routes to `/onboarding` if `onboarding_complete = false`, else `/feed`. Signed-in users hitting `/signin`, `/signup` or `/forgot-password` are redirected the same way.
- Password reset via `/forgot-password` → email → `/reset-password`. `/auth/callback` must honour a `next` parameter (the reference build drops it).
- Sign-out clears all client state; signing in as a different account must show zero residue.

#### Build: authentication

- **Routes:** `app/(auth)/signup`, `signin`, `forgot-password`, `reset-password` (client forms), `app/auth/callback/route.ts` (code exchange; honours a validated same-origin `next` param), `app/auth/confirmed/page.tsx`.
- **Clients:** `lib/supabase/client.ts` (`createBrowserClient`), `lib/supabase/server.ts` (`createClient` with `cookies()`), `lib/supabase/admin.ts` (service role; imported only by Edge Functions, jobs and the billing worker, never by pages or `lib/actions/ops/*`; an ESLint `no-restricted-imports` rule enforces this).
- **Session:** `proxy.ts` calls `getClaims()` to refresh, then `getUser()` for route decisions; public-path list and exact `/` match as in the reference build; matcher excludes static assets.
- **Domain gate:** Auth hook `before-user-created` calls `validate_signup(email, role)`: students and faculty must match `university_domains`; recruiters must not use a personal-mail domain; university-admin and staff accounts must match an open invite or claim. The signup form pre-checks via the cached domain list (5.1).
- **Profile row:** `AFTER INSERT` trigger `handle_new_user()` creates `profiles(user_id, university_id from domain, onboarding_complete = false)`.
- **Duplicate email:** after `signUp()`, if `data.user.identities.length === 0` show "already registered".
- **Check-inbox screen:** subscribes to `onAuthStateChange`; on `SIGNED_IN` routes to `/onboarding` or `/feed` by reading `profiles.onboarding_complete`.
- **Identity context:** `components/providers/CurrentUserProvider.tsx` seeds from the server (`getUser()` in the root layout) and listens to `onAuthStateChange`; `useCurrentUser()` is the only way pages read identity.
- **Sign-out:** server action `signOut()` → `supabase.auth.signOut()`, clears React Query / SWR caches, then hard navigation to `/`.
- **Email:** Supabase Auth custom SMTP = Resend; templates for confirm, reset and email change branded in `supabase/templates/*.html`.
- **Rate limits:** Supabase Auth limits (sign-in 30/h per IP, sign-up 10/h per IP) set in project config.
- **Done when:** E2E: sign up with an allowed domain, a disallowed domain (rejected), a duplicate; confirm in a second tab auto-advances; reset password; sign out and sign in as another user with zero residue.
