import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatEther,
  http,
  isHex,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type {
  DelegationState,
  ExecutionReceipt,
  TradeProposal,
} from "@/types/domain";
import { BLOCKED_MAINNET_CHAIN_IDS } from "@/types/domain";
import { SEPOLIA_CHAIN_ID } from "@/lib/constants";

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io" as const;

export function isDirectViemEnabled(): boolean {
  return process.env.FELLOPILOT_ADAPTER === "direct_viem";
}

function getSignerKey(): Hex | null {
  const raw = process.env.FELLOPILOT_TESTNET_SIGNER_KEY;
  if (!raw) return null;
  const candidate = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!isHex(candidate) || candidate.length !== 66) return null;
  return candidate as Hex;
}

function buildFailed(
  args: { proposal: TradeProposal; traceId: string },
  timestamp: string,
  reason: string,
): ExecutionReceipt {
  return {
    proposalId: args.proposal.id,
    traceId: args.traceId,
    status: "FAILED",
    variant: "failed",
    adapter: "direct_viem",
    runtimeMode: "BLOCKED",
    simulated: false,
    message: `direct_viem refused: ${reason}`,
    timestamp,
  };
}

function buildBlocked(
  args: { proposal: TradeProposal; traceId: string },
  timestamp: string,
  reason: string,
  chainId: number,
): ExecutionReceipt {
  return {
    proposalId: args.proposal.id,
    traceId: args.traceId,
    status: "BLOCKED",
    variant: "blocked",
    adapter: "direct_viem",
    runtimeMode: "BLOCKED",
    simulated: false,
    message: `direct_viem refused: ${reason}`,
    timestamp,
    chainId,
    chainName: chainId === SEPOLIA_CHAIN_ID ? "sepolia" : undefined,
    blockedReasons: [reason],
  };
}

export async function executeDirectViem(args: {
  proposal: TradeProposal;
  delegation: DelegationState;
  traceId: string;
}): Promise<ExecutionReceipt> {
  const { proposal, delegation, traceId } = args;
  const timestamp = new Date().toISOString();

  if (delegation.signatureValid !== true) {
    return buildFailed({ proposal, traceId }, timestamp, "missing or invalid wallet signature");
  }
  if (delegation.status !== "approved") {
    return buildFailed(
      { proposal, traceId },
      timestamp,
      `delegation status is '${delegation.status}', must be 'approved'`,
    );
  }

  const chainId = delegation.chainId ?? SEPOLIA_CHAIN_ID;
  if (BLOCKED_MAINNET_CHAIN_IDS.includes(chainId as never)) {
    return buildBlocked(
      { proposal, traceId },
      timestamp,
      `chain ${chainId} is a production chain — refused by hardcoded testnet-only policy`,
      chainId,
    );
  }
  if (chainId !== SEPOLIA_CHAIN_ID) {
    return buildBlocked(
      { proposal, traceId },
      timestamp,
      `chain ${chainId} not supported by direct_viem; only Sepolia (${SEPOLIA_CHAIN_ID}) is allowed`,
      chainId,
    );
  }

  const signerKey = getSignerKey();
  if (!signerKey) {
    return buildFailed(
      { proposal, traceId },
      timestamp,
      "FELLOPILOT_TESTNET_SIGNER_KEY env var not configured. See README quick start.",
    );
  }

  const approver = delegation.approver as Address | undefined;
  const intentHash = delegation.delegationIntentHash as Hex | undefined;
  if (!approver) {
    return buildFailed({ proposal, traceId }, timestamp, "delegation missing approver address");
  }
  if (!intentHash || !isHex(intentHash) || intentHash.length !== 66) {
    return buildFailed(
      { proposal, traceId },
      timestamp,
      "delegation missing valid bytes32 delegationIntentHash",
    );
  }

  const signer = privateKeyToAccount(signerKey);
  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  const walletClient = createWalletClient({
    account: signer,
    chain: sepolia,
    transport: http(),
  });

  const balance = await publicClient.getBalance({ address: signer.address });
  if (balance === 0n) {
    return buildBlocked(
      { proposal, traceId },
      timestamp,
      `signer ${signer.address} has 0 ETH on Sepolia — fund via https://sepolia-faucet.pk910.de/ first`,
      chainId,
    );
  }

  const calldata = encodeAbiParameters(
    [
      { type: "address", name: "approver" },
      { type: "bytes32", name: "delegationIntentHash" },
    ],
    [approver, intentHash],
  );

  let txHash: Hex;
  try {
    txHash = await walletClient.sendTransaction({
      to: signer.address,
      value: 0n,
      data: calldata,
    });
  } catch (err) {
    return {
      proposalId: proposal.id,
      traceId,
      status: "FAILED",
      variant: "failed",
      adapter: "direct_viem",
      runtimeMode: "LIVE_TESTNET",
      simulated: false,
      message: `direct_viem sendTransaction failed: ${(err as Error).message}`,
      timestamp,
      chainId,
      chainName: "sepolia",
      rawReceipt: {
        signerAddress: signer.address,
        signerBalanceWei: balance.toString(),
      },
    };
  }

  let onchain;
  try {
    onchain = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
  } catch (err) {
    return {
      proposalId: proposal.id,
      traceId,
      status: "FAILED",
      variant: "failed",
      adapter: "direct_viem",
      runtimeMode: "LIVE_TESTNET",
      simulated: false,
      message: `tx ${txHash} submitted but receipt timed out: ${(err as Error).message}`,
      timestamp,
      chainId,
      chainName: "sepolia",
      txnId: txHash,
      txHash,
      explorerUrl: `${SEPOLIA_EXPLORER}/tx/${txHash}`,
      rawReceipt: { signerAddress: signer.address },
    };
  }

  return {
    proposalId: proposal.id,
    traceId,
    status: onchain.status === "success" ? "SUBMITTED" : "FAILED",
    variant: onchain.status === "success" ? "real_attestation" : "failed",
    adapter: "direct_viem",
    runtimeMode: "LIVE_TESTNET",
    simulated: false,
    message:
      onchain.status === "success"
        ? "Delegation attested onchain on Sepolia. Attestation tx, not the swap itself."
        : `tx ${txHash} reverted onchain.`,
    timestamp,
    chainId,
    chainName: "sepolia",
    txnId: txHash,
    txHash,
    explorerUrl: `${SEPOLIA_EXPLORER}/tx/${txHash}`,
    rawReceipt: {
      attestation: true,
      approver,
      delegationIntentHash: intentHash,
      blockNumber: onchain.blockNumber.toString(),
      gasUsed: onchain.gasUsed.toString(),
      effectiveGasPrice: onchain.effectiveGasPrice.toString(),
      signerAddress: signer.address,
      signerBalanceBefore: formatEther(balance),
    },
  };
}
