#!/bin/bash
# SessionStart hook for Claude Code on the web: prepares the cloud container so
# lint, typecheck, unit tests and (on demand) the local Supabase stack work.
# Local machines are left alone: Ahmed doesn't run Docker/Supabase locally.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# 1. Dependencies. `pnpm install` (not --frozen-lockfile) so the cached container
#    is reused; it still honours pnpm-lock.yaml and never rewrites it unless
#    package.json changed.
pnpm install --prefer-offline

# 2. Docker, needed by `pnpm db:start` (local Supabase for pgTAP) and gitleaks.
#    The container doesn't start the daemon itself. Idempotent: skipped if running.
if command -v dockerd >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  setsid nohup dockerd >/tmp/dockerd.log 2>&1 < /dev/null &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  if docker info >/dev/null 2>&1; then
    echo "session-start: Docker is running"
  else
    echo "session-start: Docker didn't start (see /tmp/dockerd.log); pgTAP will only run in CI" >&2
  fi
fi

# 3. Playwright: use the preinstalled Chromium instead of downloading one.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  echo 'export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# Local Supabase is left to the session (`pnpm db:start`): it takes ~1 min
# (several on a fresh container) and only database work needs it.
