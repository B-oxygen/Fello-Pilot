import OpenAI from "openai";
import type {
  ChainName,
  ExecutionPolicy,
  IntentAction,
  TradeIntent,
} from "@/types/domain";

const DEFAULT_MODEL =
  process.env.OPENAI_PROPOSAL_MODEL ?? "gpt-4.1-mini";

const DEFAULT_TIMEOUT_MS = 10_000;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["swap", "dca", "alert_triggered", "unknown"],
    },
    chain: {
      type: "string",
      enum: ["sepolia", "ethereum", "base", "unknown"],
    },
    amount: { anyOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "null" }] },
    tokenIn: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
    tokenOut: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
    recipient: {
      anyOf: [
        { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
        { type: "null" },
      ],
    },
    estimatedSlippageBps: {
      anyOf: [{ type: "number", minimum: 1, maximum: 1000 }, { type: "null" }],
    },
    approvalRequired: { type: "boolean" },
    forbidsMainnet: { type: "boolean" },
    rationale: { type: "string", minLength: 1, maxLength: 280 },
    executionPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["oneshot", "dca", "alert_triggered"] },
        ticks: { anyOf: [{ type: "integer", minimum: 1, maximum: 12 }, { type: "null" }] },
        cadenceSeconds: { anyOf: [{ type: "integer", minimum: 1, maximum: 86400 }, { type: "null" }] },
        condition: { anyOf: [{ type: "string", minLength: 1, maxLength: 200 }, { type: "null" }] },
        pollIntervalSeconds: { anyOf: [{ type: "integer", minimum: 5, maximum: 3600 }, { type: "null" }] },
      },
      required: ["type", "ticks", "cadenceSeconds", "condition", "pollIntervalSeconds"],
    },
  },
  required: [
    "action",
    "chain",
    "amount",
    "tokenIn",
    "tokenOut",
    "recipient",
    "estimatedSlippageBps",
    "approvalRequired",
    "forbidsMainnet",
    "rationale",
    "executionPolicy",
  ],
} as const;

const INSTRUCTIONS = [
  "You convert a Korean or English crypto intent text into a Sepolia-only trade intent.",
  "Output schema-valid JSON only — no prose.",
  "Hard rules (NEVER violate):",
  "- chain MUST be 'sepolia' unless the user explicitly demands mainnet (then 'ethereum' or 'base', and forbidsMainnet=false).",
  "- If the text demands 'mainnet 금지' / 'no mainnet' / 'testnet only', forbidsMainnet=true.",
  "- If the text says 'approval 없이' / 'without approval' / '즉시', approvalRequired=false. Otherwise true.",
  "- action MUST be one of swap | dca | alert_triggered | unknown.",
  "- For DCA: executionPolicy.type='dca', set ticks (2-4 typical) and cadenceSeconds (>=5).",
  "- For alert-triggered: executionPolicy.type='alert_triggered', set condition (free text) and pollIntervalSeconds (>=30).",
  "- For plain swap: executionPolicy.type='oneshot' and all DCA/alert sub-fields null.",
  "- amount is the numeric quantity of tokenIn (e.g. '1 USDC' → amount=1, tokenIn='USDC').",
  "- estimatedSlippageBps defaults to 30 if unspecified.",
  "- recipient null unless the user specifies an address.",
  "- rationale: <=280 chars, one sentence, explains your parsing choices.",
].join("\n");

interface RawLlmOutput {
  action: IntentAction;
  chain: ChainName;
  amount: number | null;
  tokenIn: string | null;
  tokenOut: string | null;
  recipient: string | null;
  estimatedSlippageBps: number | null;
  approvalRequired: boolean;
  forbidsMainnet: boolean;
  rationale: string;
  executionPolicy: {
    type: "oneshot" | "dca" | "alert_triggered";
    ticks: number | null;
    cadenceSeconds: number | null;
    condition: string | null;
    pollIntervalSeconds: number | null;
  };
}

export interface LlmProposalSuccess {
  ok: true;
  intent: TradeIntent;
  executionPolicy: ExecutionPolicy;
  rationale: string;
  model: string;
}

export interface LlmProposalFailure {
  ok: false;
  code: "E003_LLM_UNAVAILABLE" | "E003_LLM_TIMEOUT" | "E003_LLM_INVALID";
  reason: string;
}

export type LlmProposalResult = LlmProposalSuccess | LlmProposalFailure;

export function isLlmConfigured(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" &&
    process.env.OPENAI_API_KEY.length > 0;
}

function clientOrNull(): OpenAI | null {
  if (!isLlmConfigured()) return null;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  });
}

function policyFromRaw(raw: RawLlmOutput["executionPolicy"]): ExecutionPolicy {
  if (raw.type === "dca") {
    return {
      type: "dca",
      ticks: raw.ticks ?? 2,
      cadenceSeconds: raw.cadenceSeconds ?? 5,
    };
  }
  if (raw.type === "alert_triggered") {
    return {
      type: "alert_triggered",
      condition: raw.condition ?? "manual_trigger",
      pollIntervalSeconds: raw.pollIntervalSeconds ?? 30,
    };
  }
  return { type: "oneshot" };
}

export async function proposeWithLlm(
  rawText: string,
): Promise<LlmProposalResult> {
  const client = clientOrNull();
  if (!client) {
    return {
      ok: false,
      code: "E003_LLM_UNAVAILABLE",
      reason: "OPENAI_API_KEY not configured. Falling back to deterministic parser.",
    };
  }

  try {
    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      instructions: INSTRUCTIONS,
      input: rawText,
      text: {
        format: {
          type: "json_schema",
          name: "trade_intent",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    });

    let raw: RawLlmOutput;
    try {
      raw = JSON.parse(response.output_text) as RawLlmOutput;
    } catch {
      return {
        ok: false,
        code: "E003_LLM_INVALID",
        reason: "LLM returned non-JSON output.",
      };
    }

    const intent: TradeIntent = {
      rawText,
      mode: "demo",
      chain: raw.chain,
      action: raw.action,
      tokenIn: raw.tokenIn ?? undefined,
      tokenOut: raw.tokenOut ?? undefined,
      amount: raw.amount ?? undefined,
      recipient: raw.recipient ?? undefined,
      estimatedSlippageBps: raw.estimatedSlippageBps ?? 30,
      approvalRequired: raw.approvalRequired,
      forbidsMainnet: raw.forbidsMainnet,
    };

    return {
      ok: true,
      intent,
      executionPolicy: policyFromRaw(raw.executionPolicy),
      rationale: raw.rationale,
      model: DEFAULT_MODEL,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|timed out|aborted/i.test(msg);
    return {
      ok: false,
      code: isTimeout ? "E003_LLM_TIMEOUT" : "E003_LLM_UNAVAILABLE",
      reason: msg,
    };
  }
}
