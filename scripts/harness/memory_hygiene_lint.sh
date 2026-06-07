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
line_no=0
while IFS= read -r line; do
  line_no=$((line_no + 1))
  [ -z "$line" ] && continue
  # Refuse to fail-open on malformed JSONL — a corrupt line could otherwise
  # hide a leaked signature. If the line is not valid JSON, exit non-zero.
  if ! printf '%s' "$line" | jq empty 2>/dev/null; then
    echo "[memory_hygiene_lint] FAIL: malformed JSON on line $line_no of $TARGET (refusing to fail-open)"
    exit 2
  fi
  count=$(printf '%s' "$line" | jq -r '[..|strings|select(test("^0x[0-9a-fA-F]{130,}$"))] | length')
  if [ "$count" != "0" ] && [ -n "$count" ]; then
    echo "[memory_hygiene_lint] FAIL: $count raw 0x-hex signature(s) in memory line $line_no: $line"
    leaks=$((leaks + count))
  fi
done < "$TARGET"

if [ "$leaks" -ne 0 ]; then
  echo "[memory_hygiene_lint] FAIL: $leaks raw 0x-hex signature string(s) found in $TARGET (PRD AC-7.4)"
  exit 1
fi

echo "[memory_hygiene_lint] OK ($TARGET clean of raw 0x-hex signatures across $line_no line(s))"
exit 0
