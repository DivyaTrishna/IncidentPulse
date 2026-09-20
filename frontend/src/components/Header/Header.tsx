import { PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { StatusIndicator } from "../StatusIndicator/StatusIndicator";
import { timeAgo } from "../../utils/dateUtils";
import type { SystemMode } from "../../types/incident";

interface HeaderProps {
  mode: SystemMode;
  lastUpdated: Date | null;
  loading: boolean;
  onRefresh: () => void;
  simulationActive: boolean;
  onToggleSimulation: () => void;
  pollIntervalMs: number;
}

export function Header({
  mode,
  lastUpdated,
  loading,
  onRefresh,
  simulationActive,
  onToggleSimulation,
  pollIntervalMs,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-ip-border bg-ip-panel px-4 sm:px-6 py-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-ip-text sm:text-base">IncidentPulse</h1>
          <span className="hidden items-center gap-1 rounded bg-ip-red/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-ip-red sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ip-red animate-pulse-dot" />
            LIVE
          </span>
        </div>
        <p className="text-xs text-ip-muted">Real-time incident intelligence</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {mode === "demo" && (
          <button
            type="button"
            onClick={onToggleSimulation}
            title="Advances a scripted incident so the dashboard visibly evolves during a demo. Only affects local demo data."
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              simulationActive
                ? "border-ip-accent/40 bg-ip-accent/15 text-ip-accent"
                : "border-ip-border text-ip-muted hover:text-ip-text hover:bg-ip-panel2"
            }`}
          >
            {simulationActive ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            Demo Simulation
          </button>
        )}

        <div className="hidden text-right sm:block">
          <StatusIndicator
            color={mode === "live" ? "#3ecf8e" : "#e8b339"}
            label={mode === "live" ? "Backend Connected" : "Demo Mode"}
            pulse={mode === "live"}
          />
          <p className="mt-0.5 text-[11px] text-ip-muted">
            Updated {lastUpdated ? timeAgo(lastUpdated.toISOString()) : "—"} · every {Math.round(pollIntervalMs / 1000)}s
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh incidents"
          className="inline-flex items-center gap-1.5 rounded-md border border-ip-border bg-ip-panel2 px-2.5 py-1.5 text-xs font-medium text-ip-text hover:bg-ip-border disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </header>
  );
}
