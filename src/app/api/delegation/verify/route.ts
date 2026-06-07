import { NextResponse } from "next/server";
import { deserializeMessage, verifyDelegationSignature } from "@/lib/delegation";
import { appendCommandLog, writeJson, DataFile } from "@/lib/store";
import { keccak256, toBytes, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
import type { DelegationState, SignatureMethod } from "@/types/domain";

export async function POST(request: Request) {
  const body = (await request.json()) as {
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
  };

  // H5 invariant (PRD §2): the wrapper body.proposalId MUST correspond to the
  // signed message.proposalId (which is keccak256(toBytes(proposalIdString))).
  // Without this a client can sign typed data for proposal A while submitting
  // body.proposalId=B, and the server would write an "approved" DelegationState
  // for B. Refuse if they don't match before any signature verification work.
  const expectedHashedProposalId = keccak256(toBytes(body.proposalId));
  const proposalIdBindingValid =
    typeof body.message?.proposalId === "string" &&
    body.message.proposalId.toLowerCase() ===
      expectedHashedProposalId.toLowerCase();

  let valid = false;
  if (proposalIdBindingValid) {
    try {
      if (body.method === "eth_signTypedData_v4") {
        valid = await verifyDelegationSignature({
          message: deserializeMessage(body.message),
          chainId: body.chainId,
          signature: body.signature as Hex,
          expectedAddress: body.approver as Address,
        });
      } else if (body.method === "personal_sign" && body.personalSignMessage) {
        valid = await verifyMessage({
          address: body.approver as Address,
          message: body.personalSignMessage,
          signature: body.signature as Hex,
        });
      }
    } catch (err) {
      valid = false;
    }
  }

  const intentHash =
    body.delegationIntentHash && body.delegationIntentHash.startsWith("0x")
      ? (body.delegationIntentHash as Hex)
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
      : proposalIdBindingValid
        ? "Delegation signature mismatch."
        : `Refused: body.proposalId (${body.proposalId}) does not bind the signed message.proposalId hash.`,
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
  };

  await writeJson(DataFile.DelegationState, state);
  await appendCommandLog({
    tool: "api/delegation/verify",
    stage: "delegation_signed",
    proposalId: body.proposalId,
    signatureMethod: body.method,
    valid,
    proposalIdBindingValid,
    intentHashPresent: Boolean(intentHash),
  });

  return NextResponse.json({ valid, state, proposalIdBindingValid });
}
