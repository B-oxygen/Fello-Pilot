#!/usr/bin/env bash
set -e

cd "$(cd "$(dirname "$0")/.." && pwd)"

PORT="${PORT:-3000}"
SAFE_INTENT="${SAFE_INTENT:-Sepolia testnet에서 1 USDC를 ETH로 스왑하는 데모 자동화 플로우.}"

echo "[demo:safe] checking dev server on :${PORT}"
if ! curl -sf "http://localhost:${PORT}/" -o /dev/null; then
  echo "[demo:safe] dev server not responding; start with: npm run dev"
  exit 1
fi

echo "[demo:safe] running full SAFE end-to-end via API (real EIP-712 signature)"
node scripts/demo_safe_e2e.mjs
