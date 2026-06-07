#!/usr/bin/env bash
# Maps: E1 (<details>+JSON.stringify on product surface), E2 (fake 0x txHash / explorer URL in mock).
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

fail=0

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
