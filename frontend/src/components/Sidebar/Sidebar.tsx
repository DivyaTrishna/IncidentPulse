import { Activity, BarChart3, FileText, Map as MapIcon, Radio, Sparkles } from "lucide-react";
import { StatusIndicator } from "../StatusIndicator/StatusIndicator";
import type { SystemMode } from "../../types/incident";

export type NavKey = "overview" | "live" | "map" | "reports" | "analytics";

interface NavItem {
  key: NavKey;
  label: string;
  icon: typeof Activity;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: Activity, enabled: true },
  { key: "live", label: "Live Incidents", icon: Radio, enabled: true },
  { key: "map", label: "Map", icon: MapIcon, enabled: true },
  { key: "reports", label: "Reports", icon: FileText, enabled: true },
  { key: "analytics", label: "Analytics", icon: BarChart3, enabled: false },
];

interface SidebarProps {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  mode: SystemMode;
}

export function Sidebar({ active, onSelect, mode }: SidebarProps) {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-ip-border bg-ip-panel">
      <div className="px-5 py-5 border-b border-ip-border">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ip-accent/15 text-ip-accent">
            <Radio size={18} />
          </div>
          <span className="text-base font-semibold tracking-tight text-ip-text">IncidentPulse</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ip-muted">
          <Sparkles size={12} className="text-ip-accent" />
          AI Incident Intelligence
        </div>
        <p className="mt-1.5 text-xs leading-snug text-ip-muted">
          Turning fragmented reports into evolving incidents.
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              disabled={!item.enabled}
              onClick={() => item.enabled && onSelect(item.key)}
              aria-current={isActive ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-ip-accent/15 text-ip-accent font-medium"
                  : item.enabled
                    ? "text-ip-muted hover:bg-ip-panel2 hover:text-ip-text"
                    : "text-ip-muted/40 cursor-not-allowed"
              }`}
            >
              <Icon size={16} />
              {item.label}
              {!item.enabled && (
                <span className="ml-auto rounded bg-ip-border px-1.5 py-0.5 text-[10px] text-ip-muted">soon</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-ip-border px-4 py-4">
        <StatusIndicator
          color={mode === "live" ? "#3ecf8e" : "#e8b339"}
          label={mode === "live" ? "Backend Connected" : "Demo Mode"}
          pulse={mode === "live"}
        />
      </div>
    </aside>
  );
}
