# CV signing keys (backup copies)

Copies of `https://skilient.com/.well-known/skilient-cv-keys.json` (until the domain moves:
`https://skilient.vercel.app/.well-known/skilient-cv-keys.json`), committed after every key
rotation (decisions.md 2026-10-01). The Supabase Free plan has no database backups; these files
let anyone check an old CV's signature even if `signing_keys` were lost. They hold public keys
only: never put a private key here.

Name each copy by the date it was saved: `YYYY-MM-DD.json`.
