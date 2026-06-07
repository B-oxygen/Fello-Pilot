#!/usr/bin/env bash
# Maps: today's lesson — `nohup npx next dev` died silently when the orchestrator's
# bash session terminated. tmux sessions survive shell churn.
#
# Usage:
#   bash scripts/harness/tmux_runner.sh start <session> <port> [env=VAR=val]...
#   bash scripts/harness/tmux_runner.sh stop  <session>
#   bash scripts/harness/tmux_runner.sh logs  <session>
#
# Example:
#   bash scripts/harness/tmux_runner.sh start ggui3001 3001 FELLOPILOT_ADAPTER=
#   bash scripts/harness/tmux_runner.sh start ggui3002 3002 FELLOPILOT_ADAPTER=direct_viem FELLOPILOT_TESTNET_SIGNER_KEY=0x...
set -uo pipefail

HARNESS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HARNESS_ROOT"

if ! command -v tmux >/dev/null; then
  echo "[tmux_runner] tmux not installed — abort." >&2
  exit 1
fi

action="${1:-}"

case "$action" in
  start)
    session="${2:?session name required}"
    port="${3:?port required}"
    shift 3
    env_assignments=("$@")

    if tmux has-session -t "$session" 2>/dev/null; then
      echo "[tmux_runner] session $session already exists — kill it first (or use 'stop')."
      exit 1
    fi

    bash scripts/harness/preflight.sh dev || {
      echo "[tmux_runner] preflight failed — fix before starting dev server."
      exit 1
    }

    tmux new-session -d -s "$session" -c "$HARNESS_ROOT"
    if [ "${#env_assignments[@]}" -gt 0 ]; then
      tmux send-keys -t "$session" "export ${env_assignments[*]}" Enter
    fi
    tmux send-keys -t "$session" "npx next dev -p $port 2>&1 | tee logs/dev-$session.log" Enter

    # Wait until the page responds.
    for i in 1 2 3 4 5 6 7 8 9 10; do
      sleep 2
      if curl -fsS "http://localhost:$port/" -o /dev/null 2>/dev/null; then
        echo "[tmux_runner] $session up on http://localhost:$port (attempt $i)"
        exit 0
      fi
    done
    echo "[tmux_runner] $session not responding after 20s — check 'logs/dev-$session.log' and 'tmux capture-pane -t $session -p'."
    exit 1
    ;;
  stop)
    session="${2:?session name required}"
    if tmux has-session -t "$session" 2>/dev/null; then
      tmux send-keys -t "$session" C-c
      sleep 1
      tmux kill-session -t "$session"
      echo "[tmux_runner] $session stopped"
    else
      echo "[tmux_runner] $session not running"
    fi
    ;;
  logs)
    session="${2:?session name required}"
    tmux capture-pane -t "$session" -p 2>&1 | tail -50
    ;;
  *)
    echo "usage: $0 {start|stop|logs} <session> [port] [env=VAR=val]..." >&2
    exit 2
    ;;
esac
