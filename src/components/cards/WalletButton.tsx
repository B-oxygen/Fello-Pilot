"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { SEPOLIA_CHAIN_ID } from "@/lib/constants";

function truncate(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function clientTrace(stage: string, extra: Record<string, unknown> = {}) {
  try {
    await fetch("/api/trace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "client.wallet_button", stage, ...extra }),
    });
  } catch (err) {
    console.warn("clientTrace failed", err);
  }
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
    return (
      <button
        type="button"
        className="wallet-button primary"
        data-testid="wallet-connect-button"
        onClick={async () => {
          if (!injected) return;
          void clientTrace("wallet_connect_attempt", { connectorId: injected.id });
          try {
            const result = await connectAsync({ connector: injected });
            void clientTrace("wallet_connect_succeeded", {
              connectorId: injected.id,
              chainId: result.chainId,
              accounts: result.accounts.length,
            });
          } catch (err) {
            void clientTrace("wallet_connect_rejected", {
              connectorId: injected.id,
              error: (err as Error).message,
            });
          }
        }}
        disabled={connecting}
      >
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  if (chainId !== SEPOLIA_CHAIN_ID) {
    return (
      <button
        type="button"
        className="wallet-button warn"
        data-testid="switch-to-sepolia-button"
        onClick={async () => {
          void clientTrace("wallet_switch_attempt", {
            fromChainId: chainId,
            toChainId: SEPOLIA_CHAIN_ID,
          });
          try {
            const result = await switchChainAsync({ chainId: SEPOLIA_CHAIN_ID });
            void clientTrace("wallet_switch_succeeded", {
              chainId: result.id,
            });
          } catch (err) {
            void clientTrace("wallet_switch_rejected", {
              fromChainId: chainId,
              toChainId: SEPOLIA_CHAIN_ID,
              error: (err as Error).message,
            });
          }
        }}
        disabled={switching}
      >
        {switching ? "Switching…" : "Switch to Sepolia"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="wallet-button"
      data-testid="wallet-connected-pill"
      onClick={() => {
        void clientTrace("wallet_disconnect_requested", {
          addressPrefix: truncate(address),
        });
        disconnect();
      }}
      title="Click to disconnect"
    >
      {truncate(address)} · Sepolia
    </button>
  );
}
