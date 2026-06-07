# FelloPilot — Ralphthon State

Snapshot of milestone progress for the unattended FelloPilot build loop.
Update only via the loop or explicit user instruction. Binary completion only.

## Milestones

- [x] **M1 — Product flow + boundary**
  - [x] Core FelloPilot user flow runs end-to-end on testnet via mock adapter (SIMULATION receipt path verified).
  - [x] Product surface respects `.omo/rules/boundary.md` (no Judge / ggui exposure; `/harness` internal only).
  - [x] CoinFello CLI `get_account` wrapper wired at `src/app/api/coinfello/get_account/route.ts`; invoke via smoke.mjs to log evidence.
  - [x] Real `direct_viem` Sepolia attestation tx **verified onchain**. Sample tx hashes: `0x068e9c3b546b1e6360028622e1815563188ac68344178010ddc6c82da9edfdb9`, `0x3ce5d7f93b1f16f1bc787b45af7f33b05e64166496db8cca35acd16fe0c67312` (Sepolia, status=success, gasUsed≈23200, value=0 wei attestation self-tx; calldata = ABI-encoded `(approver address, delegationIntentHash bytes32)`).

- [x] **M2 — Honest simulation + pending + risk gating**
  - [x] Simulations clearly labeled `SIMULATION`; verified `txHash:undefined && explorerUrl:undefined` in `src/lib/adapters/mock.ts:32-45` and `src/app/api/execute/blocked/route.ts:18-33`.
  - [x] Pending / in-flight states surfaced via `<pending>` card in 5 stages (`src/app/page.tsx`).
  - [x] Mainnet, private key, and seed phrase blocked at intent layer (`src/lib/intent.ts`) and risk layer (`src/lib/risk.ts` mainnetPolicySatisfied + privateKeySafe dims).

- [x] **M3 — Trace + memory**
  - [x] `logs/commands.jsonl` captures every API tool execution via `appendCommandLog` (`src/lib/store.ts:36-41`) and `.opencode/plugin/trace.ts`.
  - [x] Memory persists across dev-server restart at `data/memory.jsonl` (append-only). Real-attestation entries carry real `txHash` and `explorerUrl` pointing to `sepolia.etherscan.io`.
  - [x] Wallet connect/sign client events traced via `/api/trace` POST (`src/app/api/trace/route.ts`).

## Notes

- Source of truth: this file. Loop must read before each iteration and update only on verified completion.
- Rules (`.omo/rules/*`) and `AGENTS.md` are immutable from inside the loop (enforced by `.opencode/plugin/guard.ts`).
