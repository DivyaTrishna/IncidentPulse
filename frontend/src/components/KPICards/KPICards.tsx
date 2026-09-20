import { Activity, AlertTriangle, FileText, TrendingUp, Wifi, WifiOff } from "lucide-react";
import type { Incident, SystemMode } from "../../types/incident";
import { isRecentlyUpdated } from "../../utils/incidentUtils";

interface KPICardsProps {
  incidents: Incident[];
  uncertainCount: number;
  mode: SystemMode;
}

interface Kpi {
  label: string;
  value: string;
  icon: typeof Activity;
  accent: string;
}

export function KPICards({ incidents, uncertainCount, mode }: KPICardsProps) {
  const activeCount = incidents.filter((i) => i.status === "active").length;
  const totalReports = incidents.reduce((sum, i) => sum + i.reportCount, 0);
  const updatedCount = incidents.filter((i) => isRecentlyUpdated(i)).length;

  const kpis: Kpi[] = [
    { label: "Active Incidents", value: String(activeCount), icon: Activity, accent: "text-ip-green" },
    { label: "Total Reports", value: String(totalReports), icon: FileText, accent: "text-ip-accent" },
    { label: "Incidents Updated", value: String(updatedCount), icon: TrendingUp, accent: "text-ip-yellow" },
    { label: "Uncertain Reports", value: String(uncertainCount), icon: AlertTriangle, accent: "text-ip-yellow" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-lg border border-ip-border bg-ip-panel p-3.5 shadow-panel"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ip-muted">{kpi.label}</span>
            <kpi.icon size={14} className={kpi.accent} />
          </div>
          <div className="mt-1.5 text-2xl font-semibold text-ip-text">{kpi.value}</div>
        </div>
      ))}

      <div className="rounded-lg border border-ip-border bg-ip-panel p-3.5 shadow-panel">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ip-muted">System Status</span>
          {mode === "live" ? (
            <Wifi size={14} className="text-ip-green" />
          ) : (
            <WifiOff size={14} className="text-ip-yellow" />
          )}
        </div>
        <div className={`mt-1.5 text-2xl font-semibold ${mode === "live" ? "text-ip-green" : "text-ip-yellow"}`}>
          {mode === "live" ? "ONLINE" : "DEMO"}
        </div>
      </div>
    </div>
  );
}
