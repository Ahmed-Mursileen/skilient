# Skilient

Prove it. Don't claim it. A university-gated platform where Pakistani students prove skills through real project work and turn that proof into a signed, verifiable CV.

- Rules for contributors and Claude Code: [`CLAUDE.md`](CLAUDE.md)
- What to build next: [`docs/build-plan.md`](docs/build-plan.md)
- Spec: [`docs/prd/README.md`](docs/prd/README.md) · screens: [`docs/screen-spec.md`](docs/screen-spec.md) · decisions: [`docs/decisions.md`](docs/decisions.md)
- Accounts and keys a human must set up: [`docs/setup-checklist.md`](docs/setup-checklist.md)

## Quick start

Needs Node 22, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env.local        # then fill the Supabase URL + publishable key from `pnpm exec supabase status`
pnpm db:start && pnpm db:reset    # local Supabase, rebuilt from migrations + seed
pnpm dev                          # http://localhost:3000 (UI gallery at /ui)
```

Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:test`, then `pnpm build && pnpm test:e2e`.
