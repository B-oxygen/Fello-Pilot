# FelloPilot — Ralphthon State

Snapshot of milestone progress for the unattended FelloPilot build loop.
Update only via the loop or explicit user instruction. Binary completion only.

## Milestones

- [ ] **M1 — Product flow + boundary**
  - Core FelloPilot user flow runs end-to-end on testnet.
  - Product surface respects `.omo/rules/boundary.md` (no Judge / ggui exposure; `/harness` internal only).

- [ ] **M2 — Honest simulation + pending + risk gating**
  - Simulations are clearly labeled `SIMULATION`; no fake `txHash` or fake explorer links.
  - Pending / in-flight states are surfaced to the user instead of being faked as success.
  - Mainnet paths, private key prompts, and seed phrase prompts are blocked end-to-end.

- [ ] **M3 — Trace + memory**
  - `logs/commands.jsonl` captures every tool execution (via `.opencode/plugin/trace.ts`).
  - Loop-side memory persists across iterations so the harness can resume without human context.

## Notes

- Source of truth: this file. Loop must read before each iteration and update only on verified completion.
- Rules (`.omo/rules/*`) and `AGENTS.md` are immutable from inside the loop (enforced by `.opencode/plugin/guard.ts`).
