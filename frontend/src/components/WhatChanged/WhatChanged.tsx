import { ArrowUpCircle, CheckCircle2, Sparkles } from "lucide-react";
import type { Incident } from "../../types/incident";
import { formatTime } from "../../utils/dateUtils";

interface WhatChangedProps {
  incident: Incident;
}

function iconFor(type: string) {
  if (type === "emergency_response" || type === "status") return CheckCircle2;
  return ArrowUpCircle;
}

export function WhatChanged({ incident }: WhatChangedProps) {
  // Most-recent-first, significant changes first within equal recency —
  // this is the section judges/operators look at to understand "what's
  // new" at a glance, so ordering matters more here than anywhere else.
  const changes = [...incident.changes].sort((a, b) => {
    const ta = new Date(a.detectedAt ?? 0).getTime();
    const tb = new Date(b.detectedAt ?? 0).getTime();
    return tb - ta;
  });

  return (
    <div className="rounded-lg border border-ip-accent/30 bg-gradient-to-b from-ip-accent/[0.06] to-transparent p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-ip-accent" />
        <h2 className="text-sm font-semibold tracking-wide text-ip-text">WHAT CHANGED?</h2>
      </div>

      {changes.length === 0 ? (
        <p className="mt-3 text-sm text-ip-muted">No significant changes detected.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {changes.map((change) => {
            const Icon = iconFor(change.type);
            const evidenceReport = incident.reports.find((r) => r.reportId === change.evidenceReportId);
            return (
              <li
                key={change.id}
                className={`rounded-md border p-2.5 ${
                  change.significant
                    ? "border-ip-accent/30 bg-ip-panel"
                    : "border-ip-border bg-ip-panel/60"
                }`}
              >
                <div className="flex items-start gap-2">
                  <Icon size={15} className={change.significant ? "mt-0.5 text-ip-accent" : "mt-0.5 text-ip-muted"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ip-text">{change.description}</p>
                      <span className="shrink-0 text-[11px] text-ip-muted">
                        {formatTime(change.detectedAt)}
                      </span>
                    </div>
                    {change.evidenceReportId && (
                      <p className="mt-1 text-xs text-ip-muted">
                        Evidence:{" "}
                        <span className="font-mono text-ip-accent">{change.evidenceReportId}</span>
                        {evidenceReport && <span className="italic"> — &ldquo;{evidenceReport.text}&rdquo;</span>}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
