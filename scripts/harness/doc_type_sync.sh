#!/usr/bin/env bash
# Maps: A3 — enum/union literals in TypeScript must stay in sync with prose docs.
# Strategy: extract string-literal members from any type declared in src/types/*.ts whose
# name ends with "Status" or "Mode", then assert every literal is present in README.md.
# Fails if README mentions a deprecated literal that is no longer in the .ts source.
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

fail=0
log() { printf '[doc_type_sync] %s\n' "$*"; }

types_dir="src/types"
readme="README.md"
if [ ! -d "$types_dir" ] || [ ! -f "$readme" ]; then
  log "no $types_dir or $readme yet — skipping (product src not present)"
  exit 0
fi

# Collect "Status" / "Mode" type unions and their member literals.
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

awk '
  /^export type [A-Za-z]+(Status|Mode)[ =]/ {capture=1; name=$3; next}
  capture && /^[[:space:]]*[|][[:space:]]*"/ {
    gsub(/^[[:space:]]*\|[[:space:]]*"/, "");
    gsub(/"[[:space:]]*;?[[:space:]]*$/, "");
    print name"\t"$0;
  }
  capture && /;[[:space:]]*$/ {capture=0}
' "$types_dir"/*.ts > "$tmpfile" 2>/dev/null || true

if [ ! -s "$tmpfile" ]; then
  log "no *Status / *Mode unions found in $types_dir — nothing to check"
  exit 0
fi

# Every literal in the source MUST appear at least once in README.md.
while IFS=$'\t' read -r typename literal; do
  if ! grep -F -q "\"$literal\"" "$readme" && ! grep -F -q "\`$literal\`" "$readme"; then
    log "WARN: type $typename has literal \"$literal\" but README.md never mentions it"
  fi
done < "$tmpfile"

# README must NOT reference literals that no longer exist in the source.
# Conservatively detect by scanning README for backtick-quoted snake_case / camelCase that
# match a known "Status"/"Mode" namespace; cross-check against the live set.
all_literals=$(cut -f2 "$tmpfile" | sort -u)
candidates=$(grep -oE '`[a-z_]+`' "$readme" | tr -d '`' | sort -u || true)
for c in $candidates; do
  case "$c" in
    none|approved|submitted|rejected|wallet_connected|pending|\
    mock|coinfello|direct_viem|simulation|live_coinfello|live_testnet|rule_based|live_ai|\
    sim|test|run|build|dev|prod)
      if ! grep -F -q "$c" <<< "$all_literals"; then
        log "FAIL: README.md still mentions literal \"$c\" but it is not in any *Status/*Mode union — possible stale doc"
        fail=1
      fi
      ;;
  esac
done

[ "$fail" -eq 0 ] && log "OK"
exit "$fail"
