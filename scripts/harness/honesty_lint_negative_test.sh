#!/usr/bin/env bash
# PRD AC-6.3 negative-control: prove that honesty_lint.sh actually catches
# H1 receipt-invariant violations. Without this script the linter's
# "exit 0 = clean" claim would be untrusted — it could silently fail-open.
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

LINT="bash scripts/harness/honesty_lint.sh"

assert_reject() {
  local fixture="$1"
  local label="$2"
  echo "=== Negative case: $label ==="
  echo "  expecting: honesty_lint.sh $fixture exit != 0"
  set +e
  $LINT "$fixture" >/tmp/honesty_neg.out 2>&1
  local ec=$?
  set -e
  cat /tmp/honesty_neg.out
  echo "  actual exit: $ec"
  if [ "$ec" -eq 0 ]; then
    echo "FAIL: honesty_lint.sh accepted $fixture — H1 invariant is NOT enforced for this shape."
    exit 1
  fi
  echo "  PASS"
  echo
}

assert_accept() {
  local fixture="$1"
  local label="$2"
  echo "=== Positive control: $label ==="
  echo "  expecting: honesty_lint.sh $fixture exit == 0"
  set +e
  $LINT "$fixture" >/tmp/honesty_pos.out 2>&1
  local ec=$?
  set -e
  cat /tmp/honesty_pos.out
  echo "  actual exit: $ec"
  if [ "$ec" -ne 0 ]; then
    echo "FAIL: honesty_lint.sh rejected $fixture — false positive."
    exit 1
  fi
  echo "  PASS"
  echo
}

assert_reject scripts/harness/adapter_fixtures/dishonest_receipt.json \
  "simulated:true + fake 0x... txHash + fake explorerUrl"
assert_reject scripts/harness/adapter_fixtures/dishonest_explorer_only.json \
  "simulated:true + explorerUrl only (no txHash)"
assert_reject scripts/harness/adapter_fixtures/dishonest_short_txhash.json \
  "simulated:true + txHash:'0x' (no hex body)"

assert_accept scripts/harness/adapter_fixtures/honest_simulated_receipt.json \
  "simulated:true + txHash absent + explorerUrl absent"

echo "=== honesty_lint_negative_test: ALL PASS (AC-6.3, includes edge cases) ==="
exit 0
