import {
  hashTypedData,
  isAddress,
  keccak256,
  toBytes,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import type { TradeProposal } from "@/types/domain";
import { SEPOLIA_CHAIN_ID, TOKEN_ADDRESS_BOOK_SEPOLIA } from "./constants";

export const DELEGATION_INTENT_DOMAIN_NAME = "FelloPilot Delegation Intent" as const;
export const DELEGATION_INTENT_VERSION = "1" as const;
export const DELEGATION_INTENT_PRIMARY_TYPE = "DelegationIntent" as const;

export const DELEGATION_INTENT_TYPES = {
  DelegationIntent: [
    { name: "approver", type: "address" },
    { name: "action", type: "string" },
    { name: "tokenAllowlist", type: "address[]" },
    { name: "spendingCap", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "proposalId", type: "bytes32" },
  ],
} as const;

export interface DelegationIntentMessage {
  approver: Address;
  action: string;
  tokenAllowlist: Address[];
  spendingCap: bigint;
  expiry: bigint;
  proposalId: Hex;
}

export interface BuiltIntent {
  domain: {
    name: typeof DELEGATION_INTENT_DOMAIN_NAME;
    version: typeof DELEGATION_INTENT_VERSION;
    chainId: number;
  };
  types: typeof DELEGATION_INTENT_TYPES;
  primaryType: typeof DELEGATION_INTENT_PRIMARY_TYPE;
  message: DelegationIntentMessage;
  hash: Hex;
  personalSignMessage: string;
}

export function resolveTokenAddress(symbol: string): Address {
  const key = symbol.trim().toUpperCase();
  const book = TOKEN_ADDRESS_BOOK_SEPOLIA[key];
  if (book) return book as Address;
  return "0x0000000000000000000000000000000000000000";
}

function proposalIdToBytes32(proposalId: string): Hex {
  return keccak256(toBytes(proposalId));
}

export function buildDelegationIntent(args: {
  proposal: TradeProposal;
  approver: Address;
  chainId?: number;
}): BuiltIntent {
  if (!isAddress(args.approver)) {
    throw new Error(`Invalid approver address: ${args.approver}`);
  }
  const chainId = args.chainId ?? SEPOLIA_CHAIN_ID;
  const policy = args.proposal.delegationPolicy;

  const tokenAllowlist: Address[] = policy.tokenAllowlist.map((s) => resolveTokenAddress(s));

  const spendingCap = BigInt(Math.max(0, Math.floor(policy.spendingCap)));
  const createdAtSec = Math.floor(new Date(args.proposal.createdAt).getTime() / 1000);
  if (!Number.isFinite(createdAtSec)) {
    throw new Error(`Invalid proposal.createdAt: ${args.proposal.createdAt}`);
  }
  const expiry = BigInt(createdAtSec + policy.expiryMinutes * 60);
  const proposalId = proposalIdToBytes32(args.proposal.id);

  const message: DelegationIntentMessage = {
    approver: args.approver,
    action: args.proposal.parsedIntent.action,
    tokenAllowlist,
    spendingCap,
    expiry,
    proposalId,
  };

  const domain = {
    name: DELEGATION_INTENT_DOMAIN_NAME,
    version: DELEGATION_INTENT_VERSION,
    chainId,
  } as const;

  const hash = hashTypedData({
    domain,
    types: DELEGATION_INTENT_TYPES,
    primaryType: DELEGATION_INTENT_PRIMARY_TYPE,
    message,
  });

  const personalSignMessage = [
    "FelloPilot Delegation Intent",
    `Approver: ${args.approver}`,
    `Action: ${message.action}`,
    `Chain ID: ${chainId}`,
    `Spending cap: ${spendingCap.toString()}`,
    `Allowlist: ${tokenAllowlist.join(",")}`,
    `Expiry (unix seconds): ${expiry.toString()}`,
    `Proposal hash: ${proposalId}`,
    `Intent hash: ${hash}`,
  ].join("\n");

  return {
    domain,
    types: DELEGATION_INTENT_TYPES,
    primaryType: DELEGATION_INTENT_PRIMARY_TYPE,
    message,
    hash,
    personalSignMessage,
  };
}

export async function verifyDelegationSignature(args: {
  message: DelegationIntentMessage;
  chainId: number;
  signature: Hex;
  expectedAddress: Address;
}): Promise<boolean> {
  return verifyTypedData({
    address: args.expectedAddress,
    domain: {
      name: DELEGATION_INTENT_DOMAIN_NAME,
      version: DELEGATION_INTENT_VERSION,
      chainId: args.chainId,
    },
    types: DELEGATION_INTENT_TYPES,
    primaryType: DELEGATION_INTENT_PRIMARY_TYPE,
    message: args.message,
    signature: args.signature,
  });
}

export function serializeBuiltIntent(built: BuiltIntent) {
  return {
    domain: built.domain,
    types: built.types,
    primaryType: built.primaryType,
    message: {
      approver: built.message.approver,
      action: built.message.action,
      tokenAllowlist: built.message.tokenAllowlist,
      spendingCap: built.message.spendingCap.toString(),
      expiry: built.message.expiry.toString(),
      proposalId: built.message.proposalId,
    },
    hash: built.hash,
    personalSignMessage: built.personalSignMessage,
  };
}

export function deserializeMessage(payload: {
  approver: string;
  action: string;
  tokenAllowlist: string[];
  spendingCap: string;
  expiry: string;
  proposalId: string;
}): DelegationIntentMessage {
  return {
    approver: payload.approver as Address,
    action: payload.action,
    tokenAllowlist: payload.tokenAllowlist as Address[],
    spendingCap: BigInt(payload.spendingCap),
    expiry: BigInt(payload.expiry),
    proposalId: payload.proposalId as Hex,
  };
}
