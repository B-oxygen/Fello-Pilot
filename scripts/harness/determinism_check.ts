#!/usr/bin/env -S npx --yes tsx
/**
 * Maps: C1 — buildDelegationIntent (or any hash builder) must be a pure function of its inputs.
 *
 * Usage:
 *   npx tsx scripts/harness/determinism_check.ts
 *
 * Convention (product side must satisfy):
 *   - Any module under src/ exporting a function named build* or hash*
 *     that returns { hash: `0x${string}` } MUST produce identical output
 *     when called twice with the same input, INCLUDING across a >=1s wall-clock gap.
 *   - The harness invokes the check against fixtures registered in determinism_check.fixtures.json
 *     (auto-discovered next to this script). If the file is absent, the check
 *     scans src/ for candidate functions and emits a warning instead of failing.
 *
 * Exit codes:
 *   0  every registered fixture is deterministic
 *   1  at least one fixture produced different output on second call
 *   2  no fixtures registered AND no candidate functions found (likely misconfigured)
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const HARNESS_ROOT = resolve(__dirname, "..", "..");
const FIXTURE_PATH = join(__dirname, "determinism_check.fixtures.json");

interface Fixture {
  module: string;           // path relative to harness root, e.g. "src/core/delegationIntent.ts"
  exportName: string;       // e.g. "buildDelegationIntent"
  inputBuilder: string;     // path to a .ts file that default-exports a () => any
  hashAccessor?: string;    // dot-path inside result, default "hash"
  delayMs?: number;         // wait between two calls, default 1500
}

function log(line: string) {
  process.stdout.write(`[determinism] ${line}\n`);
}

async function loadFixtures(): Promise<Fixture[]> {
  if (!existsSync(FIXTURE_PATH)) return [];
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as Fixture[];
}

async function dynImport(modulePath: string): Promise<Record<string, unknown>> {
  const abs = resolve(HARNESS_ROOT, modulePath);
  return (await import(abs)) as Record<string, unknown>;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

async function runFixture(fix: Fixture): Promise<boolean> {
  const mod = await dynImport(fix.module);
  const fn = mod[fix.exportName];
  if (typeof fn !== "function") {
    log(`SKIP ${fix.module}#${fix.exportName} — not exported as a function`);
    return false;
  }
  const builder = (await dynImport(fix.inputBuilder)).default;
  if (typeof builder !== "function") {
    log(`SKIP ${fix.inputBuilder} — no default-exported builder`);
    return false;
  }
  const input = (builder as () => unknown)();
  const path = fix.hashAccessor ?? "hash";
  const delay = fix.delayMs ?? 1500;

  const a = (fn as (i: unknown) => unknown)(input);
  await new Promise((r) => setTimeout(r, delay));
  const b = (fn as (i: unknown) => unknown)(input);

  const ha = getByPath(a, path);
  const hb = getByPath(b, path);
  if (ha === hb && typeof ha === "string") {
    log(`OK   ${fix.module}#${fix.exportName} (${ha})`);
    return true;
  }
  log(`FAIL ${fix.module}#${fix.exportName}: a=${String(ha)} b=${String(hb)}`);
  return false;
}

function scanCandidates(): string[] {
  const found: string[] = [];
  const srcRoot = join(HARNESS_ROOT, "src");
  if (!existsSync(srcRoot)) return found;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        const content = readFileSync(p, "utf8");
        const matches = content.match(/export\s+(?:async\s+)?function\s+(build\w+|hash\w+)/g);
        if (matches) found.push(`${p}: ${matches.join(", ")}`);
      }
    }
  };
  walk(srcRoot);
  return found;
}

async function main() {
  const fixtures = await loadFixtures();
  if (fixtures.length === 0) {
    const candidates = scanCandidates();
    if (candidates.length === 0) {
      log("no fixtures and no build*/hash* candidates — nothing to check");
      process.exit(2);
    }
    log(`no fixtures registered; candidates that should have a fixture:`);
    for (const c of candidates) log(`  ${c}`);
    log(`register them in ${FIXTURE_PATH} — exiting 2 (unconfigured)`);
    process.exit(2);
  }

  let allOk = true;
  for (const fix of fixtures) {
    const ok = await runFixture(fix);
    if (!ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

void main();
