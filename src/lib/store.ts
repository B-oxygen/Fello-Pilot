import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const LOGS_DIR = path.join(ROOT, "logs");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson<T>(filename: string, fallback: T): Promise<T> {
  await ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(filename: string, value: unknown) {
  await ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function appendJsonl(filename: string, record: Record<string, unknown>) {
  const filePath = filename.startsWith("/") ? filename : path.join(LOGS_DIR, filename);
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

export async function appendCommandLog(record: Record<string, unknown>) {
  await ensureDir(LOGS_DIR);
  const filePath = path.join(LOGS_DIR, "commands.jsonl");
  const enriched = { ts: new Date().toISOString(), ...record };
  await fs.appendFile(filePath, `${JSON.stringify(enriched)}\n`, "utf8");
}

export async function readMemoryJsonl<T = Record<string, unknown>>(): Promise<T[]> {
  const filePath = path.join(DATA_DIR, "memory.jsonl");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as T);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function appendMemoryJsonl(entry: object) {
  await ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, "memory.jsonl");
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export const DataFile = {
  Proposal: "proposal.json",
  RiskReport: "risk_report.json",
  ExecutionReceipt: "execution_receipt.json",
  DelegationState: "delegation_state.json",
} as const;
