import type { ChainName, IntentAction, TradeIntent } from "@/types/domain";

const SECRET_PATTERNS: RegExp[] = [
  /private\s*key/i,
  /seed\s*phrase/i,
  /mnemonic/i,
  /--use-unsafe-private-key/i,
  /개인키|시드/i,
];

const TWELVE_WORD_PATTERN = /^\s*(?:[a-z]+\s+){11,}[a-z]+\s*$/i;
const HEX_PRIVATE_KEY_PATTERN = /\b0x[0-9a-f]{64}\b/i;

export type IntentRejectionCode =
  | "E001_INTENT_CONTAINS_SECRET"
  | "E002_INTENT_EMPTY";

export type IntentResult =
  | { kind: "rejected"; code: IntentRejectionCode; reason: string }
  | { kind: "parsed"; intent: TradeIntent };

function detectChain(text: string): ChainName {
  const lower = text.toLowerCase();
  if (/\bbase\s*mainnet\b/.test(lower)) return "base";
  if (/\bmainnet\b/.test(lower) && !/\bsepolia\b/.test(lower)) return "ethereum";
  if (/\bbase\b/.test(lower) && !/\bsepolia\b/.test(lower)) return "base";
  if (/\bsepolia\b/.test(lower)) return "sepolia";
  return "unknown";
}

function detectAction(text: string): IntentAction {
  const lower = text.toLowerCase();
  if (/(swap|스왑|교환)/.test(lower)) return "swap";
  if (/(dca|매주|매일|반복|recurring)/.test(lower)) return "dca";
  if (/(alert|트리거|trigger|when|이하|이상)/.test(lower)) return "alert_triggered";
  return "unknown";
}

function detectTokens(text: string): { tokenIn?: string; tokenOut?: string } {
  const symbols = ["USDC", "USDT", "DAI", "ETH", "WETH"];
  const tokens: string[] = [];
  for (const s of symbols) {
    const re = new RegExp(`\\b${s}\\b`, "i");
    if (re.test(text)) tokens.push(s.toUpperCase());
  }
  return { tokenIn: tokens[0], tokenOut: tokens[1] };
}

function detectAmount(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(USDC|USDT|DAI|ETH|WETH)/i);
  if (!m) return undefined;
  const value = parseFloat(m[1]);
  return Number.isFinite(value) ? value : undefined;
}

function detectApprovalRequired(text: string): boolean {
  const lower = text.toLowerCase();
  if (/(승인\s*없이|without\s*approval|즉시|skip\s*approval|자동으로\s*실행)/.test(lower)) {
    return false;
  }
  return true;
}

function detectForbidsMainnet(text: string): boolean {
  const lower = text.toLowerCase();
  if (/(mainnet\s*금지|no\s*mainnet|testnet\s*only)/.test(lower)) return true;
  if (/(mainnet|메인넷)/.test(lower)) return false;
  return true;
}

export function parseIntent(rawText: string): IntentResult {
  const cleaned = rawText.trim();
  if (cleaned.length === 0) {
    return {
      kind: "rejected",
      code: "E002_INTENT_EMPTY",
      reason: "Intent is empty. Please type a crypto intent.",
    };
  }

  const containsSecret =
    SECRET_PATTERNS.some((re) => re.test(cleaned)) ||
    TWELVE_WORD_PATTERN.test(cleaned) ||
    HEX_PRIVATE_KEY_PATTERN.test(cleaned);

  if (containsSecret) {
    return {
      kind: "rejected",
      code: "E001_INTENT_CONTAINS_SECRET",
      reason:
        "Intent appears to contain a seed phrase or private key. FelloPilot never accepts secrets.",
    };
  }

  const chain = detectChain(cleaned);
  const action = detectAction(cleaned);
  const { tokenIn, tokenOut } = detectTokens(cleaned);
  const amount = detectAmount(cleaned);
  const approvalRequired = detectApprovalRequired(cleaned);
  const forbidsMainnet = detectForbidsMainnet(cleaned);

  const intent: TradeIntent = {
    rawText: cleaned,
    mode: "demo",
    chain,
    action,
    tokenIn,
    tokenOut,
    amount,
    approvalRequired,
    forbidsMainnet,
    estimatedSlippageBps: 30,
  };

  return { kind: "parsed", intent };
}
