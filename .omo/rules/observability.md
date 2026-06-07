# Observability (immutable)

Operational rules for keeping the unattended loop debuggable when work is delegated to subagents or background processes.

## Heartbeat (J1)

- Every long-running background task (>60 s expected) MUST write to its own `logs/heartbeats/<task_id>.json` every 30 s:
  `{ "task_id": "...", "phase": "<short>", "status": "<≤100 chars>", "ts": "<iso8601>" }`.
- The orchestrator reads `logs/heartbeats/*.json` instead of polling `background_output` mid-flight.
- A task with no heartbeat update for >120 s is considered stalled. Orchestrator must record the stall in `logs/commands.jsonl` and either cancel or reassign — never silently wait further.

## Fan-out limit (J2)

- A plan-agent output may not declare more than 5 waves.
- A single wave may not declare more than 3 parallel tasks.
- Plans exceeding either limit are rejected by the orchestrator; the plan agent must split or sequence further.
- The plan agent itself MUST stream progress (one heartbeat line per wave designed) — silent multi-minute planning is forbidden.

## Trace contract

- `logs/commands.jsonl` is the only durable cross-iteration record.
- No tool execution may bypass `.opencode/plugin/trace.ts`. If a script needs to emit a trace-equivalent record, it appends to the same file using the same `{tool, ts}` shape.
