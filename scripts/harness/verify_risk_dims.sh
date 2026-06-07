#!/usr/bin/env bash
# PRD M2.5 verifier: the 9-dimension risk gate enforces each dimension
# independently. For each of the 9 dims, mutate ONLY that field on a base
# all-good proposal, POST /api/risk, assert exactly that dim fails and all
# others pass.
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

node scripts/harness/verify_risk_dims.mjs "$@"
