#!/usr/bin/env bash
# PRD AC-7.4: memory entries MUST NOT contain raw 0x-hex signatures.
# An Ethereum signature is 65 bytes = 130 hex chars (+ "0x" prefix = 132 chars).
# This script greps every string value in data/memory.jsonl for the
# `^0x[0-9a-fA-F]{130,}$` pattern via jq and exits != 0 if any match.
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

TARGET="${1:-data/memory.jsonl}"

if [ ! -f "$TARGET" ]; then
  echo "[memory_hygiene_lint] no memory file at $TARGET — nothing to check"
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[memory_hygiene_lint] FAIL: jq required"
  exit 2
fi

leaks=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  count=$(printf '%s' "$line" | jq -r '[..|strings|select(test("^0x[0-9a-fA-F]{130,}$"))] | length' 2>/dev/null || echo 0)
  if [ "$count" != "0" ] && [ -n "$count" ]; then
    echo "[memory_hygiene_lint] FAIL: raw 0x-hex signature in memory entry: $line"
    leaks=$((leaks + count))
  fi
done < "$TARGET"

if [ "$leaks" -ne 0 ]; then
  echo "[memory_hygiene_lint] FAIL: $leaks raw 0x-hex signature string(s) found in $TARGET (PRD AC-7.4)"
  exit 1
fi

echo "[memory_hygiene_lint] OK ($TARGET clean of raw 0x-hex signatures)"
exit 0
