import { MapPin } from "lucide-react";
import type { Incident } from "../../types/incident";
import { formatDateTime } from "../../utils/dateUtils";
import { formatPercent, titleCase } from "../../utils/formatters";

interface ReportListProps {
  incident: Incident;
}

export function ReportList({ incident }: ReportListProps) {
  const reports = [...incident.reports].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (reports.length === 0) {
    return (
      <p className="text-sm text-ip-muted">
        No individual report text available for this incident yet.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {reports.map((report) => (
        <div key={report.reportId} className="rounded-md border border-ip-border bg-ip-panel2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-ip-accent">{report.reportId}</span>
            <span className="text-[11px] text-ip-muted">{formatDateTime(report.timestamp)}</span>
          </div>
          <p className="mt-1.5 text-sm text-ip-text">&ldquo;{report.text}&rdquo;</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ip-muted">
            <span>{titleCase(report.source)}</span>
            {report.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} />
                {report.location.lat.toFixed(4)}, {report.location.lng.toFixed(4)}
              </span>
            )}
            {report.confidence !== null && (
              <span>
                Semantic similarity: <span className="text-ip-text">{formatPercent(report.confidence)}</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
