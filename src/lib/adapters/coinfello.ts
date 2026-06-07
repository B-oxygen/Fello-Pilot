import { spawn } from "node:child_process";
import { appendCommandLog } from "@/lib/store";

const FORBIDDEN_FLAGS = ["--use-unsafe-private-key", "--mainnet"];

function assertSafeArgs(args: string[]) {
  for (const flag of FORBIDDEN_FLAGS) {
    if (args.includes(flag)) {
      throw new Error(`Forbidden CoinFello CLI flag: ${flag}`);
    }
  }
}

export async function runGetAccount(timeoutMs = 6000): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}> {
  const args = ["@coinfello/agent-cli@latest", "get_account"];
  assertSafeArgs(args);
  await appendCommandLog({
    tool: "npx @coinfello/agent-cli get_account",
    stage: "coinfello_get_account_invoked",
  });

  return new Promise((resolve) => {
    const proc = spawn("npx", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1" },
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
