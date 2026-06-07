#!/usr/bin/env bash
set -e

cd "$(cd "$(dirname "$0")/.." && pwd)"

PORT="${PORT:-3000}"

echo "[demo:blocked] checking dev server on :${PORT}"
if ! curl -sf "http://localhost:${PORT}/" -o /dev/null; then
  echo "[demo:blocked] dev server not responding; start with: npm run dev"
  exit 1
fi

echo "[demo:blocked] running smoke (UNSAFE intent → 4-dim risk-blocked receipt + CoinFello CLI evidence)"
node scripts/smoke.mjs
