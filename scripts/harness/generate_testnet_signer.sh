#!/usr/bin/env bash
# Maps: today's lesson — direct_viem adapter requires a funded Base Sepolia signer.
# Strategy:
#   1) If ~/.fellopilot/signer.env exists, reuse it (faucet cooldown survival across projects).
#   2) Otherwise generate fresh + persist to ~/.fellopilot/signer.env (mode 0600).
# Output: prints address + .env snippet. Caller pastes into project .env or sources signer.env.
set -euo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

PERSIST="$HOME/.fellopilot/signer.env"

if [ -f "$PERSIST" ]; then
  ADDR=$(grep -E '^FELLOPILOT_TESTNET_SIGNER_ADDRESS=' "$PERSIST" | cut -d= -f2)
  PK=$(grep -E '^FELLOPILOT_TESTNET_SIGNER_KEY=' "$PERSIST" | cut -d= -f2)
  cat <<EOF
=========================================================
  FelloPilot — Reusing persistent testnet signer
=========================================================
Source:      $PERSIST (mode 0600)
Address:     $ADDR
Private key: $PK

Add to your .env (or just \`source $PERSIST\`):
  FELLOPILOT_ADAPTER=direct_viem
  FELLOPILOT_TESTNET_SIGNER_KEY=$PK

Fund this address if it has 0 ETH:
EOF
  jq -r '.providers.direct_viem.actions.attestation_tx.faucets[]?' scripts/harness/capability_matrix.json 2>/dev/null | sed 's/^/  /' || echo "  https://www.alchemy.com/faucets/base-sepolia"
  echo
  echo "Verify balance: curl -fsS -X POST https://sepolia.base.org -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDR\",\"latest\"],\"id\":1}' | jq .result"
  exit 0
fi

cat <<'BANNER'
=========================================================
  FelloPilot — Base Sepolia testnet signer generator
=========================================================
Fresh Ethereum keypair for TESTNET ONLY (direct_viem adapter).
NEVER use this key on mainnet.
NEVER commit it to git.

BANNER

if [ ! -d node_modules ]; then
  echo "[generate_testnet_signer] node_modules absent — run 'npm install' first."
  exit 1
fi

OUT="$(node -e '
  import("viem/accounts").then((m) => {
    const pk = m.generatePrivateKey();
    const acct = m.privateKeyToAccount(pk);
    console.log(JSON.stringify({ pk, address: acct.address }));
  }).catch((e) => { console.error(e.message); process.exit(1); });
' 2>/dev/null)"

if [ -z "$OUT" ]; then
  echo "[generate_testnet_signer] viem not installed in node_modules — run 'npm install viem' first."
  exit 1
fi

PK="$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).pk)}catch{process.exit(1)}})')"
ADDR="$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).address)}catch{process.exit(1)}})')"

if [ -z "$PK" ] || [ -z "$ADDR" ]; then
  echo "[generate_testnet_signer] keypair generation failed."
  exit 1
fi

mkdir -p "$HOME/.fellopilot"
chmod 700 "$HOME/.fellopilot"
cat > "$PERSIST" <<EOF
# FelloPilot direct_viem testnet signer (Base Sepolia)
# DO NOT use on mainnet. DO NOT commit to git.
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
FELLOPILOT_TESTNET_SIGNER_KEY=$PK
FELLOPILOT_TESTNET_SIGNER_ADDRESS=$ADDR
EOF
chmod 600 "$PERSIST"

echo "Address:     $ADDR"
echo "Private key: $PK"
echo "Persisted:   $PERSIST (mode 0600)"
echo
echo "Add to your .env (or just 'source $PERSIST'):"
echo "  FELLOPILOT_ADAPTER=direct_viem"
echo "  FELLOPILOT_TESTNET_SIGNER_KEY=$PK"
echo
echo "Fund the address with Base Sepolia ETH:"
jq -r '.providers.direct_viem.actions.attestation_tx.faucets[]?' scripts/harness/capability_matrix.json 2>/dev/null | sed 's/^/  /' || {
  echo "  https://www.alchemy.com/faucets/base-sepolia"
  echo "  https://portal.cdp.coinbase.com/products/faucet"
}
echo
echo "Verify funding:"
echo "  curl -fsS http://localhost:3000/api/wallet | jq '.message'"
echo "  # or onchain:"
echo "  curl -fsS -X POST https://sepolia.base.org -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDR\",\"latest\"],\"id\":1}' | jq .result"
