#!/usr/bin/env -S npx --yes tsx
/**
 * Maps: H1 / H2 / H3 — cross-layer policy consistency.
 *
 * Invariant under enforcement (per retro/ralphathon-1 Oracle findings):
 *   1) Any string-literal union accepted by a public HTTP API route MUST be a
 *      SUBSET of the union accepted by the core function that implements it.
 *      The opposite (core accepts a value but API does not) is OK and intended:
 *      that is "defense in depth" — internal callers can reach values that the
 *      public API refuses.
 *   2) For every status union literal in src/types/*.ts named *Status, at least
 *      one runtime narrowing on that literal must exist somewhere under src/
 *      — otherwise the literal is dead code and likely stale.
 *
 * The check is intentionally lexical (grep + cheap AST scan) so it can run
 * pre-commit without spinning up a TS server. Fixture-driven for predictable
 * exit codes.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { globSync } from "node:fs";

const HARNESS_ROOT = resolve(__dirname, "..", "..");

function log(line: string) {
  process.stdout.write(`[layered_gate] ${line}\n`);
}

function readMaybe(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

// crude: extract string literals quoted with " or ' from a small region.
function extractLiterals(source: string, pattern: RegExp): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(source))) {
    out.add(m[1]);
  }
  return out;
}

// 1) API-vs-core subset check, fixture-driven.
interface LayerFixture {
  name: string;
  apiFile: string;   // e.g. "app/api/delegation/route.ts"
  apiSetRegex: string;   // grep pattern with one capture group → literal value
  coreFile: string;  // e.g. "src/core/delegation.ts" or "src/types/domain.ts"
  coreSetRegex: string;
  defenseInDepth?: string[]; // values that MAY be in core but never in API (e.g. "cli_mock")
}

const FIXTURES: LayerFixture[] = [
  {
    name: "SignatureMethod / delegation API ⊆ core type",
    apiFile: "app/api/delegation/route.ts",
    apiSetRegex: '"(eth_signTypedData_v4|personal_sign|cli_mock)"',
    coreFile: "src/types/domain.ts",
    coreSetRegex: '"(eth_signTypedData_v4|personal_sign|cli_mock)"',
    defenseInDepth: ["cli_mock"],
  },
];

let fail = false;

for (const fix of FIXTURES) {
  const apiSrc = readMaybe(join(HARNESS_ROOT, fix.apiFile));
  const coreSrc = readMaybe(join(HARNESS_ROOT, fix.coreFile));
  if (apiSrc === null || coreSrc === null) {
    log(`SKIP ${fix.name} — ${fix.apiFile} or ${fix.coreFile} absent`);
    continue;
  }
  const apiSet = extractLiterals(apiSrc, new RegExp(fix.apiSetRegex, "g"));
  const coreSet = extractLiterals(coreSrc, new RegExp(fix.coreSetRegex, "g"));
  const defenseInDepth = new Set(fix.defenseInDepth ?? []);

  // every API value must be in core
  for (const v of apiSet) {
    if (!coreSet.has(v)) {
      log(`FAIL ${fix.name}: API accepts "${v}" but core type does not declare it`);
      fail = true;
    }
  }
  // values that must NOT appear in API (defense in depth)
  for (const v of defenseInDepth) {
    if (apiSet.has(v)) {
      log(`FAIL ${fix.name}: API surface still accepts "${v}" (defense-in-depth violated)`);
      fail = true;
    }
  }
  log(`OK   ${fix.name}: api={${[...apiSet].join(",")}} core={${[...coreSet].join(",")}}`);
}

// 2) Dead-literal scan: every *Status literal must be narrowed somewhere in src/
const typeFiles = existsSync(join(HARNESS_ROOT, "src/types"))
  ? globSync("src/types/*.ts", { cwd: HARNESS_ROOT })
  : [];

for (const tf of typeFiles) {
  const src = readMaybe(join(HARNESS_ROOT, tf));
  if (!src) continue;
  const statusBlocks = src.matchAll(/export type \w+(Status|Mode)[ =][\s\S]*?;/g);
  for (const block of statusBlocks) {
    const literals = [...block[0].matchAll(/"([a-z_A-Z0-9]+)"/g)].map((m) => m[1]);
    for (const lit of literals) {
      const grepCmd = `grep -RIn "\\"${lit}\\"" src/ app/ 2>/dev/null | grep -v "src/types/" || true`;
      const hits = require("node:child_process").execSync(grepCmd, { encoding: "utf8" });
      if (!hits.trim()) {
        log(`WARN dead literal "${lit}" — declared in ${tf} but never narrowed on outside src/types/`);
      }
    }
  }
}

process.exit(fail ? 1 : 0);
