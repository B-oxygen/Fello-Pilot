#!/usr/bin/env bash
# Maps: F2 (RPC ping), G2 (.next mode marker), G3 (stale process kill).
# Usage: bash scripts/harness/preflight.sh [dev|build]
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

fail=0
log() { printf '[preflight] %s\n' "$*"; }

# G3 — kill stale next/dev servers; verify port 3000 is free.
pkill -f "next-server" 2>/dev/null || true
pkill -f "next dev"    2>/dev/null || true
if command -v lsof >/dev/null && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  log "FAIL: port 3000 still occupied"
  lsof -nP -iTCP:3000 -sTCP:LISTEN
  fail=1
else
  log "OK: port 3000 free"
fi

# G2 — purge .next when the run mode flips (dev vs build share the cache).
mode="${1:-dev}"
marker="scripts/harness/.last-run-mode"
if [ -f "$marker" ]; then
  prev=$(cat "$marker")
  if [ "$prev" != "$mode" ] && [ -d .next ]; then
    log "mode flip $prev -> $mode, purging .next"
    rm -rf .next
  fi
fi
echo "$mode" > "$marker"

matrix="scripts/harness/capability_matrix.json"
if [ -f "$matrix" ] && command -v jq >/dev/null && command -v curl >/dev/null; then
  while IFS= read -r url; do
    [ -z "$url" ] && continue
    code=$(curl -sS --max-time 5 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      log "OK: $url (HTTP $code, reachable)"
    else
      log "FAIL: $url unreachable (connection/DNS/TLS error)"
      fail=1
    fi
  done < <(jq -r '.endpoints[]?.url // empty' "$matrix")
fi

if [ "$fail" -ne 0 ]; then
  log "aborting"
  exit 1
fi
log "all checks passed"
