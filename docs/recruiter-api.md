# Recruiter API v1

For organisations with the `api.access` entitlement (Growth and above; test grants until phase 10). An admin creates tokens and
webhooks at `/org/settings/api`. A token is shown once; Skilient stores only its hash. 60 requests a minute per token
(`429` with `Retry-After`).

The API never lists the talent pool. It returns only students your organisation has a link with: an application to one of your
jobs, or an accepted contact request or a shortlist entry while the student is recruiter-visible. A student who blocks your company
or turns visibility off disappears from it.

```
Authorization: Bearer skl_…
```

| Route | Returns |
| --- | --- |
| `GET /api/v1/candidates/{id}` | The student's current signed CV: `code`, `issued_at`, `expires_at`, `key_id`, `public_key`, `snapshot`, `snapshot_hash`, `signature`. Check it like `/verify/{code}`; keys are at `/.well-known/skilient-cv-keys.json`. |
| `GET /api/v1/shortlists` | Your organisation's shortlists. |
| `GET /api/v1/shortlists/{id}/candidates` | The visible candidates on one list: `candidate_id`, `name`, `added_at`. |
| `GET /api/v1/jobs/{id}/applications` | Applications to one of your jobs: `id`, `candidate_id`, `stage`, `applied_at`, `note`, `cv_code`. |

Errors are `{"error": "invalid_token" | "not_allowed" | "rate_limited" | "not_found" | "unavailable"}` with status 401, 403, 429,
404 and 503.

## Webhooks

Events: `application.created` and `contact.accepted`. The body is JSON:
`{"event", "org_id", "created_at", "data": {"application_id" | "contact_request_id", "job_id", "candidate_id", …}, "delivery_id", "attempt"}`.
`candidate_id` works with `GET /api/v1/candidates/{id}`.

Each delivery is signed:

```
X-Skilient-Signature: t=1760000000,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with your signing secret>
X-Skilient-Event: application.created
```

Rebuild the HMAC from the raw body, compare in constant time, and reject a `t` older than five minutes. Answer with any 2xx. Redirects
are not followed. A failure retries after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours; 30 failures in a row pause the webhook.
Endpoints must be `https` on a public host name.
