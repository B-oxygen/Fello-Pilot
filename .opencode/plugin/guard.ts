import type { Plugin } from "@opencode-ai/plugin";
import { existsSync } from "node:fs";

const BLOCKED = [
  "mainnet",
  "private key",
  "seed phrase",
  "--use-unsafe-private-key",
];

const ALWAYS_PROTECTED = [".omo/rules/"];

const LOCK_AFTER_CREATE = [
  "AGENTS.md",
  "RETROSPECTIVE.md",
];

export const HarnessGuard: Plugin = async () => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool === "bash") {
      const cmd = String(output.args.command ?? "");
      const hit = BLOCKED.find((s) => cmd.includes(s));
      if (hit) throw new Error(`BLOCKED by RULE: "${hit}"`);
    }
    if (["edit", "write"].includes(input.tool)) {
      const p = String(output.args.filePath ?? "");
      if (ALWAYS_PROTECTED.some((f) => p.includes(f))) {
        throw new Error("BLOCKED: cannot modify immutable RULE");
      }
      const lockHit = LOCK_AFTER_CREATE.find((f) => p.endsWith(f) || p.endsWith(`/${f}`));
      if (lockHit && existsSync(p)) {
        throw new Error(`BLOCKED: ${lockHit} is immutable once created`);
      }
    }
  },
});
