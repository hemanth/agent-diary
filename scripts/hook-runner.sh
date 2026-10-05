#!/bin/sh
# agent-diary lifecycle hook wrapper for Antigravity & Claude Code
# Runs non-blocking in the background when a turn/session stops so zero latency is added.

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# Drain stdin if provided
cat >/dev/null 2>&1 || true

# Trigger background harvest & HTML compilation detached
nohup node "$SCRIPT_DIR/auto-hook.mjs" >/dev/null 2>&1 &

# Emit valid Stop hook JSON response allowing normal stop
printf '{"decision":"allow"}\n'
exit 0
