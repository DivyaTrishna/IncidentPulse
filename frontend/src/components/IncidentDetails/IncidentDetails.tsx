import { Car, Flame, HelpCircle, HeartPulse, ShieldAlert, Waves, Construction } from "lucide-react";
import type { ReactNode } from "react";
import type { Incident } from "../../types/incident";
import { CATEGORY_COLOR, CATEGORY_LABEL, STATUS_COLOR } from "../../utils/incidentUtils";
import { formatDateTime } from "../../utils/dateUtils";
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

interface IncidentDetailsProps {
  incident: Incident;
}

export function IncidentDetails({ incident }: IncidentDetailsProps) {
  const Icon = CATEGORY_ICON[incident.eventType];
  const color = CATEGORY_COLOR[incident.eventType];
  const status = STATUS_COLOR[incident.status];

  return (
    <div className="rounded-lg border border-ip-border bg-ip-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${color.bg} ${color.text}`}>
            <Icon size={20} />
          </span>
          <div>
            <p className="font-mono text-sm font-semibold text-ip-text">{incident.incidentId}</p>
            <p className={`text-sm font-medium ${color.text}`}>{CATEGORY_LABEL[incident.eventType]}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${status.bg} ${status.text}`}>
          {incident.status}
        </span>
      </div>

      <p className="mt-3 text-sm text-ip-text">
        {incident.state.affectedRoads.length > 0 ? incident.state.affectedRoads.join(", ") : "Location unnamed"}
      </p>
      {incident.summary && <p className="mt-1 text-xs leading-relaxed text-ip-muted">{incident.summary}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Confidence" value={incident.confidence !== null ? formatPercent(incident.confidence) : "—"} />
        <Metric label="First detected" value={formatDateTime(incident.firstSeen)} />
        <Metric label="Last updated" value={formatDateTime(incident.lastUpdated)} />
        <Metric label="Reports" value={String(incident.reportCount)} />
      </div>

      {(incident.state.trafficBlocked || incident.state.emergencyResponse || incident.state.severity) && (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ip-border pt-3">
          {incident.state.trafficBlocked && <Tag color="yellow">Traffic blocked</Tag>}
          {incident.state.emergencyResponse && <Tag color="red">Emergency response on scene</Tag>}
          {incident.state.severity && <Tag color="slate">Severity: {incident.state.severity}</Tag>}
          {incident.state.affectedAreaKm !== null && (
            <Tag color="slate">{incident.state.affectedAreaKm.toFixed(1)} km affected</Tag>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-ip-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ip-text">{value}</p>
    </div>
  );
}

function Tag({ children, color }: { children: ReactNode; color: "yellow" | "red" | "slate" }) {
  const styles = {
    yellow: "bg-ip-yellow/10 text-ip-yellow",
    red: "bg-ip-red/10 text-ip-red",
    slate: "bg-slate-500/10 text-slate-300",
  } as const;
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${styles[color]}`}>{children}</span>;
}
