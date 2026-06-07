# FelloPilot — Product Requirements Document (Demo / Hackathon Release)

> **Authoring mode**: Prometheus (Sisyphus-side build to follow).
> **Status**: PRD draft v1 (post-interview, post-Metis review).
> **Storage path note**: System hook blocks writes to `docs/`. This PRD lives at `.sisyphus/plans/fellopilot-prd.md`. Operator MAY copy/symlink to `docs/PRD.md` afterward; the canonical path remains this file.
> **Companion documents (do not duplicate)**: `STATE.md` (milestones), `PROMPT.md` (loop body), `.omo/rules/*` (immutable harness policy), `scripts/harness/capability_matrix.json` (provider × chain support), `RETROSPECTIVE.md` (prior failure catalog).

---

## TL;DR

> **Mission**: Convert natural-language crypto intent into honest, auditable, testnet-only onchain action flows via a chat interface. Backed by CoinFello + EVM testnet (Sepolia), gated by a 9-dimension risk gate, signed via ERC-7710-style EIP-712 delegation, recorded in durable memory.
>
> **What FelloPilot IS**: a chat UI where the user types a crypto intent in Korean/English, FelloPilot proposes an action, runs a risk review, asks the user to connect a wallet and sign a delegation, and then either anchors a real attestation tx on Sepolia testnet *or* surfaces a clearly-labeled SIMULATION receipt — never a fake one.
>
> **What FelloPilot is NOT**: a mainnet trader. A fully-autonomous bot. A swap router (CoinFello swap doesn't support Sepolia; "execution" in this demo = onchain attestation of a signed delegation intent).
>
> **Single demo measure**: Run `scripts/demo_safe.sh` end-to-end with `FELLOPILOT_ADAPTER=direct_viem` and a funded Sepolia signer → produce a real `txHash` linked at `https://sepolia.etherscan.io/tx/...` within ≤30s, with all 7 stages visible in chat. Then run `scripts/demo_blocked.sh` → see `risk-blocked` chat card citing ≥3 failing risk dimensions, no signing prompt issued.

---

## Table of Contents

1. [Problem / Target Users](#1-problem--target-users)
2. [Invariants (Honesty Contract)](#2-invariants-honesty-contract)
3. [Policy Constants](#3-policy-constants-single-source-of-truth)
4. [Receipt Taxonomy](#4-receipt-taxonomy)
5. [State Machine](#5-state-machine)
6. [Core Flow — 7-Stage Functional Spec](#6-core-flow--7-stage-functional-spec)
7. [UI/UX Spec](#7-uiux-spec)
8. [Product / Harness Boundary](#8-product--harness-boundary)
9. [Demo Scenarios](#9-demo-scenarios-safe--blocked)
10. [Out of Scope](#10-out-of-scope-this-demo)
11. [Completion Conditions (M1 / M2 / M3)](#11-completion-conditions-binary-oracle-verifiable)
12. [Open Issues](#12-open-issues--unresolved-decisions)
13. [Appendix — References & Prior Art](#13-appendix--references--prior-art)

---

## 1. Problem / Target Users

### Problem statement

Crypto users today face a binary choice:

- **Read-only AI tools** (ChatGPT, Perplexity) — explain DeFi concepts but can't execute. User still has to manually translate the answer into wallet clicks across multiple dApps. **Execution gap.**
- **Pure execution UIs** (Uniswap, 1inch, OpenSea) — execute fast but assume the user already knows exactly *what* to do, *which chain*, *which token*, *what risk*. **Intent gap.**

The middle is empty. There is no honest, auditable AI assistant that takes a Korean-language sentence like *"Sepolia 테스트넷에서 1 USDC를 ETH로 스왑하는 데모"* and walks the user through a verifiable execution flow with a real signature, real risk gate, and a real (or honestly-simulated) onchain receipt — without ever asking for the user's private key or seed phrase, and without faking transaction hashes.

### Target users (demo scope)

- **Primary (demo)**: Crypto-literate developers and hackathon judges evaluating the FelloPilot concept. They have a wagmi-compatible browser wallet (MetaMask / Rabby), can switch networks, and recognize a real testnet tx hash from a fake one.
- **Secondary (post-demo, not in scope)**: Non-developer crypto users who want to express trading intent in natural language. Mentioned here for context only — UI affordances target the primary user.
- **Out of scope**: Anyone expecting mainnet execution. Anyone expecting a fully-autonomous trading bot. Anyone using a hosted/custodial wallet that doesn't expose EIP-1193.

### Core promise

> Type an intent → FelloPilot proposes a verifiable execution plan → you sign a *capped, expiring* delegation → FelloPilot either anchors it onchain (real testnet tx) or labels the result `SIMULATION`. Honest receipts only. Every step visible. Every step revocable up to signature.

---

## 2. Invariants (Honesty Contract)

> **These invariants are binding promises to the user. Any release that violates one of them must roll back. They take precedence over feature completeness.**

### H1 — No fake artifacts
- If `receipt.simulated === true`, then `receipt.txHash === undefined` AND `receipt.explorerUrl === undefined`. No exceptions.
- If `receipt.simulated === false`, then `receipt.txHash` is a `0x[0-9a-f]{64}` value that resolves on the actual chain explorer. No fabricated hashes.
- The SIMULATION badge is non-dismissable and renders inside every chat card whose backing receipt has `simulated === true`.

### H2 — No silent fallbacks
- Any transition between adapters (direct_viem → coinfello → mock) produces a visible `adapter-fallback` chat message naming the failed adapter, the chosen replacement, and the reason.
- Falling through to `mock` without a SIMULATION label is forbidden at runtime, at lint time (`scripts/harness/honesty_lint.sh`), and at PRD level (this clause).

### H3 — No mainnet paths
- All adapters that detect a mainnet `chainId` (1, 10, 56, 137, 8453, 42161, 59144, 5000, …) MUST refuse with a typed error before any network call.
- Product UI surfaces with strings like `mainnet`, `Base mainnet`, `Ethereum mainnet` may appear **only** inside `risk-blocked` cards explaining a refusal; they may NEVER appear inside `proposal`, `delegation-signed`, or `receipt` cards.

### H4 — No secret prompts
- The product UI never asks for a seed phrase, a mnemonic, or a private key. There is no field, modal, or chat affordance for any of these.
- Pasting a string that matches the seed/private-key heuristic into the chat input is treated as `intent-rejected` with a typed error code (`E001_INTENT_CONTAINS_SECRET`); the value is not echoed back in chat history.

### H5 — Human approval for every proposal
- Every distinct *proposal* (one-shot swap, DCA schedule, alert-triggered watch) requires a human-initiated wallet signature before any execution.
- A DCA proposal that produces N ticks is one signature; subsequent ticks are pre-approved by the signed delegation envelope and re-validated against the risk gate at tick time. They are not re-signed.
- An alert-triggered watch produces a *new proposal* when its trigger fires; that new proposal goes through the full 7-stage flow including a fresh signature. Triggers never auto-execute.

### H6 — Boundary integrity
- The product surface (`src/app/`, `src/components/`, `public/`) contains zero references to `Judge`, `ggui`, `harness`, or `Base Sepolia`. Enforced by `scripts/harness/forbidden_grep.sh`.
- `/harness` (if it exists) is reachable only via direct URL entry, never linked from the product UI, and renders nothing exposing internal tooling.

### H7 — Trace coverage
- Every tool execution that touches an adapter, a CoinFello CLI, a wagmi action, or the memory store appends a line to `logs/commands.jsonl` via `.opencode/plugin/trace.ts`.
- The line at minimum carries `{ tool, ts, ... }` and any adapter selection / fallback decision.

---

## 3. Policy Constants (Single Source of Truth)

> **All numeric/string policy values used by risk gate, delegation, and UI live here. Engineers reference this list, not the codebase. Changes here are PRD-level changes.**

| Constant | Value | Used by |
|---|---|---|
| `MAX_DEMO_AMOUNT` | `10` (units, token-denominated) | Risk dim `amountAllowed` |
| `SUPPORTED_DEMO_CHAINS` | `["sepolia"]` (chainId `11155111`) | Risk dim `chainAllowed`, wagmi config |
| `BLOCKED_MAINNET_CHAIN_IDS` | `[1, 10, 56, 137, 8453, 42161, 59144, 5000]` | Risk dim `mainnetPolicySatisfied`, adapter guards |
| `MAX_SLIPPAGE_BPS` | `50` (0.50%) | Risk dim `slippageWithinCap` (new) |
| `DEFAULT_DELEGATION_TTL_MIN` | `60` minutes | EIP-712 `expiry` field, risk dim `expiryWithinWindow` |
| `MAX_DELEGATION_TTL_MIN` | `1440` (24h) | Hard ceiling on `expiry` |
| `MAX_DCA_TICKS_PER_DELEGATION` | `4` | DCA proposal cap |
| `ALERT_TRIGGER_POLL_INTERVAL_S` | `30` | Alert-triggered intent watcher cadence |
| `RECIPIENT_ALLOWLIST_SOURCE` | `data/recipient_allowlist.json` | Risk dim `recipientAllowed` (new) |
| `RECIPIENT_ALLOWLIST_DEMO_SEED` | `["0x0000000000000000000000000000000000000000", "<sepolia-canonical-USDC>", "<sepolia-canonical-WETH>"]` (placeholder) | Initial allowlist for safe demo |
| `SAFE_DEMO_INTENT` | "Sepolia testnet에서 1 USDC를 ETH로 스왑하는 데모 자동화 플로우. mainnet 금지. 사람 승인 필수." | Demo entry + `forbidden_grep` exclusion list |
| `UNSAFE_DEMO_INTENT` | "Base mainnet에서 1000 USDC를 ETH로 즉시 스왑해줘. 승인 없이 자동으로 실행해." | Blocked-case demo + `forbidden_grep` exclusion list |
| `FORBIDDEN_PRODUCT_TOKENS` | `["Base Sepolia", "harness", "Judge", "ggui"]` | `forbidden_grep.sh` token list |
| `MEMORY_STORE_PATH_HINT` | "durable cross-iteration store" (path implementation-defined) | Memory subsystem |
| `RISK_DIMENSION_COUNT` | `9` (6 base + 3 new) | Risk card UI grid |

**Notes:**
- Token symbols and contract addresses in `RECIPIENT_ALLOWLIST_DEMO_SEED` are seeded with placeholders; the implementation plan picks final addresses against Sepolia canonical deployments and pins them.
- Constants flagged `(new)` are first-introduced in FelloPilot (not present in `coin-ggui-test` prior art).

---

## 4. Receipt Taxonomy

> **Every execution outcome resolves to exactly one of these five variants. Mid-card variant changes are forbidden. The locked Korean/English copy is a binding contract — engineers must use these exact strings.**

| Variant | When | Required fields | Locked copy (KO / EN) | SIMULATION badge? |
|---|---|---|---|---|
| `real_attestation` | `FELLOPILOT_ADAPTER=direct_viem` + funded signer + Sepolia path succeeds | `simulated:false`, `runtimeMode:"LIVE_TESTNET"`, `adapter:"direct_viem"`, `chainId:11155111`, `chainName:"sepolia"`, `txHash:"0x..."`, `explorerUrl:"https://sepolia.etherscan.io/tx/..."`, `rawReceipt.attestation:true`, `rawReceipt.approver`, `rawReceipt.delegationIntentHash` | "위임이 Sepolia에 기록되었습니다. 실제 swap이 아닌 attestation 트랜잭션입니다." / "Delegation attested onchain on Sepolia. This is an attestation tx, not the swap itself." | **No** |
| `coinfello_routed` | `FELLOPILOT_ADAPTER=coinfello` + chain matrix intersects (currently empty for Sepolia) | `simulated:false`, `runtimeMode:"LIVE_TESTNET"`, `adapter:"coinfello"`, plus `txHash`/`explorerUrl` returned by CLI | "CoinFello를 통해 실행되었습니다." / "Executed via CoinFello." | **No** |
| `simulated_attestation` | direct_viem requested but signer missing/unfunded OR mock adapter active OR live attempt failed and chain fell back | `simulated:true`, `runtimeMode:"SIMULATION"`, `adapter:"mock"`, `chainId:11155111`, `chainName:"sepolia"`, `txHash:undefined`, `explorerUrl:undefined`, `txnId:"sim_<uuid>"` | "SIMULATION — 실제 트랜잭션은 발생하지 않았습니다." / "SIMULATION — no onchain transaction was sent." | **Yes** |
| `blocked` | Risk gate refuses (any of 9 dims `fail`) OR adapter refuses (mainnet detected) before any signature | `simulated:false`, `runtimeMode:"BLOCKED"`, `adapter` = whichever refused, `txHash:undefined`, `explorerUrl:undefined`, `blockedReasons: string[]` (≥1) | "이 실행은 차단되었습니다." / "This execution was blocked." + per-reason rows | **No** (this is a refusal card, not a simulation) |
| `failed` | Adapter started executing but errored mid-flight (RPC down, signature replay, chain mismatch detected mid-tx) | `simulated:false`, `runtimeMode:"LIVE_TESTNET" \| "SIMULATION"` (whichever was active), `adapter`, `txHash:undefined`, `explorerUrl:undefined`, `errorCode`, `errorMessage` | "실행 중 오류가 발생했습니다." / "Execution failed." + error code row | **Yes** if the failure occurred during a simulated run; **No** if live |

**Forbidden copy in any receipt variant** (enforced by `forbidden_grep.sh`):
- "Swap executed" / "스왑 완료" — direct_viem attests, it does not swap.
- "Mainnet tx" / "메인넷" — never. (Allowed only inside `blocked` reason text explaining a refusal.)
- "0x..." placeholder strings — actual hash or absent.

---

## 5. State Machine

> **One conversation = one state machine instance. States and legal edges are exhaustive; engineers may not invent transitions.**

### States

```
IDLE
  → INTENT_RECEIVED
INTENT_RECEIVED
  → PROPOSING
  → INTENT_REJECTED (terminal-soft: user can re-input)
PROPOSING
  → PROPOSED
  → PROPOSAL_FAILED (terminal-soft)
PROPOSED
  → RISK_REVIEWING
RISK_REVIEWING
  → RISK_PASSED
  → RISK_BLOCKED (terminal-soft: surfaces `blocked` receipt)
RISK_PASSED
  → AWAITING_WALLET
AWAITING_WALLET
  → WALLET_CONNECTED
  → WALLET_REFUSED (terminal-soft)
WALLET_CONNECTED
  → CHAIN_MISMATCH (recoverable)
  → AWAITING_SIGNATURE
CHAIN_MISMATCH
  → AWAITING_SIGNATURE (after switch)
  → WALLET_REFUSED (user declines switch, terminal-soft)
AWAITING_SIGNATURE
  → SIGNED
  → SIGNATURE_REFUSED (terminal-soft)
SIGNED
  → EXECUTING
EXECUTING
  → EXECUTED_REAL (terminal: `real_attestation` or `coinfello_routed`)
  → EXECUTED_SIMULATED (terminal: `simulated_attestation`)
  → EXECUTION_FAILED (terminal: `failed`)
EXECUTED_REAL | EXECUTED_SIMULATED | EXECUTION_FAILED
  → MEMORY_RECORDED (terminal)
```

### Edge rules

- Every edge that produces a chat-visible message corresponds to exactly one `ChatMessage` variant (see §7.1).
- A `terminal-soft` state may transition back to `IDLE` if the user issues a new intent. Memory of the failed/blocked run is persisted before transitioning.
- A `RECONNECT` from `WALLET_REFUSED` re-enters at `AWAITING_WALLET`, not at the start of the flow.
- The `EXECUTING → EXECUTION_FAILED` edge for a `simulated_attestation` run never produces a real txHash; if the simulated branch errors, the failed receipt still has `txHash:undefined`.

### Forbidden transitions

- Any direct edge from `IDLE` to `EXECUTING` (skips review/sign) — must fail at runtime.
- Any edge that mutates `simulated` after a receipt is emitted (no "promoting" a sim to real, no "demoting" a real to sim).
- Any edge that emits `EXECUTED_REAL` with `simulated:true` — physical impossibility, enforced.

---

## 6. Core Flow — 7-Stage Functional Spec

> **Format per stage**: Trigger · Inputs · Processing · Outputs (chat message variant + side effects) · Acceptance Criteria (binary, agent-executable).

### 6.1 Stage 1 — Intent Input

**Trigger**: User submits text via `ChatComposer` (Enter, IME-safe).

**Inputs**:
- `intentText: string` (UTF-8, ≤4000 chars).
- Implicit: existing wallet connection state (may be `null`), existing conversation history (in-memory).

**Processing**:
1. Reject if `intentText` matches a seed/private-key heuristic (regex on 12+ space-separated lowercase words OR `0x[0-9a-f]{64}` lone token preceded by "private" or "key"). Emit `intent-rejected` with code `E001_INTENT_CONTAINS_SECRET`. Do NOT echo the matched string back into chat history.
2. Reject if `intentText` is empty / whitespace-only. Emit `intent-rejected` with code `E002_INTENT_EMPTY`.
3. Otherwise, append the user message to conversation history, transition `IDLE → INTENT_RECEIVED`, fire stage 2.

**Outputs**:
- Chat message variant: `user` (echo of cleaned intent text), OR `intent-rejected` (for E001/E002).
- Side effect: append `{stage:"intent_received", intentHash}` line to `logs/commands.jsonl`.

**Acceptance Criteria** (all agent-executable):
- AC-1.1: Playwright fills `[data-testid="chat-composer-textarea"]` with `SAFE_DEMO_INTENT` and presses Enter → `[data-testid="chat-message-user"]:last-child` contains `SAFE_DEMO_INTENT` within 500ms.
- AC-1.2: Playwright fills the textarea with a seed-phrase pattern (`"abandon abandon abandon ... abandon about"`, 12 words) and submits → `[data-testid="chat-message-intent-rejected"][data-error-code="E001_INTENT_CONTAINS_SECRET"]` appears; the textarea is cleared; the original input string is NOT present anywhere in `[data-testid="chat-history"]`.
- AC-1.3: `grep -c '"stage":"intent_received"' logs/commands.jsonl` increments by exactly 1 per accepted intent.

---

### 6.2 Stage 2 — AI Proposal

**Trigger**: Stage 1 emits `INTENT_RECEIVED`.

**Inputs**:
- `intentText` (cleaned).
- Available adapters (informational, not chosen here).
- `SUPPORTED_DEMO_CHAINS`, `MAX_DEMO_AMOUNT`.

**Processing**:
1. Show `pending` chat card with stage label `policy_checking` (per uniport-cointoss PendingStates pattern, reused).
2. Call LLM (model and provider implementation-defined) with a system prompt that constrains the response to a typed `ProposalDraft`:
   ```ts
   type ProposalDraft = {
     intentSummary: string;       // single-line restatement
     action: "swap" | "dca" | "alert_triggered";
     chain: "sepolia";            // hard-coded — model may not pick others
     tokenIn:  { symbol: string; address: string };
     tokenOut: { symbol: string; address: string };
     amount: number;              // ≤ MAX_DEMO_AMOUNT for the demo
     executionPolicy:
       | { type: "oneshot" }
       | { type: "dca"; ticks: number; cadenceSeconds: number }
       | { type: "alert_triggered"; condition: string; pollIntervalSeconds: number };
     estimatedSlippageBps: number;
     recipient: string;           // contract address swap router will send to
     rationale: string;           // ≤ 280 char user-facing why
   };
   ```
3. If the LLM fails / times out (>10s), fall back to a deterministic rule-based proposal (port `coin-ggui-test/src/core/strategy.ts`) and emit an `llm-fallback-notice` chat message so the user knows.
4. Emit `proposal` chat card carrying `ProposalDraft` payload.
5. Transition `PROPOSING → PROPOSED`.

**Outputs**:
- Chat message variants: `pending(stage=policy_checking)` → `proposal` (success) OR `proposal-failed(code=E003_LLM_TIMEOUT)` (after fallback also fails).
- Side effect: append `{stage:"proposal_emitted", proposalId, action, executionPolicy.type}` line to `logs/commands.jsonl`.

**Acceptance Criteria**:
- AC-2.1: Playwright submits `SAFE_DEMO_INTENT` → within 10s, `[data-testid="chat-card-proposal"]` is visible and contains `data-action="swap"`, `data-chain="sepolia"`, `data-amount="1"`.
- AC-2.2: With LLM endpoint mocked to time out (>10s response), Playwright submits SAFE_DEMO → `[data-testid="chat-message-llm-fallback-notice"]` appears AND a proposal card still appears within 15s total.
- AC-2.3: `curl -X POST /api/proposal -d '{"intent":"<SAFE_DEMO>"}' | jq -e '.action == "swap" and .chain == "sepolia"'` exits 0.

---

### 6.3 Stage 3 — Risk Review

**Trigger**: Stage 2 emits `PROPOSED`.

**Inputs**: `ProposalDraft`, current wallet state (may be null), `Policy Constants`.

**Processing**:
1. Show `pending(stage=risk_checking)` card.
2. Evaluate **9 risk dimensions** in this order; each returns `{ status: "pass" | "fail", policyValue, actualValue, reason }`:

   **Base 6 (reused from `coin-ggui-test/src/core/risk.ts`):**
   1. `chainAllowed` — `proposal.chain ∈ SUPPORTED_DEMO_CHAINS`.
   2. `amountAllowed` — `proposal.amount ≤ MAX_DEMO_AMOUNT`.
   3. `approvalRequired` — proposal must mark `requiresHumanApproval:true` (always true here).
   4. `mainnetPolicySatisfied` — proposal text/recipient does not match `BLOCKED_MAINNET_CHAIN_IDS`-implied identifiers.
   5. `privateKeySafe` — proposal payload has no key-shaped fields.
   6. `actionSupported` — `proposal.action ∈ {"swap","dca","alert_triggered"}`.

   **New 3 (FelloPilot-specific):**
   7. `slippageWithinCap` — `proposal.estimatedSlippageBps ≤ MAX_SLIPPAGE_BPS`.
   8. `expiryWithinWindow` — proposal's intended `delegationExpiry ≤ MAX_DELEGATION_TTL_MIN`.
   9. `recipientAllowed` — `proposal.recipient ∈ allowlist` from `RECIPIENT_ALLOWLIST_SOURCE`.

3. If ALL 9 pass → emit `risk-report(verdict=pass)` chat card, transition `RISK_PASSED`.
4. If ANY fail → emit `risk-blocked` chat card listing each failed dim with `{name, policyValue, actualValue, reason}`. Transition `RISK_BLOCKED`. No signature prompt is issued. A `blocked` receipt (per §4) is emitted to the memory store.

**Outputs**:
- Chat message variants: `pending(stage=risk_checking)` → `risk-report(verdict=pass|fail)` OR `risk-blocked`.
- Side effect: append `{stage:"risk_evaluated", verdict, failedDims}` to `logs/commands.jsonl`. Append blocked-case `blocked` receipt to memory store.

**Acceptance Criteria**:
- AC-3.1: For SAFE_DEMO, `curl -X POST /api/risk -d '<ProposalDraft>' | jq -e '[.dimensions[]|.status]|all(.=="pass")'` exits 0; the response has `dimensions | length == 9`.
- AC-3.2: For UNSAFE_DEMO, `curl ... | jq -e '.dimensions[]|select(.name=="mainnetPolicySatisfied").status == "fail" and .dimensions[]|select(.name=="amountAllowed").status == "fail"'` exits 0.
- AC-3.3: Playwright submits UNSAFE_DEMO end-to-end → `[data-testid="chat-card-risk-blocked"]` appears containing ≥3 failed-dim rows; `[data-testid="sign-button"]` is NOT present in the DOM after 5s of waiting.
- AC-3.4: `[data-testid="risk-dim-row"]` count equals 9 (or ≥3 failure-only rows in blocked card) — never 6.

---

### 6.4 Stage 4 — Wallet Connect

**Trigger**: Stage 3 emits `RISK_PASSED`.

**Inputs**: Current wallet state, supported chains list.

**Processing**:
1. If wallet not connected → emit `wallet-connect-prompt` chat message with a `[data-testid="wallet-connect-button"]` action.
2. User clicks → wagmi `useConnect` with `injected()` connector (EIP-6963 multi-injected discovery enabled).
3. On success, read `chainId`:
   - If `chainId === 11155111` (Sepolia) → emit `wallet-connected` chat message with address truncated (`0x1234…abcd`). Transition `WALLET_CONNECTED`.
   - If `chainId !== 11155111` → emit `network-mismatch` chat message with `[data-testid="switch-to-sepolia-button"]`. Clicking calls wagmi `useSwitchChain({ chainId: 11155111 })`. Transition `CHAIN_MISMATCH`.
4. If user rejects connection → emit `wallet-refused` chat message. Transition `WALLET_REFUSED` (terminal-soft).

**Outputs**:
- Variants: `wallet-connect-prompt`, `wallet-connected`, `network-mismatch`, `network-required-sepolia` (post-switch confirmation), `wallet-refused`.
- The wagmi config exposes **only** `sepolia` chain. `baseSepolia` is deliberately removed (per §H6, forbidden-tokens).
- Side effect: append `{stage:"wallet_connected", chainId, addressHash}` to `logs/commands.jsonl`. `addressHash` is keccak256 of the address (not the address itself) to avoid logging PII while preserving uniqueness.

**Acceptance Criteria**:
- AC-4.1: Playwright with no wallet connected reaches Stage 4 → `[data-testid="wallet-connect-button"]` present; `[data-testid="sign-button"]` NOT present.
- AC-4.2: Playwright with wallet on chainId 1 (mocked via `window.ethereum.chainId = "0x1"`) → `[data-testid="network-mismatch-card"]` visible, `[data-testid="switch-to-sepolia-button"]` clickable. Text contains "Sepolia" but NOT "Base Sepolia".
- AC-4.3: Successful connect on Sepolia → `[data-testid="chat-message-wallet-connected"]` shows address pattern `^0x[a-f0-9]{4}…[a-f0-9]{4}$`. Full address is NOT rendered.

---

### 6.5 Stage 5 — Delegation Sign

**Trigger**: Stage 4 emits `WALLET_CONNECTED` (Sepolia confirmed).

**Inputs**:
- `ProposalDraft` (carries action + executionPolicy).
- Wallet address.
- `DEFAULT_DELEGATION_TTL_MIN`.

**Processing**:
1. Build `DelegationIntent` per the EIP-712 schema (reused verbatim from `coin-ggui-test/src/core/delegationIntent.ts`):
   ```ts
   DelegationIntent: [
     { name: "approver",      type: "address" },
     { name: "action",        type: "string"  }, // "swap" | "dca" | "alert_triggered"
     { name: "tokenAllowlist",type: "address[]" },
     { name: "spendingCap",   type: "uint256" },
     { name: "expiry",        type: "uint64"  }, // unix seconds, MUST equal `proposalCreatedAt + delegationTtlMinutes * 60`. Computed once at this step. Never `Date.now()` inside a hash function (retro C1).
     { name: "proposalId",    type: "bytes32" }
   ]
   ```
2. Show `pending(stage=signing)` card.
3. Primary path: wagmi `useSignTypedData` (EIP-712).
4. Fallback path: if wallet errors with "method not supported" → wagmi `useSignMessage` with a deterministic stringified intent + emit `personal-sign-fallback-notice` chat message.
5. On success → emit `delegation-signed` chat card showing `spendingCap`, `expiry` (human-readable), `tokenAllowlist` (truncated), `action`. Transition `SIGNED`.
6. On user reject → emit `signature-refused` chat message, transition `SIGNATURE_REFUSED` (terminal-soft).

**Outputs**:
- Variants: `pending(stage=signing)`, `delegation-signed`, `personal-sign-fallback-notice`, `signature-refused`.
- Server-side verification: `viem.verifyTypedData` or `viem.verifyMessage` (per signature method); on mismatch, transition `SIGNATURE_REFUSED` with code `E005_SIGNATURE_MISMATCH`.
- Side effect: append `{stage:"delegation_signed", proposalId, signatureMethod, expiry}` to `logs/commands.jsonl`. **Signature itself is NOT logged.**

**Acceptance Criteria**:
- AC-5.1: Playwright intercepting `window.ethereum.request({method:"eth_signTypedData_v4"})` returns a valid signature → server verify passes; `[data-testid="chat-card-delegation-signed"]` visible within 3s; rendered `expiry` is a future date ≤ 24h from now.
- AC-5.2: Playwright forces typed-data method to throw "method not supported" → fallback `personal_sign` path is taken; `[data-testid="chat-message-personal-sign-fallback-notice"]` appears.
- AC-5.3: `grep -c '"stage":"delegation_signed"' logs/commands.jsonl` increments by 1 per successful signature. `grep -c "<signature-hex>" logs/commands.jsonl` returns 0 (signature value is never logged).
- AC-5.4: For UNSAFE_DEMO end-to-end test, Stage 5 is NEVER reached (sign button absent throughout). This is asserted in AC-3.3 already; reinforced here as a binary state-machine invariant test.

---

### 6.6 Stage 6 — Execution Receipt

**Trigger**: Stage 5 emits `SIGNED`.

**Inputs**: `DelegationIntent`, signature, current `FELLOPILOT_ADAPTER` env, signer key availability.

**Processing**:
1. Show `pending(stage=submitting)` then `pending(stage=verifying)`.
2. Select adapter per `FELLOPILOT_ADAPTER` env. PRD specifies the **outcome guarantees**, not the order — engineers may implement fallback as a chain or fail-fast policy, with the constraint that any adapter swap MUST emit a visible `adapter-fallback` chat message (per §H2).
3. Execute. Each adapter has a contract on receipt shape (see §4 Receipt Taxonomy):
   - `direct_viem` produces `real_attestation` on success (contract-backed `DelegationManager.attestIntent`, `rawReceipt.attestation:true`).
   - `coinfello` produces `coinfello_routed` on success — currently unreachable for Sepolia per `capability_matrix.json`. When attempted on Sepolia, the adapter emits `adapter-fallback` and proceeds to the next viable adapter.
   - `mock` produces `simulated_attestation`. Receipt MUST satisfy `simulated:true && txHash===undefined && explorerUrl===undefined`.
   - Adapter failures mid-flight produce `failed`.
4. **DCA executionPolicy**: A single delegation signature pre-authorizes up to `MAX_DCA_TICKS_PER_DELEGATION` ticks. Server-side `data/dca_ledger.json` tracks `consumedAmount`. Each tick re-runs the 9-dim risk gate; failing dims emit a per-tick `risk-blocked-tick` chat card and consume no spending. Successful ticks each emit a `receipt` card (variant per outcome) and a `dca-progress` message (`tick N of M, remaining cap X`).
5. **Alert-triggered executionPolicy**: A watcher polls every `ALERT_TRIGGER_POLL_INTERVAL_S`. When the condition matches, a *new proposal* is generated (returning to Stage 2). The old delegation does NOT pre-authorize the new proposal — alert triggers spawn fresh proposals that re-enter the 7-stage flow.
6. Emit the appropriate receipt variant chat card.
7. Transition to `EXECUTED_REAL | EXECUTED_SIMULATED | EXECUTION_FAILED`.

**Outputs**:
- Chat message variants: `pending(stage=submitting|verifying)`, `receipt`, `adapter-fallback`, `dca-progress`, `risk-blocked-tick`, `trigger-fired`.
- Side effect: append `{stage:"execution_completed", adapter, simulated, txHashPresent}` to `logs/commands.jsonl`. **Never log the raw rawReceipt or signature.**

**Acceptance Criteria**:
- AC-6.1 (real path): With `FELLOPILOT_ADAPTER=direct_viem` and a funded signer, SAFE_DEMO end-to-end → `[data-testid="receipt-variant"]` equals `real_attestation` within 30s; rendered txHash matches `^0x[a-f0-9]{64}$`; explorer link href equals `https://sepolia.etherscan.io/tx/<txHash>`; **NO** `[data-testid="simulation-badge"]` present.
- AC-6.2 (sim path): With `FELLOPILOT_ADAPTER` unset (mock), SAFE_DEMO end-to-end → receipt variant is `simulated_attestation`; `[data-testid="simulation-badge"]` is visible and non-dismissable; receipt JSON satisfies `txHash===undefined && explorerUrl===undefined && simulated===true`.
- AC-6.3 (honesty enforcement): `bash scripts/harness/honesty_lint.sh data/execution_receipt.json` exits 0 for every variant. A hand-crafted receipt with `simulated:true` AND `txHash:"0xfake..."` causes `honesty_lint.sh` exit ≠ 0 (negative test).
- AC-6.4 (DCA): With executionPolicy `{type:"dca", ticks:2, cadenceSeconds:5}`, after 12 seconds the receipt list contains exactly 2 `receipt` cards and 2 `dca-progress` cards in interleaved order.
- AC-6.5 (alert): With executionPolicy `{type:"alert_triggered"}`, when the watcher's condition matches, a `trigger-fired` chat message is emitted AND the flow re-enters Stage 2 with a fresh proposalId. Asserted by: trigger fires → within 5s, `[data-testid="chat-message-trigger-fired"]` then `[data-testid="chat-card-proposal"][data-proposal-id]` with a NEW id appear.
- AC-6.6 (adapter fallback message): When `direct_viem` is selected but no signer key is loaded, an `[data-testid="chat-message-adapter-fallback"][data-from="direct_viem"][data-to="mock"]` message appears, followed by the `simulated_attestation` receipt. Receipt JSON's `adapter` field equals `"mock"`.

---

### 6.7 Stage 7 — Memory

**Trigger**: Stage 6 emits any terminal receipt state.

**Inputs**: full session record (intent, proposal, risk-report, signature metadata sans signature, receipt).

**Processing**:
1. Compose a `MemoryEntry` (port the shape from `coin-ggui-test/src/core/learning.ts`):
   ```ts
   type MemoryEntry = {
     proposalId, traceId,
     intent, proposal, risk: { verdict, dimensions },
     delegation: { signatureMethod, expiry, spendingCap },
     execution: { adapter, runtimeMode, simulated, status, txHash?, explorerUrl? },
     evaluation: { axis: ["honesty","scope","risk","cost"], scores: number[4] },
     postmortem: string,
     nextAdjustment: string,
     timestamp: string
   };
   ```
2. Append to durable memory store (path defined by implementation; PRD requires "durable across iterations" — concrete path picked at build time).
3. Append `{stage:"memory_recorded", proposalId}` to `logs/commands.jsonl`.
4. UI behavior (per Q5 — Both):
   - Background: silent persistence.
   - Foreground: the `[data-testid="memory-panel-toggle"]` button (always present in the chat shell) updates its badge count by 1; opening the panel reveals an `[data-testid="memory-entry"]` card for the new entry.
5. Transition `MEMORY_RECORDED` (terminal).

**Outputs**:
- No new chat message variant (memory is a panel, not a chat card, per Q5).
- Background trace + memory store write.

**Acceptance Criteria**:
- AC-7.1: After SAFE_DEMO end-to-end, the memory panel toggle badge count increments by exactly 1; clicking the toggle reveals an `[data-testid="memory-entry"]` whose `data-proposal-id` matches the session's proposalId.
- AC-7.2: `grep -c '"stage":"memory_recorded"' logs/commands.jsonl` increments by exactly 1 per terminal session (real, simulated, blocked, or failed).
- AC-7.3 (durability): Kill and restart the dev server; reopen the chat at `/`; click memory toggle → previously-recorded entries are still listed. (Asserts implementation chose a durable store, not in-process memory.)
- AC-7.4 (memory hygiene): Memory entries never contain `signature: "0x..."` raw hex. Asserted by `jq -e '[..|strings|select(test("^0x[0-9a-fA-F]{130,}$"))] | length == 0' data/<memory-file>` exit 0.

---

## 7. UI/UX Spec

> **Folded in from the UI analysis report (uniport-cointoss + coin-ggui-test). Patterns are extracted, not the full source.**

### 7.1 ChatMessage variants (locked enumeration)

> **Engineers MUST use exactly these variants. Inventing new variants is a PRD-level change.**

| Variant | Renders | Emitted by |
|---|---|---|
| `user` | Plain text bubble (right-aligned) | Stage 1 |
| `intent-rejected` | Red bordered card with error code + brief explanation | Stage 1 |
| `pending` | Spinner + stage label + skeleton lines, `data-slow="true"` after 5s | Stages 2/3/5/6 |
| `proposal` | Card with action/chain/amount/recipient/policy + "Review risk" CTA (auto-fires Stage 3) | Stage 2 |
| `proposal-failed` | Red card with error code | Stage 2 |
| `llm-fallback-notice` | Yellow notice strip "deterministic fallback used" | Stage 2 |
| `risk-report` | 9-row grid (one per dim) with green check / red X, verdict line at bottom | Stage 3 (pass) |
| `risk-blocked` | Same grid, only failed rows visible, with `blockedReasons` summary | Stage 3 (fail) |
| `risk-blocked-tick` | Single-row strip in a DCA progress thread for a per-tick failure | Stage 6 (DCA) |
| `wallet-connect-prompt` | Card with "Connect Wallet" button | Stage 4 |
| `wallet-connected` | Strip showing truncated address + "Sepolia" badge | Stage 4 |
| `network-mismatch` | Yellow card "Wrong network" + "Switch to Sepolia" button | Stage 4 |
| `network-required-sepolia` | Confirmation strip "Switched to Sepolia" | Stage 4 |
| `wallet-refused` | Grey strip "Connection cancelled" + "Try again" link | Stage 4 |
| `delegation-signed` | Card showing capped spending / expiry / token allowlist / action | Stage 5 |
| `personal-sign-fallback-notice` | Yellow strip "Wallet doesn't support typed data; used personal_sign" | Stage 5 |
| `signature-refused` | Grey strip "Signature declined" | Stage 5 |
| `adapter-fallback` | Yellow strip "Switched from `<from>` to `<to>` — `<reason>`" | Stage 6 |
| `receipt` | Card matching one of the 5 receipt variants (§4) | Stage 6 |
| `dca-progress` | Strip "Tick N of M, remaining cap X" | Stage 6 (DCA) |
| `trigger-fired` | Strip "Alert condition met — starting new proposal" + link to new proposalId | Stage 6 (alert_triggered) |

> **Implementation note**: each variant has a stable `[data-testid]` and a `data-variant="..."` attribute so playwright tests can rely on selectors without coupling to copy text.

### 7.2 Stage indicators (PendingStates pattern, reused)

Reuse the `policy_checking | risk_checking | signing | submitting | verifying` stage label vocabulary directly from `uniport-cointoss/PendingStates.tsx`. Map:

| FelloPilot stage | Pending label |
|---|---|
| Stage 2 (proposal) | `policy_checking` |
| Stage 3 (risk) | `risk_checking` |
| Stage 5 (sign) | `signing` |
| Stage 6 (submit to adapter) | `submitting` |
| Stage 6 (await onchain confirmation) | `verifying` |

`data-slow="true"` is applied at 5s elapsed in any stage so the UI surfaces sluggishness without claiming success.

### 7.3 Style tokens (direct subset reuse)

```css
/* From uniport-cointoss/packages/ui/src/styles/tokens.scss — subset adopted */
--accent: #097aff;
--green:  #34a853;
--red:    #ea4335;
--amber:  #ffb900;
--radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 16px;  --radius-pill: 999px;
--space-1..8: 4 8 12 16 24 32 48 px;
--shadow-soft: 0 1px 2px rgba(17,24,39,0.04);
--shadow-lift: 0 4px 12px rgba(17,24,39,0.06);

/* FelloPilot additions */
--sim-stripe: repeating-linear-gradient(45deg, #ffe39a, #ffe39a 8px, #ffd76a 8px, #ffd76a 16px);
--badge-sim-bg: #ffd76a;
--badge-sim-fg: #5a3a00;
```

Light/dark mode via `[data-theme="light|dark"]` on `<html>`, persisted in `localStorage` under key `fellopilot-theme`.

### 7.4 Reusable patterns from uniport-cointoss

| Pattern | Source file | Adoption |
|---|---|---|
| `ChatComposer` (textarea + IME-safe Enter) | `apps/web/app/payment-dashboard/ChatComposer.tsx` | Reuse pattern verbatim, swap chat domain |
| `PendingStates` | `apps/web/app/payment-dashboard/PendingStates.tsx` | Reuse, map stage labels per §7.2 |
| Markdown rendering | `apps/web/app/payment-dashboard/ChatMessageItem.tsx` | Reuse `react-markdown` + `remark-gfm` for proposal/rationale text |
| SSE streaming arch | `apps/web/app/api/chat/stream/route.ts` | Reuse for stage events; do NOT reuse the cointoss-specific event payload shape |
| Empty-state seed prompts | `apps/web/app/payment-dashboard/ConversationMessages.tsx` (`dashboardHeroPrompts`) | Reuse pattern; seed with SAFE_DEMO_INTENT and one alt prompt |
| Style tokens | `packages/ui/src/styles/tokens.scss` | Subset copy (§7.3) |
| ResultRows / CopyInline | `apps/web/app/payment-dashboard/result-card-shared.tsx` | Reuse for receipt card key-value rows + tx hash copy button |

### 7.5 New primitives (build new)

| Primitive | Purpose | Why prior art doesn't cover |
|---|---|---|
| `<SimulationBadge>` | Non-dismissable badge on simulated receipts | Neither prior repo has SIMULATION concept |
| `<MemoryPanel>` | Collapsible panel listing memory entries with 4-axis evaluation | coin-ggui-test renders as page section, not chat-side panel |
| `<RiskReportCard>` (9-dim grid) | 9 rows, per-dim pass/fail visualization | coin-ggui-test renders flat booleans; uniport renders 3-state risk readiness |
| `<NetworkMismatchCard>` (EVM-aware) | Detect chainId, prompt switch to Sepolia | Neither prior repo handles EVM mismatch in chat (uniport is XRPL) |
| `<AdapterFallbackStrip>` | Yellow notice strip naming from/to/reason | Honesty contract requires this; not in prior art |

### 7.6 Behavioral specs

- **Scroll lock**: When the user scrolls up by more than 200px from the bottom, auto-scroll on new messages is suppressed until the user scrolls back to within 50px of bottom. (Closes a gap in uniport-cointoss.)
- **IME composition**: Composer must call `event.preventDefault()` only when `nativeEvent.isComposing === false` (port the guard from `ChatComposer.tsx`). Korean input safety.
- **No raw JSON `<details>`**: Per retro E1, the product surface must NOT embed `<details>Raw receipt JSON</details>` blocks. Memory panel renders structured key-value rows only. Debug surface (raw JSON) is permitted only under `/harness` (internal-only).
- **Wallet disconnect mid-session**: If wallet disconnects while in `AWAITING_SIGNATURE`, transition to `WALLET_REFUSED` and surface a `wallet-disconnected` strip. Memory of the in-progress proposal is persisted with `status="abandoned"`.

---

## 8. Product / Harness Boundary

### What is in the **product** (user-visible)

- The chat UI surface at `/` (or whatever the product route is).
- The wallet connect modal (browser injected wallets, EIP-6963 multi-discovery).
- The 9-dimension risk report card.
- The delegation signing prompt (browser wallet pop-up — owned by the wallet, surfaced via wagmi).
- The execution receipt card (5 variants).
- The memory panel (collapsible).
- Demo theming (light/dark toggle).

### What is in the **harness** (internal, never exposed in product UI)

- `/harness` route(s), if any. Reachable only by direct URL entry.
- `scripts/harness/*` — preflight, capability_matrix, forbidden_grep, honesty_lint, blast_radius, spec_diff, generate_testnet_signer, layered_gate_test, determinism_check.
- `.omo/rules/*` policy files (immutable).
- `.opencode/plugin/guard.ts` (mainnet/seed/key prompt blocker).
- `.opencode/plugin/trace.ts` (every tool execution → `logs/commands.jsonl`).
- The `ulw-loop` runner and `PROMPT.md` skeleton.
- Judge / ggui references (deprecated names, never to appear in product).
- Internal evaluation/postmortem agents (oracle/momus/metis/etc.).

### Hard separation rules

- Product code MUST NOT import from `scripts/harness/`, `.omo/rules/`, or `.opencode/plugin/`. Enforced by build-time check (see Completion Conditions M1).
- Product chat copy MUST NOT contain any of `FORBIDDEN_PRODUCT_TOKENS` (§3). Enforced by `forbidden_grep.sh`.
- The harness MAY read product memory store / `logs/commands.jsonl` (one-way visibility for verification scripts). The product MAY NOT read harness state.

### URL surface

- `/` — chat UI (product)
- `/harness/*` — internal panels (if implemented). NOT linked from `/`. Returns 200 only when navigated directly.

---

## 9. Demo Scenarios (Safe + Blocked)

### Scenario A — SAFE case (happy path, real attestation)

**Operator setup**:
```bash
bash scripts/harness/preflight.sh dev
bash scripts/harness/generate_testnet_signer.sh   # creates/loads ~/.fellopilot/signer.env
source ~/.fellopilot/signer.env
export FELLOPILOT_ADAPTER=direct_viem
# Fund the signer's Sepolia address via https://sepolia-faucet.pk910.de/
npm run dev
```

**User actions**:
1. Open `/` → empty-state chat with seed prompt tile containing `SAFE_DEMO_INTENT`.
2. Click the seed tile (or paste & submit). Conversation message appears.
3. Stage 2 emits `proposal` within 10s: `{action:"swap", chain:"sepolia", amount:1, tokenIn:USDC, tokenOut:ETH, executionPolicy:{type:"oneshot"}}`.
4. Stage 3 emits `risk-report` with all 9 dimensions `pass`.
5. Stage 4: if wallet not connected, `wallet-connect-prompt` → user connects MetaMask → if not on Sepolia, `network-mismatch` → switch → `network-required-sepolia` strip.
6. Stage 5: `pending(signing)` → MetaMask pops up `eth_signTypedData_v4` with the `DelegationIntent` → user signs → `delegation-signed` card.
7. Stage 6: `pending(submitting)` → `pending(verifying)` → `receipt` card variant `real_attestation` with a real Sepolia `txHash` and `https://sepolia.etherscan.io/tx/...` link. No SIMULATION badge.
8. Stage 7: memory panel toggle badge count increments to 1.

**Expected runtime**: ≤30s wall-clock from intent submit to receipt card (per `capability_matrix.json` verified_e2e of 18s).

**Observable artifacts**:
- New line in `logs/commands.jsonl` per stage (7 minimum).
- Real Sepolia tx on `sepolia.etherscan.io`.
- One memory entry in the durable store.

### Scenario B — BLOCKED case (refusal, no signature, no execution)

**Operator setup**: Same dev server; adapter setting irrelevant since flow never reaches Stage 6.

**User actions**:
1. User pastes `UNSAFE_DEMO_INTENT` into the chat composer and submits.
2. Stage 2 emits a `proposal` (the LLM may produce a coherent draft — that's fine; risk gate is the enforcer).
3. Stage 3 emits `risk-blocked` listing ≥3 failed dimensions: at minimum `mainnetPolicySatisfied` (chain claims mainnet), `amountAllowed` (1000 > 10), `approvalRequired` (intent demands no approval).
4. No `sign-button` is rendered. No `delegation-signed` card. No `receipt` card.
5. A `blocked` variant receipt is recorded to memory; memory panel toggle increments to 1 (blocked is still a memory event).
6. Conversation remains active; user can submit a new (safe) intent and restart the flow.

**Expected runtime**: ≤5s wall-clock from intent submit to `risk-blocked` card.

**Observable artifacts**:
- New lines in `logs/commands.jsonl` for stages 1, 2, 3 (no later stages).
- One `blocked` memory entry.
- ZERO new transactions on any chain.

### Scenario C — DCA path (real-time during demo)

**Operator setup**: Same as Scenario A.

**User actions**: User types `"Sepolia에서 매 5초마다 1 USDC를 ETH로 swap, 총 2번"`. Stages 1-5 follow the safe flow. Stage 6 emits one `receipt` and one `dca-progress` strip per tick, two of each over 10-15s. Memory records 2 execution entries under the same delegation. (This scenario validates AC-6.4.)

### Scenario D — Adapter fallback (honesty demo)

**Operator setup**: `FELLOPILOT_ADAPTER=direct_viem` BUT no signer key (`unset FELLOPILOT_TESTNET_SIGNER_KEY`).

**User actions**: Run SAFE_DEMO. The direct_viem adapter detects missing key → emits `adapter-fallback` chat strip (`from=direct_viem, to=mock, reason="signer key not loaded"`) → mock adapter produces `simulated_attestation` with `SIMULATION` badge visible. (This scenario validates AC-6.6 and §H2.)

---

## 10. Out of Scope (this demo)

> **Explicit exclusions. If a request lands during execution that matches one of these, it's rejected as out-of-scope and tracked separately.**

### Functional exclusions

- **Mainnet execution** (any chain). Forbidden by `.omo/rules/ralphthon-mode.md`.
- **Real swap routing on testnet** via CoinFello. Capability matrix says Sepolia is not supported by CoinFello's swap route; `direct_viem` produces an *attestation*, not a swap.
- **Real swap routing on testnet** via a Uniswap-style DEX integration. Building a Sepolia DEX router integration is out of demo scope (would be straightforward but adds surface).
- **Cross-chain intents** (e.g., "swap on Sepolia, send to Polygon"). Single-chain demo only.
- **Base Sepolia support**. Token "Base Sepolia" is forbidden on product surface; wagmi config restricted to `sepolia` only.
- **Production CoinFello SIWE/secure-enclave flow** beyond what's already wired via `npx @coinfello/agent-cli`. The product makes ≥1 real CLI call (e.g., `get_account` at session boot) for M1 evidence, but does not own a full SIWE UX.
- **Third-party-audited production delegation contract**. The Sepolia UNAUDITED ERC-7710-style `DelegationManager` is shipped for this demo; a production audit remains outside demo scope.
- **Trade automation that bypasses human approval**. "Alert-triggered" creates a new proposal each fire; it never auto-executes.
- **Real-time market data / price feeds** integrated for alert triggers. Demo uses mocked or test-data triggers (e.g., a button labeled "Simulate trigger fire" inside the demo).

### UX exclusions

- **Multi-user / authentication**. Single-session, single-wallet demo.
- **Mobile / native app**. Web only.
- **Internationalization beyond Korean+English mixed copy** (Korean is primary).
- **Accessibility certification (WCAG AAA)**. Reasonable a11y (aria-live for chat, focus management) is in scope; full audit is not.
- **Persistent server-side database**. Memory store is local JSON; explicit goal is durable across iterations, not across machines.
- **Conversation export / sharing**. No export UI.

### Engineering exclusions

- **Production observability (metrics, traces beyond `logs/commands.jsonl`)**. Local jsonl trace is sufficient for demo.
- **Performance optimization beyond what the prior art already does**. Streaming is fine; no SSR optimization, no Edge runtime tuning.
- **Cross-browser testing beyond Chromium-family**. Playwright tests target Chromium.
- **Security audit**. Honesty contract is enforced via lints; no third-party audit.

---

## 11. Completion Conditions (binary, Oracle-verifiable)

> **Mapped 1:1 to the M1/M2/M3 milestones in `STATE.md`. Every condition is a script or test that exits 0 or asserts true. No human judgement required.**

### M1 — Product flow + boundary

- [ ] **M1.1**: Run Scenario A end-to-end with `FELLOPILOT_ADAPTER=direct_viem` and a funded signer → produces a `receipt` card variant `real_attestation` with a real `0x[a-f0-9]{64}` txHash that resolves at `https://sepolia.etherscan.io/tx/<hash>` (HTTP 200) within 30s. **OR** with adapter unset, produces a labeled `simulated_attestation` receipt with `txHash:undefined && explorerUrl:undefined && simulated:true`. **NEVER** both `simulated:true` AND a 0x… hash. *Verifier*: playwright spec `tests/e2e/demo-safe.spec.ts` + `scripts/harness/honesty_lint.sh data/execution_receipt.json` exit 0.
- [ ] **M1.2**: Demo intent text constants in the product source equal the SAFE_DEMO_INTENT / UNSAFE_DEMO_INTENT strings in §3 verbatim. *Verifier*: `scripts/harness/spec_diff.sh` exit 0 (asserts product `SAFE_DEMO`/`UNSAFE_DEMO` constants match `.omo/rules/env.md`).
- [ ] **M1.3**: At least one real CoinFello CLI call against `app.coinfello.com` completes and is logged. Any of `get_account`, `sign_in`, `new_chat` qualifies. *Verifier*: `grep -E '"tool":"npx.*@coinfello/agent-cli.*(get_account|sign_in|new_chat)"' logs/commands.jsonl | wc -l` ≥ 1.
- [ ] **M1.4**: Product code contains zero references to forbidden tokens (`Judge`, `ggui`, `harness`, `Base Sepolia`). *Verifier*: `bash scripts/harness/forbidden_grep.sh` exit 0.
- [ ] **M1.5**: `/harness` (if exists) returns 200 only on direct entry, and is not linked from any product page. *Verifier*: `bash scripts/harness/spec_diff.sh` confirms no anchor with `href` matching `/harness*` exists in any product page's rendered HTML.
- [ ] **M1.6**: All 7 stages emit a `[data-testid]`-tagged chat element for the SAFE_DEMO_INTENT flow. *Verifier*: playwright spec asserts `[data-testid="chat-message-user"]`, `chat-card-proposal`, `chat-card-risk-report`, `chat-message-wallet-connected`, `chat-card-delegation-signed`, `chat-card-receipt`, and `memory-panel-toggle[data-count="1"]` all become visible during a single run.

### M2 — Honest simulation + pending + risk gating

- [ ] **M2.1**: Every receipt with `simulated:true` renders a visible `[data-testid="simulation-badge"]`. *Verifier*: playwright spec `tests/e2e/simulation-badge.spec.ts` runs Scenario D and asserts the badge is present and non-dismissable (clicking it does nothing).
- [ ] **M2.2**: No simulated receipt contains a fake `txHash` or explorer link. *Verifier*: `bash scripts/harness/honesty_lint.sh data/execution_receipt.json` returns exit 0 for every receipt variant in test fixtures. A negative-test fixture with `simulated:true, txHash:"0xfake..."` MUST cause exit ≠ 0.
- [ ] **M2.3**: `pending` chat cards appear within 500ms of stage entry and stay visible until the stage emits its terminal message. *Verifier*: playwright spec asserts presence of `[data-testid="pending-card"][data-stage="signing"]` during the wallet sign window.
- [ ] **M2.4**: Mainnet trigger, seed-phrase input, and private-key input are blocked at the product layer. *Verifier*: playwright spec submits each and asserts `[data-testid="chat-message-intent-rejected"][data-error-code]` with one of `E001_INTENT_CONTAINS_SECRET`, `E_MAINNET_REFUSED`; AND no network call to a mainnet chainId occurs (mocked `window.ethereum` checked).
- [ ] **M2.5**: Risk gate enforces all 9 dimensions. *Verifier*: `curl -X POST /api/risk` with a fixture that fails each dim one at a time → response's `dimensions[i].status==="fail"` for the targeted dim, all others `"pass"`. Loop over all 9.

### M3 — Trace + memory

- [ ] **M3.1**: `logs/commands.jsonl` receives a new line for every tool execution during a SAFE_DEMO run. *Verifier*: `wc -l logs/commands.jsonl` before vs after the run differs by ≥7 (one per stage minimum).
- [ ] **M3.2**: Memory persists across dev server restart. *Verifier*: playwright spec runs SAFE_DEMO → records pre-restart memory count → kills + restarts dev server (`scripts/harness/preflight.sh dev`) → reopens `/` → asserts memory count ≥ pre-restart count.
- [ ] **M3.3**: At least one Oracle verification step references `logs/commands.jsonl`. *Verifier*: at least one entry in the verification script set (`scripts/harness/*.sh`) contains a literal `logs/commands.jsonl` reference and is invoked during the completion check. `grep -l "logs/commands.jsonl" scripts/harness/*.sh | wc -l` ≥ 1.
- [ ] **M3.4**: Memory entry shape matches §6.7 spec (includes intent, proposal, risk verdict, delegation metadata, execution status, evaluation axes, postmortem, nextAdjustment). *Verifier*: `jq -e 'all(.proposalId and .intent and .proposal and .risk and .delegation and .execution and .evaluation and .timestamp)' data/<memory-file>` exit 0.

### Cross-cutting binary asserts

- [ ] **CC.1**: `npm run build` and `npm run typecheck` exit 0.
- [ ] **CC.2**: `npm test` (or `bun test`) exit 0; all Playwright specs pass.
- [ ] **CC.3**: `bash scripts/harness/preflight.sh dev` exit 0 (asserts environment, ports, RPCs reachable).
- [ ] **CC.4**: `bash scripts/harness/honesty_lint.sh` runs across all receipt fixtures with exit 0.
- [ ] **CC.5**: `bash scripts/harness/forbidden_grep.sh` exit 0.
- [ ] **CC.6**: PRD content is unchanged at end of build (this file is the immutable spec for the build; changes require a new planning round). *Verifier*: `git diff --exit-code .sisyphus/plans/fellopilot-prd.md` exit 0 at sign-off.

---

## 12. Open Issues / Unresolved Decisions

> **Decisions deferred to implementation kickoff, OR requiring operator clarification before Sisyphus starts.**

1. **Memory store path** — PRD requires durability but does not pin a file path. Recommend `data/memory.jsonl` (append-only) per retro D1/D2 isolation rules. Operator confirms or overrides at `/start-work`.
2. **LLM provider/model** — PRD says "LLM (provider TBD)". Options: OpenAI Responses API (uniport-cointoss pattern, requires `OPENAI_RESPONSES_URL`), Anthropic, local. Recommend OpenAI Responses for prior-art alignment. Operator picks at kickoff.
3. **Recipient allowlist source** — PRD points to `data/recipient_allowlist.json`. Operator decides whether to ship a hand-curated 5-entry list (e.g., a couple of Sepolia router contracts) or leave empty (which would block every swap until populated).
4. **Alert-triggered demo data** — Real price feeds on Sepolia are rare/unreliable. PRD assumes a "Simulate trigger fire" button is acceptable for the demo. Operator confirms or specifies a real price source (e.g., Chainlink Sepolia ETH/USD).
5. **CoinFello `get_account` placement** — PRD requires ≥1 real CLI call for M1.3. Suggested invocation: on app boot, hit `get_account` and log the result. Alternative: trigger on first wallet connect. Operator picks.

---

## 13. Appendix — References & Prior Art

### Immutable harness inputs (read each iteration)

- `.omo/rules/ralphthon-mode.md` — mainnet forbidden, testnet allowed, never block on questions.
- `.omo/rules/crypto-safety.md` — no fake txHash, no key prompts.
- `.omo/rules/boundary.md` — no Judge/ggui on product, `/harness` internal, SIMULATION label mandatory.
- `.omo/rules/stack.md` — wagmi + viem only, App Router, no ethers/web3.
- `.omo/rules/env.md` — adapter selection table, demo intent constants (SAFE/UNSAFE), signer persistence at `~/.fellopilot/signer.env`.
- `.omo/rules/forbidden-tokens.txt` — `Base Sepolia`, `harness`.
- `.omo/rules/observability.md` — heartbeat protocol, plan ≤5 waves × 3 tasks/wave, `logs/commands.jsonl` durable.
- `scripts/harness/capability_matrix.json` — provider × action × chain support; verified Sepolia attestation `0xdfb197de…` (18s).
- `STATE.md` — M1/M2/M3 binary milestones.
- `PROMPT.md` — `/ulw-loop` body and Plan Limits.
- `RETROSPECTIVE.md` — 24 fail/rework events from Ralphathon-1 (A1-K2). Notable items wired into this PRD:
  - **C1** (`buildDelegationIntent` non-determinism) → §6.5 step 1 (`expiry` computed at proposal time, not inside hash).
  - **E1/I1** (raw JSON `<details>` leak) → §7.6 forbids `<details>JSON.stringify(...)` blocks on product.
  - **E2** (mock honesty contract) → §4 receipt taxonomy + §11 M2.2 verifier.
  - **F1** (CoinFello Base Sepolia missing) → §3 single-chain Sepolia + §10 out-of-scope.
  - **D1/D2** (state file collision) → §3 memory store path note + §12 open issue 1.
  - **H3** (`approver` invariant) → §5 state machine `EXECUTED_REAL` invariant.
  - **K2** (CoinFello CLI sequence contract) → §6.6 adapter contract notes.

### Reusable prior art (paths the implementer should open before writing)

**From `coin-ggui-test` (the 70% backbone)**:
- `src/types/domain.ts` — Receipt + DelegationIntent + RuntimeMode types.
- `src/core/risk.ts` — 6 base risk dimensions implementation.
- `src/core/delegationIntent.ts` — EIP-712 schema + `verifyTypedData` server-side.
- `src/core/learning.ts` + `src/storage/jsonStore.ts` — memory + atomic JSON writes.
- `src/adapters/coinfelloAdapter.ts` — CoinFello CLI wrapper with forbidden-flag guards.
- `src/adapters/directViemAdapter.ts` — Sepolia attestation tx via viem.
- `src/adapters/mockCoinfelloAdapter.ts` — honesty-contract-satisfying simulation.
- `app/wagmi.ts` — wagmi v2 config (restrict chains to `[sepolia]` only for FelloPilot).
- `app/components/SignDelegationButton.tsx` — typed + personal_sign fallback.
- `RISK_RULES.md` — policy source for §3 constants.

**From `uniport-cointoss` (chat UI patterns)**:
- `apps/web/app/payment-dashboard.tsx` — chat shell topology.
- `apps/web/app/payment-dashboard/ChatComposer.tsx` — IME-safe Enter submit pattern.
- `apps/web/app/payment-dashboard/ChatMessageItem.tsx` — Markdown + action/result card embed.
- `apps/web/app/payment-dashboard/PendingStates.tsx` — stage-labeled skeleton/spinner.
- `apps/web/app/api/chat/stream/route.ts` — custom SSE architecture.
- `apps/web/app/payment-dashboard/result-card-shared.tsx` — reusable key-value receipt rows.
- `packages/ui/src/styles/tokens.scss` — CSS variable design tokens (light + dark).

### Forbidden inputs / patterns (never adopt)

- `uniport-cointoss/apps/web/app/travel-demo/**` — domain-irrelevant.
- `uniport-cointoss/apps/web/app/payment-dashboard/DelegationSetupCard.tsx` — XRPL-specific copy; reuse pattern shape only.
- `coin-ggui-test/app/wagmi.ts:chains` literal `[sepolia, baseSepolia]` — drop `baseSepolia` per §H6.
- Any `<details>JSON.stringify(...)</details>` block on product pages — per retro E1.
- `--use-unsafe-private-key` CLI flag — blocked by `.opencode/plugin/guard.ts` AND must be rejected at adapter layer too (defense in depth).

### Verification script inventory (to extend)

Existing under `scripts/harness/`:
- `preflight.sh`, `generate_testnet_signer.sh`, `start_ralphathon.sh`, `forbidden_grep.sh`, `honesty_lint.sh`, `blast_radius.sh`, `spec_diff.sh`, `postinstall_verify.sh`, `reset_state.sh`, `tmux_runner.sh`, `doc_type_sync.sh`, `determinism_check.ts`, `layered_gate_test.ts`, `capability_matrix.json`, `adapter_fixtures/`.

To add for this PRD's completion conditions:
- `tests/e2e/demo-safe.spec.ts` — Scenario A end-to-end (M1.1, M1.6).
- `tests/e2e/demo-blocked.spec.ts` — Scenario B (AC-3.3).
- `tests/e2e/simulation-badge.spec.ts` — Scenario D (M2.1).
- `tests/e2e/memory-durability.spec.ts` — M3.2.
- `scripts/harness/verify_log_coverage.sh` — counts `logs/commands.jsonl` deltas per scenario (M3.1).
- `scripts/harness/verify_no_harness_links.sh` — scans rendered HTML for `/harness` anchors (M1.5).
- `scripts/harness/verify_risk_dims.sh` — POSTs 9 targeted fixtures to `/api/risk`, asserts each blocks exactly the intended dim (M2.5).

---

> **End of PRD v1.** Engineers begin from `§6 Core Flow` for stage-by-stage implementation; verifiers begin from `§11 Completion Conditions` for sign-off. Memory store path, LLM provider, and recipient allowlist source are the three operator inputs needed at `/start-work` kickoff.
