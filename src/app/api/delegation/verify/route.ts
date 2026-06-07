import { NextResponse } from "next/server";
import { deserializeMessage, verifyDelegationSignature } from "@/lib/delegation";
import { appendCommandLog, writeJson, DataFile } from "@/lib/store";
import type { Address, Hex } from "viem";
import type { DelegationState, SignatureMethod } from "@/types/domain";
import { verifyMessage } from "viem";

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
  };

  let valid = false;
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
    message: valid ? "Delegation signature verified." : "Delegation signature mismatch.",
    updatedAt: new Date().toISOString(),
    connectedWallet: {
      eoaAddress: body.approver,
      chainId: body.chainId,
      connectedAt: new Date().toISOString(),
      providerLabel: "injected",
    },
    approver: body.approver,
    chainId: body.chainId,
    delegationIntentHash: undefined,
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
  });

  return NextResponse.json({ valid, state });
}
