import type { TradeProposal } from "@/types/domain";

export function ProposalCard({ proposal }: { proposal: TradeProposal }) {
  const intent = proposal.parsedIntent;
  return (
    <div
      className="card"
      data-testid="chat-card-proposal"
      data-proposal-id={proposal.id}
      data-action={intent.action}
      data-chain={intent.chain}
      data-amount={String(intent.amount ?? "")}
    >
      <div className="card-title">
        <span className="icon" /> Proposal
      </div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{proposal.summary}</div>
      <div className="kv">
        <span className="k">Action</span>
        <span className="v">{intent.action}</span>
        <span className="k">Chain</span>
        <span className="v">{intent.chain}</span>
        <span className="k">tokenIn</span>
        <span className="v">{intent.tokenIn ?? "—"}</span>
        <span className="k">tokenOut</span>
        <span className="v">{intent.tokenOut ?? "—"}</span>
        <span className="k">Amount</span>
        <span className="v">{intent.amount ?? "—"}</span>
        <span className="k">Recipient</span>
        <span className="v">{proposal.recipient}</span>
        <span className="k">Spending cap</span>
        <span className="v">{proposal.delegationPolicy.spendingCap}</span>
        <span className="k">Expiry</span>
        <span className="v">{proposal.delegationPolicy.expiryMinutes} min</span>
        <span className="k">Est. slippage</span>
        <span className="v">{proposal.estimatedSlippageBps} bps</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {proposal.proposedAction}
      </div>
    </div>
  );
}
