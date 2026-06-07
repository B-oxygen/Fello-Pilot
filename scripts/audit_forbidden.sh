#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRODUCT="$ROOT/src"

if [ ! -d "$PRODUCT" ]; then
  echo "[audit_forbidden] src/ not found, skipping"
  exit 0
fi

EXTRA_TOKENS=("Judge" "ggui")
FAIL=0

for token in "${EXTRA_TOKENS[@]}"; do
  HITS=$(grep -rn -F "$token" "$PRODUCT" 2>/dev/null | grep -v -E "(.next|node_modules)" || true)
  if [ -n "$HITS" ]; then
    echo "[audit_forbidden] FAIL token '$token' found:"
    echo "$HITS"
    FAIL=1
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "[audit_forbidden] product source clean of: ${EXTRA_TOKENS[*]}"
fi

exit $FAIL
