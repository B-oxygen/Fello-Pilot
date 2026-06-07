import { spawn } from "node:child_process";
import { appendCommandLog } from "@/lib/store";

const FORBIDDEN_FLAGS = ["--use-unsafe-private-key", "--mainnet"];

const DEFAULT_RPC_URL_OVERRIDE = "https://ethereum-rpc.publicnode.com";

function assertSafeArgs(args: string[]) {
  for (const flag of FORBIDDEN_FLAGS) {
    if (args.includes(flag)) {
      throw new Error(`Forbidden CoinFello CLI flag: ${flag}`);
    }
  }
}

export interface CoinfelloCliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runCli(
  subcommand: "get_account" | "sign_in",
  stage: string,
  timeoutMs: number,
  extraEnv: Record<string, string> = {},
): Promise<CoinfelloCliResult> {
  const args = ["@coinfello/agent-cli@latest", subcommand];
  assertSafeArgs(args);
  await appendCommandLog({
    tool: `npx @coinfello/agent-cli ${subcommand}`,
    stage,
  });

  return new Promise((resolve) => {
    const proc = spawn("npx", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1", ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr + "\n[timeout]", code: null });
    }, timeoutMs);
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, code });
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr, code: null });
    });
  });
}

export async function runGetAccount(timeoutMs = 6000): Promise<CoinfelloCliResult> {
  return runCli("get_account", "coinfello_get_account_invoked", timeoutMs);
}

// CoinFello sign_in is interactive (SIWE_CHAIN_ID=1, Secure Enclave touch).
// We invoke the CLI honestly: success when the operator's enclave is unlocked
// and a SIWE session exists; otherwise we record the failure trail without
// fabricating a session. RPC_URL_OVERRIDE defaults to publicnode (eth.merkle.io
// 429s per .omo/rules/env.md). PRD §10 explicitly excludes full SIWE UX —
// scope here is "≥1 real CLI call" for M1.3 evidence.
export async function runSignIn(timeoutMs = 8000): Promise<CoinfelloCliResult> {
  return runCli("sign_in", "coinfello_sign_in_invoked", timeoutMs, {
    RPC_URL_OVERRIDE:
      process.env.RPC_URL_OVERRIDE ?? DEFAULT_RPC_URL_OVERRIDE,
  });
}
