#!/usr/bin/env bash
# Maps: A1 (claimed-removed term still present in repo).
# Configure: .omo/rules/forbidden-tokens.txt (one literal token per line, '#' for comments).
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

token_file=".omo/rules/forbidden-tokens.txt"
fail=0

if [ ! -f "$token_file" ]; then
  echo "[forbidden_grep] no $token_file — skipping"
  exit 0
fi

product_dirs=()
for d in src app components packages public; do
  [ -d "$d" ] && product_dirs+=("$d")
done
if [ "${#product_dirs[@]}" -eq 0 ]; then
  echo "[forbidden_grep] no product source roots (src/app/components/packages/public) — nothing to scan yet"
  exit 0
fi

while IFS= read -r tok; do
  [ -z "$tok" ] && continue
  case "$tok" in '#'*) continue ;; esac
  hits=$(grep -RIn \
    --exclude-dir=node_modules --exclude-dir=.next \
    --exclude-dir=harness --exclude-dir=harness-internal \
    -- "$tok" "${product_dirs[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "[forbidden_grep] FAIL: '$tok' still present in product surface:"
    printf '%s\n' "$hits"
    fail=1
  fi
done < "$token_file"

[ "$fail" -eq 0 ] && echo "[forbidden_grep] all tokens absent"
exit "$fail"
