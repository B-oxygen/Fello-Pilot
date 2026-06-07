#!/usr/bin/env bash
# PRD M1.5 verifier: no anchor on any product page links to /harness.
# Two-layer check: (a) live render output, (b) source grep for href attrs.
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

BASE="${1:-http://localhost:3000}"

echo "[verify_no_harness_links] scanning $BASE/ rendered HTML for /harness anchors..."
html=$(curl -s --max-time 10 "$BASE/")
if [ -z "$html" ]; then
  echo "[verify_no_harness_links] FAIL: empty response from $BASE/ (dev server up?)"
  exit 1
fi
hits=$(printf '%s' "$html" | grep -oE 'href="[^"]*/harness[^"]*"' || true)
if [ -n "$hits" ]; then
  echo "[verify_no_harness_links] FAIL: rendered HTML contains /harness anchor(s):"
  printf '%s\n' "$hits"
  exit 1
fi
echo "[verify_no_harness_links] rendered HTML clean"

echo "[verify_no_harness_links] scanning src/ for href=\"...harness...\" patterns..."
if [ -d src ]; then
  src_hits=$(grep -REn --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' \
    --exclude-dir=node_modules --exclude-dir=.next \
    -E 'href[[:space:]]*=[[:space:]]*["'\''][^"'\'']*\/harness' src/ 2>/dev/null || true)
  if [ -n "$src_hits" ]; then
    echo "[verify_no_harness_links] FAIL: /harness href in product source:"
    printf '%s\n' "$src_hits"
    exit 1
  fi
fi
echo "[verify_no_harness_links] product source clean"

echo "[verify_no_harness_links] OK"
exit 0
