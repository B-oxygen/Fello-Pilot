# Ralphthon Harness — FelloPilot

Unattended-loop build harness for the upcoming FelloPilot product. This directory is the harness layer only; product source (`src/`) is not yet present and will live here later.

## STRUCTURE

```
260607/
├── .omo/rules/                 # Immutable harness policy (read-only at runtime)
│   ├── ralphthon-mode.md       # Mainnet forbidden; testnet allowed; never block, keep going
│   ├── crypto-safety.md        # No fake txHash/explorer link; no seed/privkey prompts
│   └── boundary.md             # Product vs. /harness boundary; SIMULATION labeling rule
├── .opencode/
│   ├── plugin/
│   │   ├── guard.ts            # tool.execute.before — blocks mainnet/key/seed and protects rules
│   │   └── trace.ts            # tool.execute.after  — append-only log to logs/commands.jsonl
│   ├── package.json            # @opencode-ai/plugin@1.15.3
│   └── package-lock.json
├── logs/
│   ├── commands.jsonl          # One JSON line per tool execution {tool, ts}
│   └── traces/                 # Reserved for richer per-iteration traces
├── scripts/                    # Reserved for harness scripts
├── opencode.json               # Registers oh-my-openagent + guard.ts + trace.ts
├── STATE.md                    # M1/M2/M3 binary milestone checkboxes
├── PROMPT.md                   # /ulw-loop prompt skeleton (do NOT run manually)
└── AGENTS.md                   # This file (immutable once created — guard.ts enforces)
```

## WHERE TO LOOK

| Task | Location |
|---|---|
| Change what's forbidden at the harness level | `.omo/rules/*` (out of scope for the loop) |
| Add or relax a runtime guard rule | `.opencode/plugin/guard.ts` (out of scope for the loop) |
| Inspect what the loop did | `logs/commands.jsonl` (newest line = last tool call) |
| Track milestone progress | `STATE.md` |
| See what the loop is supposed to do | `PROMPT.md` |
| Find product code | `src/` (not yet created) |

## CONVENTIONS

- Two layers, never mixed: **harness** (this directory's metadata + `.opencode/`, `.omo/`) vs. **product** (`src/`, to be added).
- `.omo/rules/*` are immutable. The loop must read them every iteration and must not edit them.
- `AGENTS.md` is **lock-after-create**: writable only when absent, immutable once present. Enforced by `guard.ts`.
- Bash commands containing `mainnet`, `private key`, `seed phrase`, or `--use-unsafe-private-key` are blocked at the tool layer.
- Every simulated artifact must be labeled `SIMULATION`; no fabricated transaction hashes or explorer links.
- `/harness` (when introduced in the product) is internal-only; the product surface never exposes Judge or ggui.

## ANTI-PATTERNS (THIS PROJECT)

- Running anything against mainnet.
- Faking `txHash` or explorer URLs in a simulated receipt.
- Prompting for or echoing seed phrases / private keys.
- Editing `.omo/rules/*` or `AGENTS.md` from inside the loop.
- Treating a pending CoinFello call as success.
- Blocking the loop on a clarification question — pick a viable path and continue.

## COMMANDS

```bash
# Verify the plugin layer loads and enforces rules (one-shot integration check).
bun run -e 'import("./.opencode/plugin/guard.ts").then(m => m.HarnessGuard({})).then(h => console.log(!!h["tool.execute.before"]))'

# Tail the live tool-execution trace.
tail -f logs/commands.jsonl

# Start the unattended build loop (only on explicit operator instruction).
# /ulw-loop  ← invokes PROMPT.md as the loop body
```

## NOTES

- The loop is governed by `STATE.md` (progress) and `PROMPT.md` (procedure). `PROMPT.md` is a skeleton — fill it in before launching `/ulw-loop`.
- `logs/commands.jsonl` is append-only and the only durable cross-iteration evidence the loop emits by default.
- `.opencode/.gitignore` already excludes the locally installed `node_modules` and lockfile from version control.
- If `guard.ts` ever needs to evolve (e.g., new blocked substrings), update the file directly and re-run the integration check above before relying on the new rule.
