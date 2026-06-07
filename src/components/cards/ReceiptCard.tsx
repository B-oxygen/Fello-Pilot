import type { ExecutionReceipt } from "@/types/domain";
import { SimulationBadge, SimulationStripe } from "./SimulationBadge";

export function ReceiptCard({ receipt }: { receipt: ExecutionReceipt }) {
  const isSimulated = receipt.simulated;
  const isBlocked = receipt.variant === "blocked";
  const isReal = receipt.variant === "real_attestation";

  const copyKo = isReal
    ? "위임이 Sepolia에 기록되었습니다. 실제 swap이 아닌 attestation 트랜잭션입니다."
    : isSimulated
      ? "SIMULATION — 실제 트랜잭션은 발생하지 않았습니다."
      : isBlocked
        ? "이 실행은 차단되었습니다."
        : "실행 중 오류가 발생했습니다.";

  const copyEn = isReal
    ? "Delegation attested onchain on Sepolia. Attestation tx, not a swap."
    : isSimulated
      ? "SIMULATION — no onchain transaction was sent."
      : isBlocked
        ? "This execution was blocked."
        : "Execution failed.";

  const cardClass = isReal
    ? "card success"
    : isBlocked
      ? "card danger"
      : isSimulated
        ? "card warn"
        : "card danger";

  return (
    <div
      className={cardClass}
      data-testid="chat-card-receipt"
      data-receipt-variant={receipt.variant}
      data-simulated={String(receipt.simulated)}
    >
      <div
        className="card-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="icon" /> Execution Receipt
        </span>
        {isSimulated && <SimulationBadge />}
      </div>
      {isSimulated && <SimulationStripe />}
      <div style={{ fontWeight: 600, fontSize: 14 }}>{copyKo}</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{copyEn}</div>
      <div className="kv">
        <span className="k">Variant</span>
        <span className="v">{receipt.variant}</span>
        <span className="k">Adapter</span>
        <span className="v">{receipt.adapter}</span>
        <span className="k">Runtime mode</span>
        <span className="v">{receipt.runtimeMode}</span>
        <span className="k">Simulated</span>
        <span className="v">{String(receipt.simulated)}</span>
        {receipt.chainName && (
          <>
            <span className="k">Chain</span>
            <span className="v">
              {receipt.chainName} ({receipt.chainId})
            </span>
          </>
        )}
        {receipt.txnId && (
          <>
            <span className="k">Txn ID</span>
            <span className="v">{receipt.txnId}</span>
          </>
        )}
        {receipt.txHash && (
          <>
            <span className="k">Tx hash</span>
            <span className="v">{receipt.txHash}</span>
          </>
        )}
        {receipt.explorerUrl && (
          <>
            <span className="k">Explorer</span>
            <span className="v">
              <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                {receipt.explorerUrl}
              </a>
            </span>
          </>
        )}
      </div>
      {receipt.blockedReasons && receipt.blockedReasons.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--red)", fontSize: 12 }}>
          {receipt.blockedReasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
