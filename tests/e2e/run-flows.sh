#!/usr/bin/env bash
# Runs every journey section in its own browser process and prints a combined summary.
# Usage: BASE_URL=http://localhost:3100 tests/e2e/run-flows.sh
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
fail=0
for s in A B C D E F G; do
  ONLY=$s timeout 400 node "$(dirname "$0")/flows.mjs" 2>&1 | grep -E "^(✓|✗|FAILURE)" || true
  [ "${PIPESTATUS[0]}" -eq 0 ] || fail=1
done
exit $fail
