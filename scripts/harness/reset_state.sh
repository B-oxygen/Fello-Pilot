#!/usr/bin/env bash
# Maps: D1 (per-demo data dir collision), D2 (no setup/teardown hook).
# Usage:
#   source scripts/harness/reset_state.sh
#   ds=$(reset_state); ... ; teardown_state "$ds"
# Or CLI: bash scripts/harness/reset_state.sh new
#         bash scripts/harness/reset_state.sh drop /abs/path/to/data-dir
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

reset_state() {
  local id dir
  id="$(uuidgen 2>/dev/null || date +%s%N)"
  dir="$HARNESS_ROOT/data/test-$id"
  mkdir -p "$dir"
  for f in delegation risk_report receipt; do
    printf 'null\n' > "$dir/$f.json"
  done
  printf '%s' "$dir"
}

teardown_state() {
  local dir="${1:-}"
  [ -n "$dir" ] && [ -d "$dir" ] && rm -rf "$dir"
}

case "${1:-}" in
  new)  reset_state ;;
  drop) teardown_state "${2:-}" ;;
  "")   ;;
  *)    echo "usage: $0 new|drop <dir>" >&2 ; exit 1 ;;
esac
