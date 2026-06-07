"use client";

import { useEffect, useState } from "react";
import type { MemoryEntry } from "@/types/domain";

export function MemoryPanel({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/memory", { cache: "no-store" });
        const json = (await res.json()) as { entries: MemoryEntry[] };
        if (!cancelled) setEntries(json.entries.slice().reverse());
      } catch {
        if (!cancelled) setEntries([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <aside className="memory-panel" data-testid="memory-panel">
      <h2>
        Memory <span className="count" data-testid="memory-count">{entries.length}</span>
      </h2>
      {entries.length === 0 ? (
        <div className="empty">
          아직 기록된 실행이 없습니다. SAFE_DEMO를 실행하면 여기에 항목이 누적됩니다.
        </div>
      ) : (
        entries.map((entry) => (
          <div
            key={entry.proposalId}
            className="memory-entry"
            data-testid="memory-entry"
            data-proposal-id={entry.proposalId}
            data-variant={entry.execution.variant}
          >
            <div className="row">
              <span className="label">Action</span>
              <span className="value">{entry.proposal.action}</span>
            </div>
            <div className="row">
              <span className="label">Chain</span>
              <span className="value">{entry.proposal.chain}</span>
            </div>
            <div className="row">
              <span className="label">Risk</span>
              <span className="value">
                {entry.risk.verdict === "pass"
                  ? "pass"
                  : `fail (${entry.risk.failedDims.length} dims)`}
              </span>
            </div>
            <div className="row">
              <span className="label">Variant</span>
              <span className={`value variant ${entry.execution.variant}`}>
                {entry.execution.variant}
              </span>
            </div>
            {entry.execution.txHash && (
              <div className="row">
                <span className="label">txHash</span>
                <span className="value">
                  {entry.execution.txHash.slice(0, 10)}…
                </span>
              </div>
            )}
            <div className="row">
              <span className="label">Postmortem</span>
              <span className="value" style={{ fontSize: 11 }}>
                {entry.postmortem}
              </span>
            </div>
          </div>
        ))
      )}
    </aside>
  );
}
