import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useIncidents } from "../../hooks/useIncidents";
import { Layout } from "../../components/Layout/Layout";
import type { NavKey } from "../../components/Sidebar/Sidebar";
import { KPICards } from "../../components/KPICards/KPICards";
import { IncidentMap } from "../../components/IncidentMap/IncidentMap";
import { IncidentList } from "../../components/IncidentList/IncidentList";
import { IncidentDetails } from "../../components/IncidentDetails/IncidentDetails";
import { WhatChanged } from "../../components/WhatChanged/WhatChanged";
import { IncidentTimeline } from "../../components/IncidentTimeline/IncidentTimeline";
import { ReportList } from "../../components/ReportList/ReportList";
import { SubmitReport } from "../../components/SubmitReport/SubmitReport";
import { UncertainMatches } from "../../components/UncertainMatches/UncertainMatches";
import { Notifications } from "../../components/Notifications/Notifications";

const MOBILE_NAV: { key: NavKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "live", label: "Live" },
  { key: "map", label: "Map" },
  { key: "reports", label: "Reports" },
];

export function Dashboard() {
  const {
    mode,
    incidents,
    uncertainMatches,
    selectedIncidentId,
    selectedIncident,
    selectIncident,
    loading,
    error,
    lastUpdated,
    notifications,
    dismissNotification,
    manualRefresh,
    submitReport,
    simulationActive,
    toggleSimulation,
    pollIntervalMs,
  } = useIncidents();

  const [activeNav, setActiveNav] = useState<NavKey>("overview");

  const uncertainIncidentIds = useMemo(
    () => new Set(uncertainMatches.map((m) => m.candidateIncidentId)),
    [uncertainMatches]
  );

  function handleSelect(incidentId: string) {
    selectIncident(incidentId);
  }

  const detailSection = selectedIncident && (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <IncidentDetails incident={selectedIncident} />
        <div className="rounded-lg border border-ip-border bg-ip-panel p-4">
          <h3 className="text-sm font-semibold tracking-wide text-ip-text">TIMELINE</h3>
          <div className="mt-3">
            <IncidentTimeline incident={selectedIncident} />
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-1">
        <WhatChanged incident={selectedIncident} />
        <div className="rounded-lg border border-ip-border bg-ip-panel p-4">
          <h3 className="text-sm font-semibold tracking-wide text-ip-text">REPORTS / EVIDENCE</h3>
          <div className="mt-3">
            <ReportList incident={selectedIncident} />
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-1">
        <SubmitReport onSubmit={submitReport} />
        <UncertainMatches matches={uncertainMatches} onView={handleSelect} mode={mode} />
      </div>
    </div>
  );

  return (
    <Layout
      activeNav={activeNav}
      onNavSelect={setActiveNav}
      mode={mode}
      lastUpdated={lastUpdated}
      loading={loading}
      onRefresh={manualRefresh}
      simulationActive={simulationActive}
      onToggleSimulation={toggleSimulation}
      pollIntervalMs={pollIntervalMs}
    >
      {/* Mobile nav — Sidebar is desktop-only (lg+) */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto lg:hidden">
        {MOBILE_NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveNav(item.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              activeNav === item.key ? "bg-ip-accent text-black" : "bg-ip-panel2 text-ip-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-ip-yellow/30 bg-ip-yellow/10 px-3 py-2 text-xs text-ip-yellow">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <KPICards incidents={incidents} uncertainCount={uncertainMatches.length} mode={mode} />

      {activeNav === "overview" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="h-[420px] lg:col-span-2">
              <IncidentMap incidents={incidents} selectedIncidentId={selectedIncidentId} onSelect={handleSelect} />
            </div>
            <div className="h-[420px] overflow-hidden rounded-lg border border-ip-border bg-ip-panel lg:col-span-1">
              <IncidentList
                incidents={incidents}
                uncertainIncidentIds={uncertainIncidentIds}
                selectedIncidentId={selectedIncidentId}
                onSelect={handleSelect}
              />
            </div>
          </div>
          {detailSection}
        </>
      )}

      {activeNav === "live" && (
        <>
          <div className="mt-4 h-[560px] overflow-hidden rounded-lg border border-ip-border bg-ip-panel">
            <IncidentList
              incidents={incidents}
              uncertainIncidentIds={uncertainIncidentIds}
              selectedIncidentId={selectedIncidentId}
              onSelect={handleSelect}
            />
          </div>
          {detailSection}
        </>
      )}

      {activeNav === "map" && (
        <>
          <div className="mt-4 h-[620px]">
            <IncidentMap incidents={incidents} selectedIncidentId={selectedIncidentId} onSelect={handleSelect} />
          </div>
          {detailSection}
        </>
      )}

      {activeNav === "reports" && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-[560px] overflow-hidden rounded-lg border border-ip-border bg-ip-panel lg:col-span-1">
            <IncidentList
              incidents={incidents}
              uncertainIncidentIds={uncertainIncidentIds}
              selectedIncidentId={selectedIncidentId}
              onSelect={handleSelect}
            />
          </div>
          <div className="space-y-4 lg:col-span-2">
            {selectedIncident ? (
              <div className="rounded-lg border border-ip-border bg-ip-panel p-4">
                <h3 className="text-sm font-semibold tracking-wide text-ip-text">
                  REPORTS / EVIDENCE — {selectedIncident.incidentId}
                </h3>
                <div className="mt-3">
                  <ReportList incident={selectedIncident} />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-ip-border bg-ip-panel p-8 text-center">
                <p className="text-sm text-ip-muted">Select an incident from the list to see its reports.</p>
              </div>
            )}
            <SubmitReport onSubmit={submitReport} />
            <UncertainMatches matches={uncertainMatches} onView={handleSelect} mode={mode} />
          </div>
        </div>
      )}

      <Notifications items={notifications} onDismiss={dismissNotification} onOpen={handleSelect} />
    </Layout>
  );
}
