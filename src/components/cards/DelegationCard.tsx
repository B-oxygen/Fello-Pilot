import type { TradeProposal } from "@/types/domain";

export function DelegationCard({
  proposal,
  approver,
  signatureMethod,
  signedAt,
}: {
  proposal: TradeProposal;
  approver: string;
  signatureMethod: string;
  signedAt: string;
}) {
  return (
    <div
      className="card success"
      data-testid="chat-card-delegation-signed"
      data-signature-method={signatureMethod}
    >
      <div className="card-title">
        <span className="icon" /> Delegation Signed
      </div>
      <div style={{ fontSize: 13 }}>
        EIP-712 delegation intent has been signed and verified.
      </div>
      <div className="kv">
        <span className="k">Approver</span>
        <span className="v">{approver}</span>
        <span className="k">Method</span>
        <span className="v">{signatureMethod}</span>
        <span className="k">Action</span>
        <span className="v">{proposal.parsedIntent.action}</span>
        <span className="k">Spending cap</span>
        <span className="v">
          {proposal.delegationPolicy.spendingCap} {proposal.parsedIntent.tokenIn ?? ""}
        </span>
        <span className="k">Expiry</span>
        <span className="v">
          {proposal.delegationPolicy.expiryMinutes} min from proposal time
        </span>
        <span className="k">Token allowlist</span>
        <span className="v">
          {proposal.delegationPolicy.tokenAllowlist.join(", ") || "—"}
        </span>
        <span className="k">Signed at</span>
        <span className="v">{signedAt}</span>
      </div>
    </div>
  );
}
