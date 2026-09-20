import type { Incident } from "../../types/incident";
import { formatTime } from "../../utils/dateUtils";

interface IncidentTimelineProps {
  incident: Incident;
}

export function IncidentTimeline({ incident }: IncidentTimelineProps) {
  const events = [...incident.timeline].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (events.length === 0) {
    return <p className="text-sm text-ip-muted">No timeline events yet.</p>;
  }

  return (
    <ol className="relative ml-2 border-l border-ip-border pl-5">
      {events.map((event, idx) => {
        const isNewest = idx === events.length - 1;
        const report = incident.reports.find((r) => r.reportId === event.reportId);
        return (
          <li key={event.id} className={`relative pb-4 last:pb-0 ${isNewest ? "animate-fade-in" : ""}`}>
            <span
              className={`absolute -left-[25px] top-0.5 h-3 w-3 rounded-full border-2 border-ip-bg ${
                isNewest ? "bg-ip-accent" : "bg-ip-muted"
              }`}
            />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-ip-muted">{formatTime(event.timestamp)}</span>
              <span className={`text-sm font-medium ${isNewest ? "text-ip-accent" : "text-ip-text"}`}>
                {event.description}
              </span>
            </div>
            {report && <p className="mt-0.5 text-xs italic text-ip-muted">&ldquo;{report.text}&rdquo;</p>}
            <p className="mt-0.5 text-[11px] text-ip-muted">
              {report ? `Source: ${report.source.replace(/_/g, " ")}` : event.reportId ? `Report: ${event.reportId}` : null}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
