"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useSignMessage, useSignTypedData } from "wagmi";
import { ChatComposer } from "@/components/ChatComposer";
import { WalletButton } from "@/components/cards/WalletButton";
import { ProposalCard } from "@/components/cards/ProposalCard";
import { RiskCard } from "@/components/cards/RiskCard";
import { ReceiptCard } from "@/components/cards/ReceiptCard";
import { DelegationCard } from "@/components/cards/DelegationCard";
import { MemoryPanel } from "@/components/cards/MemoryPanel";
import { SAFE_DEMO_INTENT, SEPOLIA_CHAIN_ID, UNSAFE_DEMO_INTENT } from "@/lib/constants";
import type {
  ExecutionReceipt,
  RiskReport,
  TradeProposal,
} from "@/types/domain";

type Stage =
  | "policy_checking"
  | "risk_checking"
  | "signing"
  | "submitting"
  | "verifying";

type Msg =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "pending"; stage: Stage }
  | { id: string; kind: "intent-rejected"; code: string; reason: string }
  | { id: string; kind: "proposal"; proposal: TradeProposal }
  | { id: string; kind: "proposal-failed"; code: string; reason: string }
  | { id: string; kind: "risk-report"; report: RiskReport }
  | { id: string; kind: "risk-blocked"; report: RiskReport }
  | { id: string; kind: "wallet-connect-prompt" }
  | { id: string; kind: "wallet-connected"; address: string }
  | { id: string; kind: "wallet-refused"; reason: string }
  | { id: string; kind: "network-mismatch" }
  | { id: string; kind: "network-required-sepolia" }
  | { id: string; kind: "personal-sign-fallback-notice" }
  | { id: string; kind: "delegation-signed"; proposal: TradeProposal; approver: string; method: string; signedAt: string }
  | { id: string; kind: "signature-refused"; reason: string }
  | { id: string; kind: "adapter-fallback"; from: string; to: string; reason: string }
  | { id: string; kind: "receipt"; receipt: ExecutionReceipt };

async function clientTrace(stage: string, extra: Record<string, unknown> = {}) {
  try {
    await fetch("/api/trace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "client", stage, ...extra }),
    });
  } catch (err) {
    console.warn("clientTrace failed", err);
  }
}

const CLIENT_SECRET_PATTERNS: RegExp[] = [
  /private\s*key/i,
  /seed\s*phrase/i,
  /mnemonic/i,
  /--use-unsafe-private-key/i,
  /개인키|시드/i,
];
const CLIENT_TWELVE_WORD_PATTERN = /^\s*(?:[a-z]+\s+){11,}[a-z]+\s*$/i;
const CLIENT_HEX_PRIVATE_KEY_PATTERN = /\b0x[0-9a-f]{64}\b/i;

function clientLooksLikeSecret(text: string): boolean {
  return (
    CLIENT_SECRET_PATTERNS.some((re) => re.test(text)) ||
    CLIENT_TWELVE_WORD_PATTERN.test(text) ||
    CLIENT_HEX_PRIVATE_KEY_PATTERN.test(text)
  );
}

function mid() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

const STAGE_LABEL: Record<Stage, string> = {
  policy_checking: "Drafting proposal…",
  risk_checking: "Running 9-dimension risk gate…",
  signing: "Waiting for wallet signature…",
  submitting: "Submitting to adapter…",
  verifying: "Verifying execution…",
};

export default function FelloPilotPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const { signMessageAsync } = useSignMessage();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [memoryKey, setMemoryKey] = useState(0);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const scrollLockRef = useRef(false);

  const push = useCallback((m: Msg) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const replaceLastPending = useCallback((next: Msg | null) => {
    setMessages((prev) => {
      const filtered = prev.filter((m) => m.kind !== "pending");
      return next ? [...filtered, next] : filtered;
    });
  }, []);

  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    function onScroll() {
      const distance = el!.scrollHeight - el!.scrollTop - el!.clientHeight;
      scrollLockRef.current = distance > 200;
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (scrollLockRef.current) return;
    const el = historyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const lastConnectionRef = useRef<{ address?: string; chainId?: number }>({});
  const pendingProposalRef = useRef<TradeProposal | null>(null);
  useEffect(() => {
    const prev = lastConnectionRef.current;
    if (isConnected && address && address !== prev.address) {
      void clientTrace("wallet_connected", {
        addressPrefix: `${address.slice(0, 6)}…${address.slice(-4)}`,
        chainId,
      });
    } else if (!isConnected && prev.address) {
      void clientTrace("wallet_disconnected", {
        addressPrefix: `${prev.address.slice(0, 6)}…${prev.address.slice(-4)}`,
      });
    }
    if (chainId !== prev.chainId && isConnected) {
      void clientTrace("wallet_chain_changed", { chainId });
    }
    lastConnectionRef.current = { address, chainId };
  }, [address, chainId, isConnected]);

  useEffect(() => {
    const pending = pendingProposalRef.current;
    if (!pending) return;
    if (!isConnected || !address) return;
    if (chainId !== SEPOLIA_CHAIN_ID) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === "network-mismatch") return prev;
        if (last && last.kind === "network-required-sepolia") return prev;
        return [...prev, { id: mid(), kind: "network-mismatch" }];
      });
      return;
    }
    setMessages((prev) => {
      const hadMismatch = prev.some((m) => m.kind === "network-mismatch");
      const next: Msg[] = [...prev];
      if (hadMismatch && !prev.some((m) => m.kind === "network-required-sepolia")) {
        next.push({ id: mid(), kind: "network-required-sepolia" });
      }
      next.push({ id: mid(), kind: "wallet-connected", address });
      return next;
    });
    pendingProposalRef.current = null;
    setBusy(true);
    void signAndExecute(pending).finally(() => setBusy(false));
  }, [address, chainId, isConnected]);

  const runFlow = useCallback(
    async (text: string) => {
      setBusy(true);

      if (clientLooksLikeSecret(text)) {
        push({
          id: mid(),
          kind: "intent-rejected",
          code: "E001_INTENT_CONTAINS_SECRET",
          reason:
            "Input appears to contain a seed phrase or private key. FelloPilot never accepts secrets — the input was discarded without being shown.",
        });
        void clientTrace("intent_rejected_client", {
          code: "E001_INTENT_CONTAINS_SECRET",
        });
        setBusy(false);
        return;
      }

      push({ id: mid(), kind: "user", text });
      push({ id: mid(), kind: "pending", stage: "policy_checking" });

      let proposal: TradeProposal | null = null;
      try {
        const res = await fetch("/api/proposal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intent: text }),
        });
        const body = await res.json();
        if (!res.ok || body.kind === "rejected") {
          replaceLastPending({
            id: mid(),
            kind: "intent-rejected",
            code: body.code ?? "E_UNKNOWN",
            reason: body.reason ?? "Intent rejected.",
          });
          return;
        }
        proposal = body.proposal as TradeProposal;
        replaceLastPending({ id: mid(), kind: "proposal", proposal });
      } catch (err) {
        replaceLastPending({
          id: mid(),
          kind: "proposal-failed",
          code: "E003_PROPOSAL_FAILED",
          reason: (err as Error).message,
        });
        return;
      }

      push({ id: mid(), kind: "pending", stage: "risk_checking" });
      let riskReport: RiskReport | null = null;
      try {
        const res = await fetch("/api/risk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proposal }),
        });
        riskReport = (await res.json()) as RiskReport;
      } catch (err) {
        replaceLastPending(null);
        return;
      }

      if (riskReport.verdict === "fail") {
        replaceLastPending({ id: mid(), kind: "risk-blocked", report: riskReport });
        try {
          const r = await fetch("/api/execute/blocked", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ proposal, riskReport }),
          });
          const json = (await r.json()) as { receipt: ExecutionReceipt };
          push({ id: mid(), kind: "receipt", receipt: json.receipt });
          setMemoryKey((k) => k + 1);
        } catch (err) {
          console.error("blocked-receipt write failed", err);
        }
        return;
      }

      replaceLastPending({ id: mid(), kind: "risk-report", report: riskReport });

      if (!isConnected) {
        push({ id: mid(), kind: "wallet-connect-prompt" });
        pendingProposalRef.current = proposal!;
        setBusy(false);
        return;
      }

      if (chainId !== SEPOLIA_CHAIN_ID) {
        push({ id: mid(), kind: "network-mismatch" });
        pendingProposalRef.current = proposal!;
        setBusy(false);
        return;
      }

      push({ id: mid(), kind: "wallet-connected", address: address ?? "" });
      await signAndExecute(proposal!);
    },
    [address, chainId, isConnected, push, replaceLastPending],
  );

  const signAndExecute = useCallback(
    async (proposal: TradeProposal) => {
      if (!address) return;
      push({ id: mid(), kind: "pending", stage: "signing" });

      let builtIntent: {
        domain: { name: string; version: string; chainId: number };
        types: Record<string, readonly { name: string; type: string }[]>;
        primaryType: string;
        message: {
          approver: string;
          action: string;
          tokenAllowlist: string[];
          spendingCap: string;
          expiry: string;
          proposalId: string;
        };
        hash: string;
        personalSignMessage: string;
      } | null = null;
      try {
        const res = await fetch("/api/delegation/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proposal, approver: address, chainId: SEPOLIA_CHAIN_ID }),
        });
        builtIntent = await res.json();
      } catch (err) {
        replaceLastPending({
          id: mid(),
          kind: "signature-refused",
          reason: (err as Error).message,
        });
        return;
      }

      if (!builtIntent) return;

      let signature: `0x${string}` | null = null;
      let method: "eth_signTypedData_v4" | "personal_sign" = "eth_signTypedData_v4";
      let triedTyped = false;
      void clientTrace("delegation_sign_requested", {
        proposalId: proposal.id,
        method: "eth_signTypedData_v4",
      });
      try {
        triedTyped = true;
        signature = (await signTypedDataAsync({
          domain: builtIntent.domain as { name: string; version: string; chainId: number },
          types: builtIntent.types as unknown as Record<
            string,
            readonly { name: string; type: string }[]
          >,
          primaryType: builtIntent.primaryType,
          message: {
            approver: builtIntent.message.approver as `0x${string}`,
            action: builtIntent.message.action,
            tokenAllowlist: builtIntent.message.tokenAllowlist as `0x${string}`[],
            spendingCap: BigInt(builtIntent.message.spendingCap),
            expiry: BigInt(builtIntent.message.expiry),
            proposalId: builtIntent.message.proposalId as `0x${string}`,
          } as Record<string, unknown>,
        })) as `0x${string}`;
      } catch (typedErr) {
        if (triedTyped) {
          push({ id: mid(), kind: "personal-sign-fallback-notice" });
          void clientTrace("delegation_sign_typed_failed", {
            proposalId: proposal.id,
            error: (typedErr as Error).message,
          });
        }
        try {
          method = "personal_sign";
          signature = (await signMessageAsync({
            message: builtIntent.personalSignMessage,
            account: address,
          })) as `0x${string}`;
        } catch (personalErr) {
          replaceLastPending({
            id: mid(),
            kind: "signature-refused",
            reason: (personalErr as Error).message,
          });
          return;
        }
      }

      if (!signature) return;

      let verifyResult: { valid: boolean } = { valid: false };
      try {
        const res = await fetch("/api/delegation/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            proposalId: proposal.id,
            approver: address,
            chainId: SEPOLIA_CHAIN_ID,
            signature,
            method,
            message: builtIntent.message,
            personalSignMessage: builtIntent.personalSignMessage,
            delegationIntentHash: builtIntent.hash,
          }),
        });
        verifyResult = await res.json();
      } catch (err) {
        replaceLastPending({
          id: mid(),
          kind: "signature-refused",
          reason: (err as Error).message,
        });
        return;
      }

      if (!verifyResult.valid) {
        replaceLastPending({
          id: mid(),
          kind: "signature-refused",
          reason: "Signature could not be verified server-side.",
        });
        return;
      }

      replaceLastPending({
        id: mid(),
        kind: "delegation-signed",
        proposal,
        approver: address,
        method,
        signedAt: new Date().toISOString(),
      });

      push({ id: mid(), kind: "pending", stage: "submitting" });
      try {
        const res = await fetch("/api/execute", { method: "POST" });
        const body = (await res.json()) as {
          receipt: ExecutionReceipt;
          fallbackTrail: Array<{ from: string; to: string; reason: string }>;
        };
        replaceLastPending(null);
        if (body.fallbackTrail && body.fallbackTrail.length > 0) {
          for (const hop of body.fallbackTrail) {
            push({
              id: mid(),
              kind: "adapter-fallback",
              from: hop.from,
              to: hop.to,
              reason: hop.reason,
            });
          }
        }
        push({ id: mid(), kind: "receipt", receipt: body.receipt });
        setMemoryKey((k) => k + 1);
      } catch (err) {
        replaceLastPending({
          id: mid(),
          kind: "signature-refused",
          reason: (err as Error).message,
        });
      } finally {
        setBusy(false);
      }
    },
    [address, push, replaceLastPending, signMessageAsync, signTypedDataAsync],
  );

  const onSend = useCallback(
    async (text: string) => {
      setInput("");
      await runFlow(text);
      setBusy(false);
    },
    [runFlow],
  );

  return (
    <div className="shell">
      <main className="chat" data-testid="chat-shell">
        <header className="chat-header">
          <div>
            <h1>FelloPilot</h1>
            <div className="subtitle">
              자연어 crypto intent → onchain action flow · Sepolia testnet · 정직한 SIMULATION
            </div>
          </div>
          <WalletButton />
        </header>
        <div className="chat-history" ref={historyRef} data-testid="chat-history">
          {messages.length === 0 && (
            <div className="empty-state">
              <h2>FelloPilot에 오신 것을 환영합니다</h2>
              <p>
                자연어 crypto intent를 입력하면 AI가 proposal을 만들고, 9차원
                risk gate를 통과한 뒤 wallet 서명으로 delegation을 받아
                Sepolia testnet에 실행합니다. <strong>Mainnet은 금지</strong>,
                simulation은 SIMULATION 라벨로 정직하게 표시합니다.
              </p>
              <div className="seed-prompts">
                <button
                  type="button"
                  className="seed-prompt"
                  data-testid="seed-prompt-safe"
                  onClick={() => void onSend(SAFE_DEMO_INTENT)}
                >
                  <div className="label">▶ SAFE 데모 시나리오</div>
                  <div className="body">{SAFE_DEMO_INTENT}</div>
                </button>
                <button
                  type="button"
                  className="seed-prompt"
                  data-testid="seed-prompt-unsafe"
                  onClick={() => void onSend(UNSAFE_DEMO_INTENT)}
                >
                  <div className="label">▶ BLOCKED 데모 시나리오</div>
                  <div className="body">{UNSAFE_DEMO_INTENT}</div>
                </button>
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.kind === "user") {
              return (
                <div key={m.id} className="msg user" data-testid="chat-message-user">
                  <div className="bubble">{m.text}</div>
                </div>
              );
            }
            if (m.kind === "pending") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-pending"
                  data-stage={m.stage}
                >
                  <div className="pending">
                    <span className="spinner" />
                    <span className="stage-label">{STAGE_LABEL[m.stage]}</span>
                  </div>
                </div>
              );
            }
            if (m.kind === "intent-rejected") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-intent-rejected"
                  data-error-code={m.code}
                >
                  <div className="notice error">
                    <strong>{m.code}</strong>
                    <div>{m.reason}</div>
                  </div>
                </div>
              );
            }
            if (m.kind === "proposal-failed") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-proposal-failed"
                  data-error-code={m.code}
                >
                  <div className="notice error">
                    <strong>{m.code}</strong>
                    <div>{m.reason}</div>
                  </div>
                </div>
              );
            }
            if (m.kind === "proposal") {
              return (
                <div key={m.id} className="msg assistant">
                  <ProposalCard proposal={m.proposal} />
                </div>
              );
            }
            if (m.kind === "risk-report" || m.kind === "risk-blocked") {
              return (
                <div key={m.id} className="msg assistant">
                  <RiskCard report={m.report} />
                </div>
              );
            }
            if (m.kind === "wallet-connect-prompt") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-wallet-connect-prompt"
                >
                  <div className="card">
                    <div className="card-title">
                      <span className="icon" /> Wallet Connect Required
                    </div>
                    <div style={{ fontSize: 13 }}>
                      Risk gate 통과. 이제 wallet을 연결하고 delegation에
                      서명해주세요.
                    </div>
                    <WalletButton />
                  </div>
                </div>
              );
            }
            if (m.kind === "network-mismatch") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-network-mismatch"
                >
                  <div className="card warn">
                    <div className="card-title">
                      <span className="icon" /> Network mismatch
                    </div>
                    <div style={{ fontSize: 13 }}>
                      이 데모는 <strong>Sepolia</strong>에서만 동작합니다.
                      체인을 전환해주세요.
                    </div>
                    <WalletButton />
                  </div>
                </div>
              );
            }
            if (m.kind === "wallet-connected") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-wallet-connected"
                >
                  <div className="notice success">
                    Wallet connected on Sepolia: {m.address.slice(0, 6)}…{m.address.slice(-4)}
                  </div>
                </div>
              );
            }
            if (m.kind === "wallet-refused") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-wallet-refused"
                >
                  <div className="notice error">Wallet connection cancelled: {m.reason}</div>
                </div>
              );
            }
            if (m.kind === "network-required-sepolia") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-network-required-sepolia"
                >
                  <div className="notice success">Network switched to Sepolia.</div>
                </div>
              );
            }
            if (m.kind === "personal-sign-fallback-notice") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-personal-sign-fallback-notice"
                >
                  <div className="notice">
                    Wallet doesn&apos;t support EIP-712 typed data. Falling back to
                    personal_sign (server still verifies).
                  </div>
                </div>
              );
            }
            if (m.kind === "delegation-signed") {
              return (
                <div key={m.id} className="msg assistant">
                  <DelegationCard
                    proposal={m.proposal}
                    approver={m.approver}
                    signatureMethod={m.method}
                    signedAt={m.signedAt}
                  />
                </div>
              );
            }
            if (m.kind === "signature-refused") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-signature-refused"
                >
                  <div className="notice error">Signature declined: {m.reason}</div>
                </div>
              );
            }
            if (m.kind === "adapter-fallback") {
              return (
                <div
                  key={m.id}
                  className="msg assistant"
                  data-testid="chat-message-adapter-fallback"
                  data-from={m.from}
                  data-to={m.to}
                >
                  <div className="notice">
                    Adapter fallback: <strong>{m.from}</strong> → <strong>{m.to}</strong>.{" "}
                    {m.reason}
                  </div>
                </div>
              );
            }
            if (m.kind === "receipt") {
              return (
                <div key={m.id} className="msg assistant">
                  <ReceiptCard receipt={m.receipt} />
                </div>
              );
            }
            return null;
          })}
        </div>
        <div className="chat-input-row">
          <ChatComposer busy={busy} onSend={onSend} value={input} onChange={setInput} />
        </div>
      </main>
      <MemoryPanel refreshKey={memoryKey} />
    </div>
  );
}
