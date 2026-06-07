#!/usr/bin/env bash
# PRD M3.1 verifier: logs/commands.jsonl MUST receive >= 7 new entries during a
# SAFE_DEMO end-to-end run (one per stage minimum: intent_received,
# proposal_emitted, risk_evaluated, delegation_intent_built, delegation_signed,
# execution_completed, memory_recorded).
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

LOG=logs/commands.jsonl
mkdir -p logs
[ -f "$LOG" ] || : > "$LOG"

before=$(wc -l < "$LOG")
before=${before// /}
echo "[verify_log_coverage] before SAFE_DEMO: $before lines"

if ! node scripts/demo_safe_e2e.mjs >/tmp/log_coverage_out.log 2>&1; then
  echo "[verify_log_coverage] FAIL: demo_safe_e2e.mjs failed"
  tail -40 /tmp/log_coverage_out.log
  exit 1
fi

after=$(wc -l < "$LOG")
after=${after// /}
delta=$((after - before))
echo "[verify_log_coverage] after SAFE_DEMO: $after lines, delta=$delta (require >= 7)"

if [ "$delta" -lt 7 ]; then
  echo "[verify_log_coverage] FAIL: SAFE_DEMO produced only $delta log entries; PRD M3.1 requires >= 7"
  echo "  recent log lines (last 20):"
  tail -20 "$LOG"
  exit 1
fi

# PRD M3.1: each of the 7 canonical SAFE-flow stages MUST appear in the new
# delta. Without this check, the script could pass when 7 duplicates of
# `intent_received` are logged but no `delegation_signed` ever fires.
REQUIRED_STAGES=(
  "intent_received"
  "proposal_emitted"
  "risk_evaluated"
  "delegation_intent_built"
  "delegation_signed"
  "execution_completed"
  "memory_recorded"
)

new_lines=$(tail -n "$delta" "$LOG")
missing=()
for stage in "${REQUIRED_STAGES[@]}"; do
  if ! printf '%s\n' "$new_lines" | grep -q "\"stage\":\"$stage\""; then
    missing+=("$stage")
  fi
done

if [ "${#missing[@]}" -ne 0 ]; then
  echo "[verify_log_coverage] FAIL: SAFE_DEMO delta missing required stages:"
  printf '    - %s\n' "${missing[@]}"
  exit 1
fi

stages_seen=$(printf '%s\n' "$new_lines" | grep -oE '"stage":"[^"]+"' | sort -u | wc -l)
stages_seen=${stages_seen// /}
echo "[verify_log_coverage] all 7 required stages present; distinct stages this run: $stages_seen"

echo "[verify_log_coverage] OK"
exit 0
