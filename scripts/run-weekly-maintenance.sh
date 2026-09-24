#!/usr/bin/env bash
# scripts/run-weekly-maintenance.sh
# Non-interactive entrypoint for GnuNae weekly maintenance routine.
# Can be executed by macOS launchd, Antigravity, cron, or manually.

set -eo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/.opencode/bin:$PATH"

# Load NVM if present and switch to Node 22
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || true
fi

REPO_DIR="/Users/wondong/Projects/GnuNae"
RUNNER="$REPO_DIR/scripts/weekly-maintenance-runner.js"

if [ ! -f "$RUNNER" ]; then
    echo "[ERROR] Runner script not found at $RUNNER" >&2
    exit 1
fi

exec node "$RUNNER" "$@"
