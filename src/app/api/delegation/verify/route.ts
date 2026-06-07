import { NextResponse } from "next/server";
import {
  deserializeMessage,
  formatPersonalSignMessage,
  hashDelegationMessage,
  verifyDelegationSignature,
} from "@/lib/delegation";
import { appendCommandLog, writeJson, DataFile } from "@/lib/store";
import { keccak256, toBytes, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
import type { DelegationState, SignatureMethod } from "@/types/domain";

interface VerifyBody {
  proposalId: string;
  approver: string;
  chainId: number;
  signature: string;
  method: SignatureMethod;
  message: {
    approver: string;
    action: string;
    tokenAllowlist: string[];
    spendingCap: string;
    expiry: string;
    proposalId: string;
  };
  personalSignMessage?: string;
  delegationIntentHash?: string;
}

type SchemaResult =
  | { ok: true; data: VerifyBody }
  | { ok: false; error: string };

function isStringStarting0x(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("0x");
}

function validateVerifyBody(raw: unknown): SchemaResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.proposalId !== "string" || r.proposalId.length === 0) {
    return { ok: false, error: "proposalId must be a non-empty string" };
  }
  if (typeof r.approver !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.approver)) {
    return { ok: false, error: "approver must be a 0x-prefixed 40-char hex string" };
  }
  if (typeof r.chainId !== "number" || !Number.isInteger(r.chainId) || r.chainId <= 0) {
    return { ok: false, error: "chainId must be a positive integer" };
  }
  if (!isStringStarting0x(r.signature)) {
    return { ok: false, error: "signature must be a 0x-prefixed hex string" };
  }
  if (r.method !== "eth_signTypedData_v4" && r.method !== "personal_sign") {
    return {
      ok: false,
      error: "method must be 'eth_signTypedData_v4' or 'personal_sign'",
    };
  }

  if (r.message === null || typeof r.message !== "object" || Array.isArray(r.message)) {
    return { ok: false, error: "message must be a JSON object" };
  }
  const m = r.message as Record<string, unknown>;
  if (typeof m.approver !== "string") return { ok: false, error: "message.approver must be string" };
  if (typeof m.action !== "string") return { ok: false, error: "message.action must be string" };
  if (!Array.isArray(m.tokenAllowlist) || !m.tokenAllowlist.every((t) => typeof t === "string")) {
    return { ok: false, error: "message.tokenAllowlist must be array of strings" };
  }
  if (typeof m.spendingCap !== "string") return { ok: false, error: "message.spendingCap must be string (BigInt-as-string)" };
  if (typeof m.expiry !== "string") return { ok: false, error: "message.expiry must be string (BigInt-as-string)" };
  if (!isStringStarting0x(m.proposalId)) {
    return { ok: false, error: "message.proposalId must be 0x-prefixed hex string (keccak hash)" };
  }

  if (r.personalSignMessage !== undefined && typeof r.personalSignMessage !== "string") {
    return { ok: false, error: "personalSignMessage, when present, must be string" };
  }
  if (r.delegationIntentHash !== undefined && !isStringStarting0x(r.delegationIntentHash)) {
    return { ok: false, error: "delegationIntentHash, when present, must be 0x-prefixed hex string" };
  }

  return { ok: true, data: r as unknown as VerifyBody };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch (err) {
    await appendCommandLog({
      tool: "api/delegation/verify",
      stage: "verify_body_unparseable",
      reason: (err as Error).message,
    });
    return NextResponse.json(
      { error: "malformed JSON body", detail: (err as Error).message },
      { status: 400 },
    );
  }

  const validation = validateVerifyBody(raw);
  if (!validation.ok) {
    await appendCommandLog({
      tool: "api/delegation/verify",
      stage: "verify_schema_rejected",
      reason: validation.error,
    });
    return NextResponse.json(
      { error: `schema validation failed: ${validation.error}` },
      { status: 400 },
    );
  }
  const body = validation.data;

  // H5 invariant (PRD §2): the wrapper body.proposalId MUST correspond to the
  // signed message.proposalId (which is keccak256(toBytes(proposalIdString))).
  const expectedHashedProposalId = keccak256(toBytes(body.proposalId));
  const proposalIdBindingValid =
    typeof body.message?.proposalId === "string" &&
    body.message.proposalId.toLowerCase() ===
      expectedHashedProposalId.toLowerCase();

  // H5 invariant: the wrapper body.approver MUST equal body.message.approver.
  // The signed typed-data binds approver inside the message; downstream code
  // (DelegationState.approver, directViem calldata) uses body.approver. If
  // they diverge we'd anchor a different EOA than the one who signed the
  // intent bytes — inconsistent attestation.
  const approverBindingValid =
    typeof body.approver === "string" &&
    typeof body.message?.approver === "string" &&
    body.approver.toLowerCase() === body.message.approver.toLowerCase();

  // H5 invariant: the delegationIntentHash that will be persisted in
  // DelegationState (and later anchored onchain by direct_viem) MUST be the
  // server-computed hash of (body.message, body.chainId). Otherwise a client
  // can sign valid typed data for the right proposal but submit a stale or
  // adversarial intent hash that direct_viem then anchors as if it were the
  // signed intent.
  let expectedIntentHash: Hex | undefined;
  let intentHashBindingValid = true;
  if (proposalIdBindingValid && approverBindingValid) {
    try {
      const reconstructedForHash = deserializeMessage(body.message);
      expectedIntentHash = hashDelegationMessage({
        message: reconstructedForHash,
        chainId: body.chainId,
      });
      if (body.delegationIntentHash) {
        intentHashBindingValid =
          body.delegationIntentHash.toLowerCase() ===
          expectedIntentHash.toLowerCase();
      }
    } catch {
      intentHashBindingValid = false;
    }
  }

  let valid = false;
  let personalSignBindingValid: boolean | undefined;
  if (
    proposalIdBindingValid &&
    approverBindingValid &&
    intentHashBindingValid
  ) {
    try {
      if (body.method === "eth_signTypedData_v4") {
        valid = await verifyDelegationSignature({
          message: deserializeMessage(body.message),
          chainId: body.chainId,
          signature: body.signature as Hex,
          expectedAddress: body.approver as Address,
        });
      } else if (body.method === "personal_sign" && body.personalSignMessage) {
        // H5 invariant for the personal_sign fallback: the bytes the wallet
        // actually signed (body.personalSignMessage) MUST be the canonical
        // string derived from body.message + body.chainId. Otherwise a client
        // could sign proposal A's personalSignMessage and submit it under
        // body.message=B — bypassing the typed-data bind.
        const reconstructedMessage = deserializeMessage(body.message);
        const expectedPersonalSign = formatPersonalSignMessage({
          message: reconstructedMessage,
          chainId: body.chainId,
          intentHash: expectedIntentHash!,
        });
        personalSignBindingValid =
          body.personalSignMessage === expectedPersonalSign;
        if (personalSignBindingValid) {
          valid = await verifyMessage({
            address: body.approver as Address,
            message: body.personalSignMessage,
            signature: body.signature as Hex,
          });
        }
      }
    } catch (err) {
      valid = false;
    }
  }

  // Persist the SERVER-computed intent hash, never the client-supplied one.
  // If the server couldn't compute it (proposalId or approver bind failed
  // upstream) leave it undefined so direct_viem refuses to anchor.
  const intentHash: Hex | undefined = valid ? expectedIntentHash : undefined;

  const attestationPayload =
    valid && body.method === "eth_signTypedData_v4"
      ? {
          signature: body.signature,
          intent: {
            approver: body.message.approver,
            action: body.message.action,
            tokenAllowlist: body.message.tokenAllowlist,
            spendingCap: body.message.spendingCap,
            expiry: body.message.expiry,
            proposalId: body.message.proposalId,
          },
        }
      : undefined;

  const state: DelegationState = {
    proposalId: body.proposalId,
    status: valid ? "approved" : "rejected",
    adapter: "mock",
    scope: {
      action: body.message.action,
      spendingCap: Number(body.message.spendingCap),
      tokenAllowlist: body.message.tokenAllowlist,
      expiryMinutes: 60,
    },
    approvedAt: valid ? new Date().toISOString() : undefined,
    message: valid
      ? "Delegation signature verified."
      : !proposalIdBindingValid
        ? `Refused: body.proposalId (${body.proposalId}) does not bind the signed message.proposalId hash.`
        : !approverBindingValid
          ? `Refused: body.approver (${body.approver}) does not equal body.message.approver (${body.message?.approver}).`
          : !intentHashBindingValid
            ? `Refused: body.delegationIntentHash (${body.delegationIntentHash}) does not equal the server-computed hash (${expectedIntentHash}) of body.message + chainId.`
            : personalSignBindingValid === false
              ? "Refused: body.personalSignMessage does not match the canonical string derived from body.message + chainId."
              : "Delegation signature mismatch.",
    updatedAt: new Date().toISOString(),
    connectedWallet: {
      eoaAddress: body.approver,
      chainId: body.chainId,
      connectedAt: new Date().toISOString(),
      providerLabel: "injected",
    },
    approver: body.approver,
    chainId: body.chainId,
    delegationIntentHash: intentHash,
    signatureMethod: body.method,
    signedAt: new Date().toISOString(),
    signatureValid: valid,
    attestation: attestationPayload,
  };

  await writeJson(DataFile.DelegationState, state);
  await appendCommandLog({
    tool: "api/delegation/verify",
    stage: "delegation_signed",
    proposalId: body.proposalId,
    signatureMethod: body.method,
    valid,
    proposalIdBindingValid,
    approverBindingValid,
    intentHashBindingValid,
    personalSignBindingValid: personalSignBindingValid ?? null,
    intentHashServerComputed: Boolean(expectedIntentHash),
    intentHashPersisted: Boolean(intentHash),
  });

  return NextResponse.json({
    valid,
    state,
    proposalIdBindingValid,
    approverBindingValid,
    intentHashBindingValid,
    personalSignBindingValid: personalSignBindingValid ?? null,
  });
}
