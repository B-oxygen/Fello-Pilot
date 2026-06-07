#!/usr/bin/env bash
# Maps: PROMPT.md Loop Procedure step 0 — one-line entry point for an unattended Ralphathon iteration.
# Composes: preflight → testnet-signer → forbidden_grep → honesty_lint. First gate to fail aborts.
# Usage: bash scripts/harness/start_ralphathon.sh [dev|build]
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

MODE="${1:-dev}"
fail=0

run_gate() {
  local label="$1"
  shift
  echo
  echo "================ $label ================"
  if ! "$@"; then
    echo "[start_ralphathon] $label FAILED"
    fail=1
  fi
}

run_gate "preflight ($MODE)"     bash scripts/harness/preflight.sh "$MODE"
run_gate "testnet-signer"        bash scripts/harness/generate_testnet_signer.sh
run_gate "forbidden-tokens"      bash scripts/harness/forbidden_grep.sh
run_gate "honesty-lint"          bash scripts/harness/honesty_lint.sh

echo
if [ "$fail" -ne 0 ]; then
  echo "[start_ralphathon] one or more gates failed — Ralphathon NOT ready"
  exit 1
fi
echo "[start_ralphathon] all gates passed — Ralphathon ready"
