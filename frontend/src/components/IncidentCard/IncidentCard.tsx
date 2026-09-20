import { Car, Flame, HelpCircle, HeartPulse, ShieldAlert, Waves, Construction, FileText, Clock } from "lucide-react";
import type { Incident } from "../../types/incident";
import { CATEGORY_COLOR, CATEGORY_LABEL, isRecentlyUpdated, STATUS_COLOR } from "../../utils/incidentUtils";
import { formatTime } from "../../utils/dateUtils";
import { formatPercent } from "../../utils/formatters";

const CATEGORY_ICON = {
  fire: Flame,
  accident: Car,
  medical: HeartPulse,
  crime: ShieldAlert,
  flood: Waves,
  infrastructure: Construction,
  unknown: HelpCircle,
} as const;

interface IncidentCardProps {
  incident: Incident;
  selected: boolean;
  onSelect: (incidentId: string) => void;
}

export function IncidentCard({ incident, selected, onSelect }: IncidentCardProps) {
  const Icon = CATEGORY_ICON[incident.eventType];
  const color = CATEGORY_COLOR[incident.eventType];
  const status = STATUS_COLOR[incident.status];
  const recentlyUpdated = isRecentlyUpdated(incident);

  return (
    <button
      type="button"
      onClick={() => onSelect(incident.incidentId)}
      aria-pressed={selected}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-ip-accent/50 bg-ip-accent/[0.06]"
          : "border-ip-border bg-ip-panel hover:border-ip-border hover:bg-ip-panel2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${color.bg} ${color.text}`}>
            <Icon size={14} />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-ip-text">{incident.incidentId}</span>
              {recentlyUpdated && (
                <span className="h-1.5 w-1.5 rounded-full bg-ip-accent animate-pulse-dot" title="Recently updated" />
              )}
            </div>
            <p className={`text-xs ${color.text}`}>{CATEGORY_LABEL[incident.eventType]}</p>
          </div>
        </div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${status.bg} ${status.text}`}>
          {incident.status}
        </span>
      </div>

      <p className="mt-2 truncate text-xs text-ip-muted">
        {incident.state.affectedRoads.length > 0 ? incident.state.affectedRoads.join(", ") : "Location unnamed"}
      </p>

      <div className="mt-2 flex items-center justify-between text-[11px] text-ip-muted">
        <span className="inline-flex items-center gap-1">
          <FileText size={11} />
          {incident.reportCount} report{incident.reportCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} />
          {formatTime(incident.lastUpdated)}
        </span>
      </div>

      {incident.confidence !== null && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ip-border">
            <div
              className="h-full rounded-full bg-ip-accent"
              style={{ width: formatPercent(incident.confidence) }}
            />
          </div>
          <span className="text-[10px] text-ip-muted">{formatPercent(incident.confidence)}</span>
        </div>
      )}

      {(incident.state.trafficBlocked || incident.state.emergencyResponse) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {incident.state.trafficBlocked && (
            <span className="rounded bg-ip-yellow/10 px-1.5 py-0.5 text-[10px] font-medium text-ip-yellow">
              Traffic blocked
            </span>
          )}
          {incident.state.emergencyResponse && (
            <span className="rounded bg-ip-red/10 px-1.5 py-0.5 text-[10px] font-medium text-ip-red">
              Emergency response
            </span>
          )}
        </div>
      )}
    </button>
  );
}
