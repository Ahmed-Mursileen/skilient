# Gateway webhook fixtures

Bodies of the webhook events each real adapter understands, used by `tests/unit/billing-gateways.test.ts` and
`tests/worker/billing-webhooks.test.ts`. The tests sign each body with a test secret using the gateway's documented
scheme (Paddle: `ts:body` HMAC-SHA256; Safepay: HMAC-SHA512 of `JSON.stringify(data)`), then check that the adapter
accepts it, rejects a tampered or stale copy, and normalises it.

**Provenance.** No merchant account or sandbox exists yet (decisions.md 2026-10-05), so these bodies are built from
the gateways' public documentation and examples, not recorded from a sandbox. Step 6 of "Switching to a real
gateway" in `docs/setup-checklist.md` replaces each file with a real sandbox delivery (body only; never commit a
signature header or a secret) and re-runs the tests. Anything the adapters mark `CONFIRM` is checked then.

- `paddle/transaction.completed.json`: a first payment from our checkout (`custom_data.session_id`).
- `paddle/transaction.completed.recurring.json`: a renewal Paddle ran itself (`origin: subscription_recurring`).
- `paddle/transaction.payment_failed.json`: a declined payment.
- `paddle/adjustment.updated.json`: an approved full refund.
- `paddle/customer.updated.json`: an event we acknowledge and ignore.
- `safepay/payment.created.json`: a paid tracker for our checkout (`metadata.order_id`).
- `safepay/refund.created.json`: a refund.
