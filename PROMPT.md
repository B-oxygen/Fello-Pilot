# FelloPilot — Ralphthon `/ulw-loop` Prompt (Skeleton)

> Unattended build loop for the FelloPilot product. Run via `/ulw-loop`.
> **Do not invoke this file manually.** It is the prompt body for the loop.
> Operating mode: testnet only, zero human intervention, never block on questions.

---

## Operating Constraints (immutable — sourced from `.omo/rules/`)

- Read before every iteration: `.omo/rules/ralphthon-mode.md`, `.omo/rules/crypto-safety.md`, `.omo/rules/boundary.md`, `.omo/rules/stack.md`, `.omo/rules/observability.md`.
- Mainnet execution is forbidden. Testnet live CoinFello calls are allowed for both demo and unattended loop.
- No fake `txHash`, no fake explorer links. Simulations must be labeled `SIMULATION`.
- Never request seed phrases or private keys.
- Product surface must not expose Judge or ggui. `/harness` is internal-only.
- If blocked, do not ask — pick the next viable path and continue.

## Loop Inputs

- `STATE.md` — current milestone progress (binary checkboxes).
- Product source under `src/` (FelloPilot codebase — modify freely; harness layer is off-limits except via explicit user instruction).
- `logs/commands.jsonl` — prior tool trace for resume-from-last-step.

## Loop Output (per iteration)

1. Update `STATE.md` checkbox if and only if the milestone's binary completion condition is met (see below).
2. Append a one-line iteration summary to `logs/traces/` (optional, loop's choice of filename).
3. Continue to the next unfinished milestone in the order M1 → M2 → M3.

---

## Milestones (binary completion only)

### M1 — Product flow + boundary

**Scope**: Ship the core FelloPilot user flow on testnet and enforce the product/harness boundary.

**Binary completion condition** — ALL must be true:
- [ ] Core FelloPilot flow runs end-to-end on testnet AND produces a verifiable artifact: either a real onchain testnet txHash (default chain `sepolia` per `capability_matrix.json#providers.direct_viem.default_demo_chain`) **OR** a labeled `SIMULATION` receipt with `txHash: undefined` and `explorerUrl: undefined`. NEVER both `simulated: true` AND a 0x… hash.
- [ ] The demo intent text (e.g. `SAFE_DEMO` constant + `scripts/demo_safe.sh` `SAFE_INTENT` default) refers to the same chain the signer is funded on. Mismatch (signer funded on Sepolia, intent says "Base Sepolia") MUST be a build-time failure or runtime BLOCKED with an explicit "chain mismatch" message.
- [ ] At least one real CoinFello CLI call succeeds against `app.coinfello.com` (sign_in is sufficient) AND is logged in `logs/commands.jsonl`. Note: per `capability_matrix.json`, CoinFello's swap route does NOT support Sepolia or Base Sepolia, so the swap execution itself MUST go through the testnet adapter declared in `capability_matrix.json` (default `direct_viem`).
- [ ] Product pages contain zero references to Judge or ggui (verified by `bash scripts/harness/forbidden_grep.sh` exit 0).
- [ ] `/harness` route is reachable only from internal harness entry points (not linked from product UI) — verified by `bash scripts/harness/spec_diff.sh`.

### M2 — Honest simulation + pending + risk gating

**Scope**: Make simulation honest, surface pending states, and gate every risky path.

**Binary completion condition** — ALL must be true:
- [ ] Every simulation render shows a visible `SIMULATION` label.
- [ ] No simulated receipt contains a fake `txHash` or fake explorer link.
- [ ] Pending / in-flight states are surfaced (not silently treated as success).
- [ ] Any attempt to trigger mainnet, request a seed phrase, or request a private key is blocked at the product layer (in addition to the harness `guard.ts` enforcement).

### M3 — Trace + memory

**Scope**: Persistent observability and cross-iteration memory.

**Binary completion condition** — ALL must be true:
- [ ] `logs/commands.jsonl` is appended for every tool execution (verify by inspecting at least one fresh entry per iteration).
- [ ] Loop maintains durable memory across iterations such that a restart can resume the in-progress milestone without re-deriving context from scratch.
- [ ] At least one trace-based verification step references `logs/commands.jsonl` directly.

---

## Loop Procedure

0. Run `bash scripts/harness/preflight.sh dev && bash scripts/harness/generate_testnet_signer.sh` (use `build` for compile steps). Abort the iteration on non-zero exit. The first command kills stale dev servers, validates port 3000, flips `.next` cache on mode change, and pings every endpoint declared in `scripts/harness/capability_matrix.json`. The second creates or reuses a testnet EOA persisted at `~/.fellopilot/signer.env` (default chain `sepolia`, chainId 11155111; per `capability_matrix.json#providers.direct_viem.default_demo_chain`). Equivalent one-liner: `bash scripts/harness/start_ralphathon.sh dev` (also runs `forbidden_grep.sh` + `honesty_lint.sh`).
1. Read `.omo/rules/*`, `STATE.md`, `RETROSPECTIVE.md`, and the tail of `logs/commands.jsonl`. **Also read `.omo/next-emotion.txt` if it exists** — its single `[loop N | phase/tone] text` line is feedback on the PREVIOUS iteration; treat it as evaluation input on what you just delivered and let it shape this iteration's work. Source: `.opencode/plugin/emotion-steering.ts` (pool `.omo/loop-emotions.json`, cursor `.omo/loop-state.json`).
2. Pick the lowest-numbered unfinished milestone in `STATE.md`.
3. Plan the smallest atomic step that moves that milestone toward its binary completion condition. The plan MUST respect the Plan Limits section below.
4. If the step removes or renames any string-literal value (enum member, union arm), first run `bash scripts/harness/blast_radius.sh "<value>"` and inject the output into the executing agent's prompt.
5. Execute the step. If the step would touch immutable rules (`.omo/rules/*` or `AGENTS.md`), abort the step and choose a different path — `.opencode/plugin/guard.ts` will enforce this regardless.
6. Run the relevant harness lints on changed surface: `bash scripts/harness/forbidden_grep.sh`, `bash scripts/harness/honesty_lint.sh`. Treat non-zero exit as the step failing.
7. Verify the step against the binary completion condition. Mark the checkbox only if ALL sub-conditions are true, then **write the updated `STATE.md` to disk** — this write is the iteration boundary that `.opencode/plugin/emotion-steering.ts` uses to advance the emotion pointer (next iteration's `.omo/next-emotion.txt` is populated by that write).
8. Iterate.

## Plan Limits

- A planning step may not produce more than **5 waves** of work.
- A single wave may not declare more than **3 parallel tasks**.
- The plan agent MUST stream one heartbeat line per wave designed; silent multi-minute planning is forbidden (`.omo/rules/observability.md`).
- Background tasks expected to run longer than 60 s MUST emit a heartbeat to `logs/heartbeats/<task_id>.json` every 30 s; the orchestrator reads heartbeats instead of polling `background_output` mid-flight.

## Stop Condition

Loop terminates when M1, M2, and M3 are all checked in `STATE.md`. Otherwise, continue indefinitely under the operating constraints above.
