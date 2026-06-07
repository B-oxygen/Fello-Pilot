#!/usr/bin/env bash
# Maps: E1 (<details>+JSON.stringify on product surface), E2 (fake 0x txHash / explorer URL in mock).
# Also enforces PRD AC-6.3 H1 receipt invariant: any JSON file passed as a CLI
# arg (or data/execution_receipt.json by default) MUST NOT have simulated:true
# AND a populated txHash at the same time.
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

fail=0

# H1 invariant check on receipt-shaped JSON fixtures.
#   Usage: honesty_lint.sh [path-to-receipt.json ...]
#   With no args, falls back to data/execution_receipt.json if it exists.
# Rule: simulated:true => txHash MUST be absent/null AND explorerUrl MUST be
# absent/null. ANY non-null value (even "0x", even an empty string, even
# arbitrary text) is a violation. Catches:
#   - simulated:true + fake 0x... hash
#   - simulated:true + explorerUrl only
#   - simulated:true + txHash:"0x"  (short / empty hex)
#   - simulated:true + txHash:""    (empty string)
check_receipt_fixture() {
  local path="$1"
  if [ ! -f "$path" ]; then
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "[honesty_lint] WARN: jq not available, skipping H1 receipt invariant on $path"
    return 0
  fi
  # Validate JSON parses; refuse silently fail-open on malformed fixtures.
  if ! jq empty "$path" 2>/dev/null; then
    echo "[honesty_lint] FAIL: $path is not valid JSON"
    fail=1
    return 0
  fi
  local sim has_tx has_exp tx exp
  # Treat any truthy .simulated value (literal true, integer 1, non-empty
  # string, etc.) as "claims to be simulated". Only literal false / null /
  # missing should opt-out — defends against type-coercion smuggling like
  # `{ "simulated": 1, "txHash": "0xfake" }` which the previous comparison
  # (string "true" vs raw value) silently let through (Oracle round 8).
  sim=$(jq -r '(.simulated // false) != false' "$path")
  has_tx=$(jq -r '(.txHash != null) and (.txHash != "")' "$path")
  has_exp=$(jq -r '(.explorerUrl != null) and (.explorerUrl != "")' "$path")
  tx=$(jq -r '.txHash // "<absent>"' "$path")
  exp=$(jq -r '.explorerUrl // "<absent>"' "$path")
  if [ "$sim" = "true" ]; then
    if [ "$has_tx" = "true" ]; then
      echo "[honesty_lint] FAIL: H1 invariant violated in $path — simulated:true with non-null/non-empty txHash=$tx"
      fail=1
    fi
    if [ "$has_exp" = "true" ]; then
      echo "[honesty_lint] FAIL: H1 invariant violated in $path — simulated:true with non-null/non-empty explorerUrl=$exp"
      fail=1
    fi
  fi
}

if [ $# -gt 0 ]; then
  for arg in "$@"; do
    check_receipt_fixture "$arg"
  done
elif [ -f data/execution_receipt.json ]; then
  check_receipt_fixture data/execution_receipt.json
fi

# E2 — hard-coded transaction-hash literals inside mock/sim/fake/stub files.
hash_pat='0x[0-9a-fA-F]{64}'
expl_pat='(etherscan\.io|basescan\.org|polygonscan\.com|blockscan\.com)/tx/'
mock_path_re='(mock|sim|fake|stub)'

if [ -d src ]; then
  if hits=$(grep -REn --include='*.ts' --include='*.tsx' --include='*.js' \
                    --exclude-dir=node_modules --exclude-dir=.next \
                    -E -- "$hash_pat" src/ 2>/dev/null); then
    bad=$(printf '%s\n' "$hits" | grep -Ei "$mock_path_re" || true)
    if [ -n "$bad" ]; then
      echo "[honesty_lint] FAIL: hardcoded 0x... hash in mock/sim path:"
      printf '%s\n' "$bad"
      fail=1
    fi
  fi
  if hits=$(grep -REn --include='*.ts' --include='*.tsx' --include='*.js' \
                    --exclude-dir=node_modules --exclude-dir=.next \
                    -E -- "$expl_pat" src/ 2>/dev/null); then
    echo "[honesty_lint] FAIL: explorer URL hardcoded — only real receipts may carry one:"
    printf '%s\n' "$hits"
    fail=1
  fi
fi

# E1 — debug surface on a product page (anything under app/ except app/harness/).
if [ -d app ]; then
  while IFS= read -r f; do
    if grep -lE '<details' "$f" >/dev/null && grep -lE 'JSON\.stringify' "$f" >/dev/null; then
      echo "[honesty_lint] FAIL: debug surface on product page: $f"
      fail=1
    fi
  done < <(find app -type f \( -name '*.tsx' -o -name '*.ts' \) \
                    -not -path 'app/harness/*' 2>/dev/null)
fi

[ "$fail" -eq 0 ] && echo "[honesty_lint] OK"
exit "$fail"
