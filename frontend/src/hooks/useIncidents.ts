import { useCallback, useEffect, useRef, useState } from "react";
import * as liveApi from "../api/incidents";
import {
  applyNextSimulationStep,
  getMockIncidentSnapshot,
  getMockIncidentsSnapshot,
  getMockUncertainMatchesSnapshot,
  resetMockStore,
  resetSimulationProgress,
  submitMockReport,
} from "../mock/mockStore";
import { normalizeIncident, normalizeIncidentDetail, normalizeUncertainMatch } from "../utils/normalize";
import type { Incident, NotificationItem, SubmitReportInput, SystemMode, UncertainMatch } from "../types/incident";

const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 10_000;
const SIMULATION_STEP_INTERVAL_MS = 7_000;
const NOTIFICATION_TTL_MS = 8_000;
const LIVE_FAILURE_THRESHOLD = 2; // consecutive failed polls before dropping to demo mode

interface ChangeFingerprint {
  lastUpdated: string;
  reportCount: number;
  changeCount: number;
  significantChangeCount: number;
}

function fingerprint(incident: Incident): ChangeFingerprint {
  return {
    lastUpdated: incident.lastUpdated,
    reportCount: incident.reportCount,
    changeCount: incident.changes.length,
    significantChangeCount: incident.changes.filter((c) => c.significant).length,
  };
}

export interface SubmitFeedback {
  ok: boolean;
  message: string;
  incidentId: string | null;
  action: string | null;
}

export function useIncidents() {
  const [mode, setMode] = useState<SystemMode>("demo");
  const [modeDecided, setModeDecided] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [uncertainMatches, setUncertainMatches] = useState<UncertainMatch[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [simulationActive, setSimulationActive] = useState(false);

  const fingerprintsRef = useRef<Map<string, ChangeFingerprint>>(new Map());
  const liveFailuresRef = useRef(0);
  const firstLoadRef = useRef(true);
  const modeRef = useRef<SystemMode>("demo");
  modeRef.current = mode;

  const pushNotification = useCallback((incidentId: string, title: string, detail: string) => {
    const item: NotificationItem = {
      id: `${incidentId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      incidentId,
      title,
      detail,
      createdAt: Date.now(),
    };
    setNotifications((prev) => [item, ...prev].slice(0, 6));
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Auto-expire notifications so the panel never grows unbounded.
  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - NOTIFICATION_TTL_MS;
      setNotifications((prev) => prev.filter((n) => n.createdAt > cutoff));
    }, 1000);
    return () => clearInterval(timer);
  }, [notifications.length]);

  const diffAndNotify = useCallback(
    (next: Incident[]) => {
      const prevMap = fingerprintsRef.current;
      const nextMap = new Map<string, ChangeFingerprint>();

      for (const incident of next) {
        const fp = fingerprint(incident);
        nextMap.set(incident.incidentId, fp);

        if (firstLoadRef.current) continue; // don't notify on initial load

        const prevFp = prevMap.get(incident.incidentId);
        if (!prevFp) {
          pushNotification(incident.incidentId, `${incident.incidentId} created`, titleForIncident(incident));
          continue;
        }
        const changed =
          prevFp.lastUpdated !== fp.lastUpdated ||
          prevFp.reportCount !== fp.reportCount ||
          prevFp.changeCount !== fp.changeCount;
        if (!changed) continue;

        const latestSignificant = [...incident.changes].reverse().find((c) => c.significant);
        const detail = latestSignificant
          ? latestSignificant.description
          : fp.reportCount !== prevFp.reportCount
            ? `Now ${fp.reportCount} reports.`
            : "Incident updated.";
        pushNotification(incident.incidentId, `${incident.incidentId} updated`, detail);
      }

      fingerprintsRef.current = nextMap;
      firstLoadRef.current = false;
    },
    [pushNotification]
  );

  const refreshFromDemo = useCallback(() => {
    const raw = getMockIncidentsSnapshot();
    const normalized = raw
      .map((r) => normalizeIncident(r))
      .filter((x): x is Incident => x !== null);
    diffAndNotify(normalized);
    setIncidents(normalized);

    const rawUncertain = getMockUncertainMatchesSnapshot();
    setUncertainMatches(rawUncertain.map(normalizeUncertainMatch).filter((x): x is UncertainMatch => x !== null));

    setLastUpdated(new Date());
    setError(null);
    setLoading(false);
  }, [diffAndNotify]);

  const refreshFromLive = useCallback(async () => {
    try {
      const list = await liveApi.getIncidents();
      diffAndNotify(list);
      setIncidents(list);
      setLastUpdated(new Date());
      setError(null);
      setLoading(false);
      liveFailuresRef.current = 0;
      return true;
    } catch (err) {
      liveFailuresRef.current += 1;
      if (liveFailuresRef.current >= LIVE_FAILURE_THRESHOLD) {
        setMode("demo");
        setError("Backend unavailable — showing demo data.");
      }
      return false;
    }
  }, [diffAndNotify]);

  // Initial connectivity probe: decides whether we start in live or demo mode.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await liveApi.getHealth();
        if (cancelled) return;
        if (health.ok) {
          setMode("live");
        } else {
          setMode("demo");
        }
      } catch {
        if (!cancelled) setMode("demo");
      } finally {
        if (!cancelled) setModeDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Main polling loop -- starts only once the initial mode probe resolves,
  // so we never flash "demo mode" incorrectly before the health check
  // returns.
  useEffect(() => {
    if (!modeDecided) return;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (modeRef.current === "live") {
        const ok = await refreshFromLive();
        if (!ok && (modeRef.current as SystemMode) === "demo") {
          refreshFromDemo();
        }
      } else {
        refreshFromDemo();
        // Try to recover back to live if a backend appears; a lightweight
        // health probe alongside each poll, without blocking the UI.
        try {
          const health = await liveApi.getHealth();
          if (!cancelled && health.ok) {
            liveFailuresRef.current = 0;
            setMode("live");
          }
        } catch {
          // stay in demo mode
        }
      }
    }

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [modeDecided, mode, refreshFromLive, refreshFromDemo]);

  // Keep the selected incident's full detail in sync (separate from the
  // list poll, since detail requires its own fetch in live mode).
  const loadSelectedDetail = useCallback(async (incidentId: string | null) => {
    if (!incidentId) {
      setSelectedIncident(null);
      return;
    }
    if (modeRef.current === "demo") {
      const raw = getMockIncidentSnapshot(incidentId);
      const normalized = raw ? normalizeIncident(raw) : null;
      setSelectedIncident(normalized);
      return;
    }
    try {
      const detail = await liveApi.getIncident(incidentId);
      setSelectedIncident(detail);
      if (detail) {
        // GET /incidents only returns summaries (no report text, no
        // timeline) -- merge the richer detail we just fetched back into
        // the searchable list so "search by report text" and similar can
        // actually find something instead of silently matching nothing
        // until every incident has been individually opened.
        setIncidents((prev) =>
          prev.map((i) =>
            i.incidentId === detail.incidentId
              ? { ...i, reports: detail.reports, timeline: detail.timeline, changes: detail.changes }
              : i
          )
        );
      }
    } catch {
      // Fall back to whatever summary we already have in the list rather
      // than blanking the panel on a transient error.
      setSelectedIncident((prev) => prev);
    }
  }, []);

  useEffect(() => {
    loadSelectedDetail(selectedIncidentId);
  }, [selectedIncidentId, lastUpdated, loadSelectedDetail]);

  const selectIncident = useCallback((incidentId: string | null) => {
    setSelectedIncidentId(incidentId);
  }, []);

  const manualRefresh = useCallback(async () => {
    setLoading(true);
    if (modeRef.current === "live") {
      const ok = await refreshFromLive();
      if (!ok) refreshFromDemo();
    } else {
      refreshFromDemo();
    }
  }, [refreshFromLive, refreshFromDemo]);

  const submitReport = useCallback(
    async (input: SubmitReportInput): Promise<SubmitFeedback> => {
      if (modeRef.current === "live") {
        try {
          const result = await liveApi.submitReport(input);
          await refreshFromLive();
          if (result.action === "UNCERTAIN" && result.candidateIncidentId) {
            setUncertainMatches((prev) => [
              {
                reportId: result.reportId,
                reportText: input.text,
                candidateIncidentId: result.candidateIncidentId as string,
                confidence: result.confidence,
                timestamp: new Date().toISOString(),
              },
              ...prev,
            ]);
          }
          return {
            ok: true,
            message: result.message ?? `Report ${result.reportId} processed (${result.action}).`,
            incidentId: result.incidentId,
            action: result.action,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to submit report.";
          return { ok: false, message, incidentId: null, action: null };
        }
      }

      const result = submitMockReport(input);
      refreshFromDemo();
      return {
        ok: true,
        message: result.message,
        incidentId: result.incidentId,
        action: result.action,
      };
    },
    [refreshFromLive, refreshFromDemo]
  );

  const resetSystem = useCallback(async () => {
    if (modeRef.current === "live") {
      try {
        await liveApi.resetSystem();
        await refreshFromLive();
        return;
      } catch {
        // fall through to local reset of demo store as a safe no-op-ish path
      }
    }
    resetMockStore();
    resetSimulationProgress();
    setSimulationActive(false);
    firstLoadRef.current = true;
    refreshFromDemo();
  }, [refreshFromLive, refreshFromDemo]);

  // Demo simulation timer -- only ever mutates the local mock store, never
  // sends anything to a real backend, and auto-stops once the scripted
  // story is exhausted.
  useEffect(() => {
    if (!simulationActive) return;
    if (modeRef.current !== "demo") {
      setSimulationActive(false);
      return;
    }
    const timer = setInterval(() => {
      const step = applyNextSimulationStep();
      if (!step) {
        setSimulationActive(false);
        return;
      }
      refreshFromDemo();
      pushNotification(step.incidentId, `${step.incidentId} updated`, step.description);
    }, SIMULATION_STEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [simulationActive, refreshFromDemo, pushNotification]);

  const toggleSimulation = useCallback(() => {
    setSimulationActive((prev) => !prev);
  }, []);

  return {
    mode,
    modeDecided,
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
    resetSystem,
    simulationActive,
    toggleSimulation,
    pollIntervalMs: POLL_INTERVAL_MS,
  };
}

function titleForIncident(incident: Incident): string {
  return `New ${incident.rawEventType ?? incident.eventType} incident detected.`;
}
