import { AlertTriangle, Eye, GitMerge } from "lucide-react";
import type { SystemMode, UncertainMatch } from "../../types/incident";
import { formatTime } from "../../utils/dateUtils";
import { formatPercent } from "../../utils/formatters";

interface UncertainMatchesProps {
  matches: UncertainMatch[];
  onView: (incidentId: string) => void;
  mode: SystemMode;
}

export function UncertainMatches({ matches, onView, mode }: UncertainMatchesProps) {
  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-ip-border bg-ip-panel p-4">
        <SectionTitle mode={mode} />
        <p className="mt-2 text-sm text-ip-muted">No uncertain reports right now — every report is confidently matched.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ip-yellow/25 bg-ip-panel p-4">
      <SectionTitle mode={mode} />
      <ul className="mt-3 space-y-2.5">
        {matches.map((match) => (
          <li key={match.reportId} className="rounded-md border border-ip-border bg-ip-panel2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-ip-text">{match.reportId}</span>
              <span className="text-[11px] text-ip-muted">{formatTime(match.timestamp)}</span>
            </div>
            <p className="mt-1.5 text-sm text-ip-text">&ldquo;{match.reportText}&rdquo;</p>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-ip-muted">
                Potential incident:{" "}
                <span className="font-mono text-ip-accent">{match.candidateIncidentId}</span>
                <span className="ml-2">
                  Match confidence: <span className="text-ip-yellow">{formatPercent(match.confidence)}</span>
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onView(match.candidateIncidentId)}
                  className="inline-flex items-center gap-1 rounded border border-ip-border px-2 py-1 text-[11px] font-medium text-ip-text hover:bg-ip-panel"
                >
                  <Eye size={12} />
                  View
                </button>
                <button
                  type="button"
                  disabled
                  title="Manual merge isn't supported by the backend yet — this is a review flag, not an action."
                  className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-ip-border px-2 py-1 text-[11px] font-medium text-ip-muted/60"
                >
                  <GitMerge size={12} />
                  Review
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionTitle({ mode }: { mode: SystemMode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className="text-ip-yellow" />
        <h2 className="text-sm font-semibold tracking-wide text-ip-text">UNCERTAIN MATCHES</h2>
      </div>
      <span className="rounded bg-ip-border px-1.5 py-0.5 text-[10px] font-medium text-ip-muted" title={
        mode === "demo"
          ? "These are illustrative demo-mode examples, not real backend data."
          : "The backend has no endpoint to persist or list uncertain matches — these are from reports submitted this session only, and will be lost on reload."
      }>
        {mode === "demo" ? "DEMO DATA" : "THIS SESSION ONLY"}
      </span>
    </div>
  );
}
