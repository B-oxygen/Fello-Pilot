import type { RiskReport } from "@/types/domain";

export function RiskCard({ report }: { report: RiskReport }) {
  const isBlocked = report.verdict === "fail";
  const testid = isBlocked ? "chat-card-risk-blocked" : "chat-card-risk-report";
  const rows = isBlocked
    ? report.dimensions.filter((d) => d.status === "fail")
    : report.dimensions;
  return (
    <div
      className={`card ${isBlocked ? "danger" : "success"}`}
      data-testid={testid}
      data-verdict={report.verdict}
    >
      <div className="card-title">
        <span className="icon" /> {isBlocked ? "Risk Review — BLOCKED" : "Risk Review — Pass"}
      </div>
      <div className="risk-grid">
        {rows.map((d) => (
          <div
            key={d.name}
            className={`risk-row ${d.status}`}
            data-testid="risk-dim-row"
            data-dim={d.name}
            data-status={d.status}
          >
            <span className="badge">{d.status === "pass" ? "✓" : "✗"}</span>
            <div>
              <div className="name">{d.name}</div>
              <div className="reason">{d.reason}</div>
            </div>
            <span className="address-pill">
              {String(d.actualValue).slice(0, 18)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {isBlocked
          ? `Blocked by ${report.blockedReasons.length} failing dimension(s). No signature was issued.`
          : `All 9 risk dimensions passed. Ready for delegation signature.`}
      </div>
    </div>
  );
}
