#!/usr/bin/env bash
# Maps: A2 — subagent spec ↔ actual product UI drift detector.
# Strategy: count "STEP N" mentions in .claude/agents/ui-builder.md AND in app/page.tsx.
# Numbers must match. Mismatch indicates the spec was updated without UI (or vice versa).
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

fail=0
log() { printf '[spec_diff] %s\n' "$*"; }

ui_builder=".claude/agents/ui-builder.md"
page="app/page.tsx"

if [ ! -f "$ui_builder" ]; then
  log "no $ui_builder yet — skipping (product src not present)"
  exit 0
fi
if [ ! -f "$page" ]; then
  log "no $page yet — skipping (product src not present)"
  exit 0
fi

# Distinct STEP numbers declared in the subagent spec (e.g. "STEP 4", "STEP 7").
spec_steps=$(grep -oE 'STEP [0-9]+' "$ui_builder" | sort -u || true)
spec_count=$(printf '%s\n' "$spec_steps" | grep -c '.' || true)

# Distinct STEP numbers actually rendered in the product page (via StepTitle).
ui_steps=$(grep -oE 'step="STEP [0-9]+"' "$page" | sort -u || true)
ui_count=$(printf '%s\n' "$ui_steps" | grep -c '.' || true)

log "spec declares $spec_count STEP labels: $(echo "$spec_steps" | tr '\n' ' ')"
log "ui renders   $ui_count STEP labels: $(echo "$ui_steps" | tr '\n' ' ' | sed 's/step=\|"//g')"

if [ "$spec_count" -ne "$ui_count" ]; then
  log "FAIL: STEP count drift between spec and UI"
  fail=1
fi

# Forbidden boundary leak: Judge step in subagent spec.
if grep -nE 'STEP [0-9]+.*[Jj]udge' "$ui_builder" >/dev/null; then
  log "FAIL: ui-builder.md still lists a Judge step (boundary violation):"
  grep -nE 'STEP [0-9]+.*[Jj]udge' "$ui_builder"
  fail=1
fi

# Forbidden boundary leak: any /harness link from the product page.
if grep -nE '(href|to)=["'"'"']/harness' "$page" >/dev/null; then
  log "FAIL: $page links to /harness (boundary violation):"
  grep -nE '(href|to)=["'"'"']/harness' "$page"
  fail=1
fi

[ "$fail" -eq 0 ] && log "OK"
exit "$fail"
