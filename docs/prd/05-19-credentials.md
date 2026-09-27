### 5.19 Credentials

- Students upload certificates (PDF or image, ≤ 10 MB) with issuer and dates; an admin approves or rejects.
- Issuers on an admin-managed recognised list get the 1.5× multiplier; expired credentials drop out of the score automatically.

#### Build: credentials

- **Upload:** `app/me/credentials/page.tsx`; files to private bucket `credentials/{user_id}/{uuid}` (PDF, JPG, PNG ≤ 10 MB); `submitCredential(issuer, title, issuedOn, expiresOn?, path)` inserts `credentials` with `status = pending`.
- **Review:** the `/ops` trust queue shows the file through a signed URL; `reviewCredential(id, approve, reason)` sets status, verified\_at, reviewer, and matches issuer against `recognised_issuers` (staff-managed list) to set recognised.
- **Expiry:** a daily job marks credentials past `expires_on` as expired; ranking drops them automatically.
- **Done when:** unapproved credentials never reach the CV or ranking; other users can't read the files.
