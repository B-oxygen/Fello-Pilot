import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PID_FILE = resolve(process.cwd(), "tests/e2e/.signserver.pid");
const PORT = Number(process.env.SIGN_SERVER_PORT ?? 3098);

export default async function globalSetup() {
  console.log("[global-setup] starting sign-server on port", PORT);
  mkdirSync(resolve(process.cwd(), "tests/e2e"), { recursive: true });

  const child = spawn(
    "node",
    ["tests/e2e/helpers/sign-server.mjs"],
    {
      env: { ...process.env, SIGN_SERVER_PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  child.unref();

  writeFileSync(PID_FILE, String(child.pid ?? ""), "utf8");

  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/address`);
      if (res.ok) {
        const { address } = (await res.json()) as { address: string };
        console.log(
          `[global-setup] sign-server ready, mock address: ${address}`,
        );
        return;
      }
    } catch {
      /* keep waiting */
    }
    await sleep(250);
  }
  throw new Error(
    `[global-setup] sign-server failed to start within 10s on port ${PORT}`,
  );
}
