import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const URL = "http://localhost:3000";
const OUT = resolve(process.cwd(), "docs/screenshots");
mkdirSync(OUT, { recursive: true });

function pathOf(name) {
  return resolve(OUT, name);
}

try {
  rmSync(resolve(process.cwd(), "data/memory.jsonl"));
  console.log("[reset] cleared data/memory.jsonl");
} catch {
  console.log("[reset] no existing memory.jsonl");
}

async function post(path, body) {
  const res = await fetch(`${URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

async function preSeedMemory() {
  console.log("[pre-seed] running safe e2e via API to populate memory");
  const account = privateKeyToAccount(generatePrivateKey());
  const SAFE = "Sepolia testnet에서 1 USDC를 ETH로 스왑하는 데모 자동화 플로우. mainnet 금지. 사람 승인 필수.";
  const prop = await post("/api/proposal", { intent: SAFE });
  const proposal = prop.proposal;
  await post("/api/risk", { proposal });
  const built = await post("/api/delegation/build", {
    proposal,
    approver: account.address,
    chainId: 11155111,
  });
  const sig = await account.signTypedData({
    domain: built.domain,
    types: built.types,
    primaryType: built.primaryType,
    message: {
      approver: built.message.approver,
      action: built.message.action,
      tokenAllowlist: built.message.tokenAllowlist,
      spendingCap: BigInt(built.message.spendingCap),
      expiry: BigInt(built.message.expiry),
      proposalId: built.message.proposalId,
    },
  });
  await post("/api/delegation/verify", {
    proposalId: proposal.id,
    approver: account.address,
    chainId: 11155111,
    signature: sig,
    method: "eth_signTypedData_v4",
    message: built.message,
    personalSignMessage: built.personalSignMessage,
  });
  await post("/api/execute", null);
  console.log("[pre-seed] memory populated with simulated_attestation");
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

console.log("[1/6] empty state (memory cleared)");
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="chat-shell"]');
await page.waitForTimeout(800);
await page.screenshot({ path: pathOf("01-empty-state.png"), fullPage: false });

console.log("[2/6] UNSAFE flow → blocked (top of chat)");
await page.click('[data-testid="seed-prompt-unsafe"]');
await page.waitForSelector('[data-testid="chat-card-risk-blocked"]', { timeout: 8000 });
await page.waitForSelector('[data-testid="chat-card-receipt"][data-receipt-variant="blocked"]', {
  timeout: 8000,
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const history = document.querySelector('[data-testid="chat-history"]');
  if (history) history.scrollTo({ top: 0 });
});
await page.waitForTimeout(400);
await page.screenshot({ path: pathOf("02-blocked-flow-top.png"), fullPage: false });

console.log("[3/6] UNSAFE flow → blocked receipt (bottom)");
await page.evaluate(() => {
  const history = document.querySelector('[data-testid="chat-history"]');
  if (history) history.scrollTo({ top: history.scrollHeight });
});
await page.waitForTimeout(400);
await page.screenshot({ path: pathOf("03-blocked-flow-receipt.png"), fullPage: false });

console.log("[4/6] SAFE flow → proposal + risk pass (top)");
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed-prompt-safe"]');
await page.click('[data-testid="seed-prompt-safe"]');
await page.waitForSelector('[data-testid="chat-card-proposal"]', { timeout: 8000 });
await page.waitForSelector('[data-testid="chat-card-risk-report"]', { timeout: 8000 });
await page
  .waitForSelector('[data-testid="chat-message-wallet-connect-prompt"]', { timeout: 8000 })
  .catch(() => null);
await page.waitForTimeout(900);
await page.evaluate(() => {
  const history = document.querySelector('[data-testid="chat-history"]');
  if (history) history.scrollTo({ top: 0 });
});
await page.waitForTimeout(400);
await page.screenshot({ path: pathOf("04-safe-flow-top.png"), fullPage: false });

console.log("[5/6] SAFE flow → wallet-connect prompt (bottom)");
await page.evaluate(() => {
  const history = document.querySelector('[data-testid="chat-history"]');
  if (history) history.scrollTo({ top: history.scrollHeight });
});
await page.waitForTimeout(400);
await page.screenshot({ path: pathOf("05-safe-flow-bottom.png"), fullPage: false });

console.log("[6/6] memory panel populated (right column)");
await preSeedMemory();
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="memory-count"]', { timeout: 6000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('[data-testid="memory-count"]');
    return el && Number(el.textContent || "0") >= 1;
  },
  { timeout: 6000 },
);
await page.waitForTimeout(500);
await page.screenshot({
  path: pathOf("06-memory-panel.png"),
  clip: { x: 960, y: 0, width: 320, height: 900 },
});

await browser.close();
console.log("done:", OUT);
