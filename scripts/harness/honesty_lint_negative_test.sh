#!/usr/bin/env bash
# PRD AC-6.3 negative-control: prove that honesty_lint.sh actually catches
# H1 receipt-invariant violations. Without this script the linter's
# "exit 0 = clean" claim would be untrusted — it could silently fail-open.
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

LINT="bash scripts/harness/honesty_lint.sh"
DISHONEST=scripts/harness/adapter_fixtures/dishonest_receipt.json
HONEST=scripts/harness/adapter_fixtures/honest_simulated_receipt.json

echo "=== Negative case: dishonest fixture (simulated:true + fake txHash) ==="
echo "  expecting: honesty_lint.sh exit != 0"
set +e
$LINT "$DISHONEST" >/tmp/honesty_neg.out 2>&1
status_dishonest=$?
set -e
cat /tmp/honesty_neg.out
echo "  actual exit: $status_dishonest"
if [ "$status_dishonest" -eq 0 ]; then
  echo "FAIL: honesty_lint.sh accepted the dishonest fixture — H1 invariant is NOT enforced."
  exit 1
fi
echo "  PASS"

echo
echo "=== Positive control: honest SIMULATION fixture (simulated:true, no txHash) ==="
echo "  expecting: honesty_lint.sh exit == 0"
set +e
$LINT "$HONEST" >/tmp/honesty_pos.out 2>&1
status_honest=$?
set -e
cat /tmp/honesty_pos.out
echo "  actual exit: $status_honest"
if [ "$status_honest" -ne 0 ]; then
  echo "FAIL: honesty_lint.sh rejected an honest fixture — false positive."
  exit 1
fi
echo "  PASS"

echo
echo "=== honesty_lint_negative_test: ALL PASS (AC-6.3) ==="
exit 0
