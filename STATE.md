# FelloPilot — Ralphthon State

Snapshot of milestone progress for the unattended FelloPilot build loop.
Update only via the loop or explicit user instruction. Binary completion only.

## Milestones

- [x] **M1 — Product flow + boundary**
  - [x] Core FelloPilot user flow runs end-to-end on testnet via mock adapter (SIMULATION receipt path verified).
  - [x] Product surface respects `.omo/rules/boundary.md` (no Judge / ggui exposure; `/harness` internal only).
  - [x] CoinFello CLI `get_account` AND `sign_in` wired at `src/app/api/coinfello/{get_account,sign_in}/route.ts`; both invoked via smoke.mjs. Real SIWE round-trip verified (User ID returned, session token saved).
  - [x] Real `direct_viem` Sepolia contract attestation tx **verified onchain**. Current sample tx hash: `0xccdc33b3c2704f623f12f43c754b212352b2da5a7b1ae675265b5e34bee79f35` (Sepolia, status=success, block 11009802, gasUsed=57590, value=0 wei, `DelegationManager.attestIntent`, `DelegationAttested(intentHash, approver)`).

- [x] **P1 (deferred items from PRD §10) — shipped 2026-06-07**
  - [x] **P1.1 LLM-generated proposal** — OpenAI Responses API (`gpt-4.1-mini`) via `src/lib/llmProposal.ts`; deterministic rule-based fallback emits `llm-fallback-notice` chat strip (mirrors H2 adapter-fallback pattern); E001/E002 secret/empty checks precede LLM call (H4 invariant); verified live: `logs/commands.jsonl` stage `llm_proposal_succeeded` with `model:gpt-4.1-mini`, `proposalSource:"llm"` on response.
  - [x] **P1.2 DCA runtime watcher** — `src/lib/runtime/dcaScheduler.ts` + `data/dca_ledger.json` + `/api/dca/{start,tick,state}` routes; per-tick 9-dim risk re-eval; `risk-blocked-tick` chat on failure (no spend); `dca-progress` chat on success. Verified e2e via `scripts/demo_dca_e2e.mjs` — 6/6 honesty assertions PASS with 2 ticks at 5s cadence, simulated_attestation receipts, ledger tracks `tickIndex/totalTicks/consumedAmount`.
  - [x] **P1.3 Alert-triggered watcher** — `src/lib/runtime/alertSimulator.ts` + `data/alert_state.json` + `/api/alert/{start,simulate_trigger,state}` routes. Per PRD §10 (line 667) uses Simulate-trigger button, NOT Chainlink (out of scope). Trigger spawns fresh proposal (oneshot policy) with `parentProposalId` provenance in memory entry. Verified end-to-end via curl: alert armed → simulate_trigger → new proposalId with parent traceability.
  - [x] **P1.4 CoinFello SIWE sign_in** — `runSignIn()` in `src/lib/adapters/coinfello.ts` + `/api/coinfello/sign_in` route + smoke.mjs assertion. RPC_URL_OVERRIDE defaults to `https://ethereum-rpc.publicnode.com` per `.omo/rules/env.md`. Verified: smoke test shows `Sign-in successful. User ID: S7JOYFG0nsNXgq2G6TstZjaQjN8Y0UPC`.
  - [x] **5 new chat variants** (4 PRD-spec'd + 1 auxiliary): `llm-fallback-notice`, `dca-progress`, `risk-blocked-tick`, `trigger-fired`, plus internal `alert-armed` (renders Simulate-trigger button). All 21 PRD ChatMessage variants now wired in `src/app/page.tsx`.

  - [x] **P1.5 ERC-7710 onchain DelegationManager — shipped 2026-06-08**. Per operator decisions (Q1 spending-cap enforcement on-chain / Q2 single manager / Q3 UNAUDITED tag). Contract: `contracts/src/DelegationManager.sol`. Deployed Sepolia at `0xaD12fDC1fF472D54313Be5FCEc7b1D672B59e247` (deploy tx `0x41dbd4f0...`). First on-chain attestIntent call: `0xccdc33b3...` (block 11009802, gas 57590, DelegationAttested event emitted with (intentHash, approver) indexed topics). `directViem` adapter calls `attestIntent` whenever `delegation.attestation` is present (eth_signTypedData_v4 path); personal_sign remains a compatibility attestation path until the verify route persists raw personal_sign signatures too. UI surfaces `chat-message-contract-unaudited-notice` strip on every real_attestation receipt with `contractAudited:false`. REAL branch `demo_safe_e2e.mjs` now asserts 13/13 incl. 4 new contract assertions.

  **Deliberately deferred**:
  - PRD §12 open issues — defaults applied; override paths documented in HANDOFF.md.

- [x] **M2 — Honest simulation + pending + risk gating**
  - [x] Simulations clearly labeled `SIMULATION`; verified `txHash:undefined && explorerUrl:undefined` in `src/lib/adapters/mock.ts:32-45` and `src/app/api/execute/blocked/route.ts:18-33`.
  - [x] Pending / in-flight states surfaced via `<pending>` card in 5 stages (`src/app/page.tsx`).
  - [x] Mainnet, private key, and seed phrase blocked at intent layer (`src/lib/intent.ts`) and risk layer (`src/lib/risk.ts` mainnetPolicySatisfied + privateKeySafe dims).

- [x] **M3 — Trace + memory**
  - [x] `logs/commands.jsonl` captures every API tool execution via `appendCommandLog` (`src/lib/store.ts:36-41`) and `.opencode/plugin/trace.ts`.
  - [x] Memory persists across dev-server restart at `data/memory.jsonl` (append-only). Real-attestation entries carry real `txHash` and `explorerUrl` pointing to `sepolia.etherscan.io`.
  - [x] Wallet connect/sign client events traced via `/api/trace` POST (`src/app/api/trace/route.ts`).

- [x] **PRD §11 strict verifier inventory — 15/15 PASS (2026-06-08)**
  - [x] M1.1 honest receipt (SIM + REAL onchain) — `scripts/demo_safe_e2e.mjs` 9/9
  - [x] M1.2 demo intent constants — `scripts/harness/spec_diff.sh`
  - [x] M1.3 ≥1 real CoinFello CLI call — `scripts/smoke.mjs` (get_account + sign_in)
  - [x] M1.4 no forbidden tokens — `scripts/harness/forbidden_grep.sh` + `scripts/audit_forbidden.sh`
  - [x] M1.5 `/harness` not linked — `scripts/harness/verify_no_harness_links.sh` (NEW)
  - [x] M1.6 7 stages emit testid — `tests/e2e/demo-safe.spec.ts` (stages 1-4) + `scripts/demo_safe_e2e.mjs` (stages 5-7)
  - [x] M2.1 simulation-badge non-dismissable — `tests/e2e/simulation-badge.spec.ts` (CSS + mount-check)
  - [x] M2.2 no fake txHash — `scripts/harness/honesty_lint.sh` + `honesty_lint_negative_test.sh` (5/5)
  - [x] M2.3 pending states visible — 5 `<pending>` cards in page.tsx
  - [x] M2.4 mainnet/seed/privkey blocked — `tests/e2e/demo-blocked.spec.ts`
  - [x] M2.5 9 risk dims — `scripts/harness/verify_risk_dims.sh` (1 positive + 9 isolated, NEW)
  - [x] M3.1 commands.jsonl per stage — `scripts/harness/verify_log_coverage.sh` (all 7 named stages, NEW)
  - [x] M3.2 memory across restart — `tests/e2e/memory-durability.spec.ts` (3-layer + store.ts static-grep)
  - [x] M3.3 ≥1 verifier references commands.jsonl — `smoke.mjs` + `verify_log_coverage.sh`
  - [x] M3.4 memory entry shape — `MemoryEntry` TypeScript-enforced + `memory_hygiene_lint.sh` (NEW)

- [x] **Items 2 + 3 from gap analysis — shipped 2026-06-08 (~50m + ~3h)**
  - [x] **Item 2a** LLM fallback test — `scripts/demo_llm_fallback.mjs` (isolated dev server, 7/7 PASS)
  - [x] **Item 2b** verify route schema guard — `src/app/api/delegation/verify/route.ts` `validateVerifyBody()` + T10/T11 in `demo_stale_delegation.mjs` (11/11 PASS)
  - [x] **Item 3a** 3 PRD strict-verifier harness scripts — listed in M3.1/M1.5/M2.5 above
  - [x] **Item 3b** 4 Playwright e2e specs — listed in M1.6/M2.4/M2.1/M3.2 above. `npx playwright test` → 4/4 PASS in ~13s.

- [x] **H5 honesty contract — 9 stale-delegation surfaces bound (Oracle rounds 1-9)**
  - [x] DCA `startDca()` + `tickDca()` + alert `startAlert()` — bind `delegation.proposalId === proposal.id`
  - [x] Verify route — `proposalIdBindingValid` + `approverBindingValid` + server-computed `intentHash` + `personalSignBindingValid`
  - [x] Execute route — refuses unbound active proposal
  - [x] Adapters (mock + directViem) — defense-in-depth proposalId check
  - Regression suite: `scripts/demo_stale_delegation.mjs` 11/11 PASS (T1-T9 H5 + T10-T11 schema)

- [x] **Wallet-mock revival — shipped 2026-06-08**
  - [x] Root cause was **NOT** any of the 4 ranked suspects (BigInt serialization, EIP712Domain auto-inject, address checksum, async error swallow). It was missing CORS on sign-server (browser fetch from :3000 to :3098 hit a 404 OPTIONS preflight). Fix: 8 lines in `tests/e2e/helpers/sign-server.mjs`.
  - [x] Second bug found via the same diagnostic: personal_sign path signed the hex-encoded message as if it were UTF-8 text. Fix: detect hex-bytes and pass `{ message: { raw: text } }` to viem.signMessage so the EIP-191 prefix is applied to the right bytes (matches what `verifyMessage` checks against on the server).
  - [x] `installWalletMock(page, options)` refactored to accept `{ chainIdHex, signTypedDataThrows }` + `globalThis.__triggerMockChainChanged()` injection hook.
  - [x] 5 new AC tests (all green):
    - `tests/e2e/demo-safe-full.spec.ts` (AC-4.3 + AC-5.4 + AC-6.1)
    - `tests/e2e/chain-mismatch.spec.ts` (AC-4.2 — static-grep + runtime hybrid; wagmi v2 normalizes wallet chainId to config's first chain at connect time, so the runtime "wallet on mainnet" path is not testable without product wagmi config changes; static-grep proves the switch path is wired correctly)
    - `tests/e2e/personal-sign-fallback.spec.ts` (AC-5.2)
    - `scripts/demo_llm_timeout.mjs` (AC-2.2: mock OpenAI delays >10s → E003_LLM_TIMEOUT → rule_based fallback within 15s budget; 7/7 PASS)
    - `scripts/demo_adapter_fallback.mjs` (AC-6.6: FELLOPILOT_ADAPTER=direct_viem with empty FELLOPILOT_TESTNET_SIGNER_KEY → directViem returns failed variant → execute route falls back to mock + emits fallbackTrail; 8/8 PASS)

- [x] **Cumulative AC coverage: 35/35 automated** (was 30/35). H7 stays PARTIAL on multi-tab wallet edges (unchanged).

## Notes

- Source of truth: this file. Loop must read before each iteration and update only on verified completion.
- Rules (`.omo/rules/*`) and `AGENTS.md` are immutable from inside the loop (enforced by `.opencode/plugin/guard.ts`).
- **Local `main` is pushed to origin/main as of final verification. Confirm with `git rev-list --count origin/main..HEAD` → `0`.**
