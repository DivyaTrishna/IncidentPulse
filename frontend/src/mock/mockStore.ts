// A tiny in-memory "fake backend" used only in DEMO MODE. It holds
// mutable copies of the mock incidents so that submitting a report or
// running the demo simulation visibly changes the dashboard, the same
// way polling the real backend would. Nothing here is persisted or sent
// anywhere -- it lives for the lifetime of the browser tab.

import type { SubmitReportInput } from "../types/incident";
import { getMockIncidentsRaw, getMockUncertainMatchesRaw, SIMULATION_SCRIPT } from "./mockData";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

let incidents: Raw[] = deepClone(getMockIncidentsRaw());
let uncertainMatches: Raw[] = deepClone(getMockUncertainMatchesRaw());
let nextIncidentSeq = 1005;
let nextReportSeq = 900;
let simulationStepIndex = 0;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(): string {
  return new Date().toISOString();
}

export function resetMockStore(): void {
  incidents = deepClone(getMockIncidentsRaw());
  uncertainMatches = deepClone(getMockUncertainMatchesRaw());
  nextIncidentSeq = 1005;
  nextReportSeq = 900;
  simulationStepIndex = 0;
}

export function getMockIncidentsSnapshot(): Raw[] {
  return deepClone(incidents);
}

export function getMockIncidentSnapshot(incidentId: string): Raw | null {
  const found = incidents.find((i) => i.incident_id === incidentId);
  return found ? deepClone(found) : null;
}

export function getMockUncertainMatchesSnapshot(): Raw[] {
  return deepClone(uncertainMatches);
}

// Very small keyword heuristic standing in for the real backend's
// candidate search -- good enough to make demo submissions feel
// believable without pulling in the actual matching engine.
const INCIDENT_KEYWORDS: Record<string, string[]> = {
  "INC-1001": ["market road", "market", "mg road", "fire", "smoke"],
  "INC-1002": ["airport road", "airport", "accident", "collision", "crash"],
  "INC-1003": ["river road", "river", "bridge", "flood", "water"],
  "INC-1004": ["railway", "station", "power", "electricity"],
};

const CATEGORY_KEYWORDS: [string, string][] = [
  ["fire", "fire"],
  ["smoke", "fire"],
  ["accident", "accident"],
  ["crash", "accident"],
  ["collision", "accident"],
  ["flood", "flood"],
  ["waterlogging", "flood"],
  ["water", "flood"],
  ["power", "power_outage"],
  ["electricity", "power_outage"],
  ["tree", "fallen_tree"],
  ["traffic", "accident"],
];

function guessEventType(text: string): string {
  const lower = text.toLowerCase();
  for (const [kw, type] of CATEGORY_KEYWORDS) {
    if (lower.includes(kw)) return type;
  }
  return "unknown";
}

function findMatchingIncident(text: string): Raw | null {
  const lower = text.toLowerCase();
  let best: { incident: Raw; score: number } | null = null;
  for (const incident of incidents) {
    const keywords = INCIDENT_KEYWORDS[incident.incident_id] ?? [];
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { incident, score };
    }
  }
  return best ? best.incident : null;
}

export interface MockSubmitResult {
  success: true;
  action: "MERGED" | "CREATED";
  incidentId: string;
  reportId: string;
  confidence: number;
  message: string;
}

export function submitMockReport(input: SubmitReportInput): MockSubmitResult {
  const timestamp = input.timestamp ?? nowIso();
  const reportId = `RSIM${nextReportSeq++}`;
  const match = findMatchingIncident(input.text);

  if (match) {
    match.reports = Array.isArray(match.reports) ? [...match.reports, reportId] : [reportId];
    match.report_count = (match.report_count ?? match.reports.length - 1) + 1;
    match.last_updated = timestamp;
    if (Array.isArray(match.reports_full)) {
      match.reports_full.push({
        report_id: reportId,
        text: input.text,
        timestamp,
        source: input.source || "citizen_report",
        location:
          input.latitude !== null && input.longitude !== null
            ? { lat: input.latitude, lng: input.longitude }
            : match.location ?? null,
        confidence: 0.7,
      });
    }
    if (Array.isArray(match.timeline)) {
      match.timeline.push({
        timestamp,
        event_type: "report_merged",
        description: "Report merged into incident.",
        report_id: reportId,
        evidence: null,
      });
    }
    return {
      success: true,
      action: "MERGED",
      incidentId: match.incident_id,
      reportId,
      confidence: 0.74,
      message: `Report merged into ${match.incident_id}.`,
    };
  }

  const incidentId = `INC-${nextIncidentSeq++}`;
  const eventType = guessEventType(input.text);
  const location =
    input.latitude !== null && input.longitude !== null
      ? { lat: input.latitude, lng: input.longitude }
      : null;

  const created: Raw = {
    incident_id: incidentId,
    event_type: eventType,
    location,
    first_seen: timestamp,
    last_updated: timestamp,
    status: "active",
    confidence: 1.0,
    report_count: 1,
    summary: null,
    current_state: {
      traffic_blocked: false,
      emergency_response: false,
      affected_roads: [],
      affected_area_km: 0,
      severity: null,
    },
    reports: [reportId],
    reports_full: [
      {
        report_id: reportId,
        text: input.text,
        timestamp,
        source: input.source || "citizen_report",
        location,
        confidence: 1.0,
      },
    ],
    timeline: [
      {
        timestamp,
        event_type: "incident_created",
        description: "Incident created.",
        report_id: reportId,
        evidence: null,
      },
    ],
    change_history: [],
  };

  incidents = [created, ...incidents];

  return {
    success: true,
    action: "CREATED",
    incidentId,
    reportId,
    confidence: 1.0,
    message: `No suitable existing incident found; created ${incidentId}.`,
  };
}

/**
 * Advances the scripted demo-simulation story by exactly one step, applied
 * to INC-1001. Returns the applied step's description for notifications,
 * or null once the script is exhausted (it does not loop, so a live demo
 * settles rather than repeating itself forever).
 */
export function applyNextSimulationStep(): { incidentId: string; description: string; significant: boolean } | null {
  if (simulationStepIndex >= SIMULATION_SCRIPT.length) return null;
  const step = SIMULATION_SCRIPT[simulationStepIndex];
  simulationStepIndex += 1;

  const incident = incidents.find((i) => i.incident_id === "INC-1001");
  if (!incident) return null;

  const timestamp = nowIso();
  const reportId = `RSIM${nextReportSeq++}`;

  const stateDelta = {
    trafficBlocked: Boolean(incident.current_state?.traffic_blocked),
    emergencyResponse: Boolean(incident.current_state?.emergency_response),
    affectedRoads: Array.isArray(incident.current_state?.affected_roads)
      ? [...incident.current_state.affected_roads]
      : [],
  };
  step.apply(stateDelta);

  incident.current_state = {
    ...incident.current_state,
    traffic_blocked: stateDelta.trafficBlocked,
    emergency_response: stateDelta.emergencyResponse,
    affected_roads: stateDelta.affectedRoads,
  };
  incident.last_updated = timestamp;
  incident.reports = Array.isArray(incident.reports) ? [...incident.reports, reportId] : [reportId];
  incident.report_count = (incident.report_count ?? incident.reports.length - 1) + 1;

  if (Array.isArray(incident.reports_full)) {
    incident.reports_full.push({
      report_id: reportId,
      text: step.reportText,
      timestamp,
      source: step.source,
      location: incident.location ?? null,
      confidence: 0.8,
    });
  }
  if (Array.isArray(incident.timeline)) {
    incident.timeline.push({
      timestamp,
      event_type: step.changeType,
      description: step.changeDescription,
      report_id: reportId,
      evidence: reportId,
    });
  }
  if (Array.isArray(incident.change_history)) {
    incident.change_history.push({
      type: step.changeType,
      before: false,
      after: true,
      description: step.changeDescription,
      significant: step.significant,
      evidence_report_id: reportId,
      detected_at: timestamp,
    });
  }

  return { incidentId: "INC-1001", description: step.changeDescription, significant: step.significant };
}

export function isSimulationExhausted(): boolean {
  return simulationStepIndex >= SIMULATION_SCRIPT.length;
}

export function resetSimulationProgress(): void {
  simulationStepIndex = 0;
}
