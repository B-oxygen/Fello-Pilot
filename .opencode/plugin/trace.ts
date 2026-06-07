import type { Plugin } from "@opencode-ai/plugin";
import { appendFileSync } from "node:fs";
export const HarnessTrace: Plugin = async () => ({
  "tool.execute.after": async (input) => {
    appendFileSync(
      "logs/commands.jsonl",
      JSON.stringify({ tool: input.tool, ts: new Date().toISOString() }) + "\n",
    );
  },
});
