import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PID_FILE = resolve(process.cwd(), "tests/e2e/.signserver.pid");

export default async function globalTeardown() {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid, "SIGKILL");
      console.log(`[global-teardown] killed sign-server pid=${pid}`);
    } catch (err) {
      console.warn(`[global-teardown] could not kill pid=${pid}:`, err);
    }
  }
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}
