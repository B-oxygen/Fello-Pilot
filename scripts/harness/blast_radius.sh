#!/usr/bin/env bash
# Maps: B1 (enum-level analysis missed string-literal narrowing).
# Usage: bash scripts/harness/blast_radius.sh "<literal-value>"
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

val="${1:-}"
if [ -z "$val" ]; then
  echo "usage: $0 <literal-value>" >&2
  exit 2
fi

dirs=()
for d in src app scripts .omo; do [ -e "$d" ] && dirs+=("$d"); done
if [ "${#dirs[@]}" -eq 0 ]; then
  echo "[blast_radius] no search roots present (src/app/scripts/.omo) — nothing to scan"
  exit 0
fi

echo "[blast_radius] occurrences of \"$val\" / '$val' / bare $val across: ${dirs[*]}"
grep -RIn \
  --exclude-dir=node_modules --exclude-dir=.next \
  -e "\"$val\"" -e "'$val'" -e "\\b$val\\b" \
  "${dirs[@]}" 2>/dev/null || true
echo "[blast_radius] review the above before removing or renaming the literal"
