#!/usr/bin/env bash
# Maps: G1 (npm package binaries not chmod +x → EACCES at runtime).
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

fail=0
log() { printf '[postinstall] %s\n' "$*"; }

if [ ! -d node_modules ]; then
  log "no node_modules — skipping"
  exit 0
fi

while IFS= read -r f; do
  if [ ! -x "$f" ]; then
    log "FAIL: not executable: $f"
    fail=1
  fi
done < <(find node_modules \( -path "*.app/Contents/MacOS/*" -o -path "*/.bin/*" \) -type f 2>/dev/null)

if [ "$fail" -ne 0 ]; then
  log "fix with: chmod +x <files>"
  exit 1
fi
log "all binaries executable"
