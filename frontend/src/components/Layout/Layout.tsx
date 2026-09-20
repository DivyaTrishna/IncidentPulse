import type { ReactNode } from "react";
import { Sidebar, type NavKey } from "../Sidebar/Sidebar";
import { Header } from "../Header/Header";
import type { SystemMode } from "../../types/incident";

interface LayoutProps {
  activeNav: NavKey;
  onNavSelect: (key: NavKey) => void;
  mode: SystemMode;
  lastUpdated: Date | null;
  loading: boolean;
  onRefresh: () => void;
  simulationActive: boolean;
  onToggleSimulation: () => void;
  pollIntervalMs: number;
  children: ReactNode;
}

export function Layout({
  activeNav,
  onNavSelect,
  mode,
  lastUpdated,
  loading,
  onRefresh,
  simulationActive,
  onToggleSimulation,
  pollIntervalMs,
  children,
}: LayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ip-bg text-ip-text">
      <Sidebar active={activeNav} onSelect={onNavSelect} mode={mode} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          mode={mode}
          lastUpdated={lastUpdated}
          loading={loading}
          onRefresh={onRefresh}
          simulationActive={simulationActive}
          onToggleSimulation={onToggleSimulation}
          pollIntervalMs={pollIntervalMs}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
