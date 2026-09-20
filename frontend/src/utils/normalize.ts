// Everything the UI renders flows through these functions first. The
// backend team may change field names, omit optional fields, or return
// malformed data -- nothing here ever throws; every accessor has a
// fallback. This is the ONLY place that should know about the raw
// backend JSON shape.

import type {
  ChangeRecord,
  Incident,
  IncidentState,
  IncidentStatus,
  LatLng,
  ReportRecord,
  TimelineEvent,
  UncertainMatch,
} from "../types/incident";
import { toEventCategory } from "./incidentUtils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function bool(v: unknown): boolean {
  return v === true;
}

function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeLocation(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const lat = num(r.lat);
  const lng = num(r.lng ?? r.lon ?? r.long);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function normalizeStatus(raw: unknown): IncidentStatus {
  const s = str(raw).toLowerCase();
  if (s === "active" || s === "resolved") return s;
  return "unknown";
}

function normalizeState(raw: unknown): IncidentState {
  const r: Raw = raw && typeof raw === "object" ? (raw as Raw) : {};
  return {
    trafficBlocked: bool(r.traffic_blocked ?? r.trafficBlocked),
    emergencyResponse: bool(r.emergency_response ?? r.emergencyResponse),
    affectedRoads: arr<string>(r.affected_roads ?? r.affectedRoads).filter((x) => typeof x === "string"),
    affectedAreaKm: num(r.affected_area_km ?? r.affectedAreaKm),
    severity: typeof r.severity === "string" ? r.severity : null,
  };
}

let timelineFallbackCounter = 0;

export function normalizeTimelineEvent(raw: unknown): TimelineEvent {
  const r: Raw = raw && typeof raw === "object" ? (raw as Raw) : {};
  timelineFallbackCounter += 1;
  return {
    id: str(r.id, `tl-${timelineFallbackCounter}-${str(r.timestamp)}`),
    timestamp: str(r.timestamp, nowIso()),
    eventType: str(r.event_type ?? r.eventType, "update"),
    description: str(r.description, "Incident updated."),
    reportId: typeof (r.report_id ?? r.reportId) === "string" ? (r.report_id ?? r.reportId) : null,
    evidence: typeof r.evidence === "string" ? r.evidence : null,
  };
}

let changeFallbackCounter = 0;

export function normalizeChangeRecord(raw: unknown): ChangeRecord {
  const r: Raw = raw && typeof raw === "object" ? (raw as Raw) : {};
  changeFallbackCounter += 1;
  return {
    id: str(r.id, `chg-${changeFallbackCounter}-${str(r.type)}`),
    type: str(r.type, "update"),
    description: str(r.description, "Incident state changed."),
    significant: bool(r.significant),
    before: r.before ?? null,
    after: r.after ?? null,
    evidenceReportId:
      typeof (r.evidence_report_id ?? r.evidenceReportId) === "string"
        ? (r.evidence_report_id ?? r.evidenceReportId)
        : null,
    detectedAt: typeof (r.detected_at ?? r.detectedAt) === "string" ? (r.detected_at ?? r.detectedAt) : null,
  };
}

export function normalizeReport(raw: unknown): ReportRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const reportId = str(r.report_id ?? r.reportId);
  if (!reportId) return null;
  return {
    reportId,
    text: str(r.text, "(no text provided)"),
    timestamp: str(r.timestamp, nowIso()),
    source: str(r.source, "unknown"),
    location: normalizeLocation(r.location),
    confidence: num(r.confidence ?? r.semantic_similarity ?? r.match_score),
  };
}

/**
 * Normalizes one incident. Accepts either:
 *  - a GET /incidents summary object, or
 *  - a merged GET /incidents/{id} detail object (see normalizeIncidentDetail)
 *  - mock data, authored in the same raw shape as the backend.
 *
 * Missing optional fields (confidence, changes, summary, reports,
 * timeline, ...) degrade gracefully to empty/neutral defaults rather
 * than throwing or rendering "undefined".
 */
export function normalizeIncident(raw: unknown): Incident | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;

  const incidentId = str(r.incident_id ?? r.incidentId);
  if (!incidentId) return null;

  const rawEventType = typeof (r.event_type ?? r.eventType) === "string" ? (r.event_type ?? r.eventType) : null;
  const reportIds = arr<string>(r.reports).filter((x) => typeof x === "string");
  const reports = arr(r.reports_full ?? r.reportObjects)
    .map(normalizeReport)
    .filter((x): x is ReportRecord => x !== null);

  const reportCount = num(r.report_count ?? r.reportCount) ?? (reports.length > 0 ? reports.length : reportIds.length);

  return {
    incidentId,
    eventType: toEventCategory(rawEventType),
    rawEventType,
    location: normalizeLocation(r.location),
    firstSeen: str(r.first_seen ?? r.firstSeen, nowIso()),
    lastUpdated: str(r.last_updated ?? r.lastUpdated, r.first_seen ?? r.firstSeen ?? nowIso()),
    reportIds,
    reportCount,
    state: normalizeState(r.current_state ?? r.currentState),
    status: normalizeStatus(r.status),
    timeline: arr(r.timeline).map(normalizeTimelineEvent),
    changes: arr(r.change_history ?? r.changes).map(normalizeChangeRecord),
    confidence: num(r.confidence ?? r.match_score ?? r.matchScore),
    reports,
    summary: typeof r.summary === "string" ? r.summary : null,
  };
}

/**
 * Merges a GET /incidents/{id} response -- which nests the incident under
 * `incident` and keeps `reports` (full objects) and `timeline` /
 * `change_history` alongside it -- into one raw object that
 * normalizeIncident() can consume, then normalizes it.
 */
export function normalizeIncidentDetail(raw: unknown): Incident | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const base: Raw = r.incident && typeof r.incident === "object" ? { ...r.incident } : { ...r };

  if (Array.isArray(r.reports)) base.reports_full = r.reports;
  if (Array.isArray(r.timeline)) base.timeline = r.timeline;
  if (Array.isArray(r.change_history)) base.change_history = r.change_history;
  if (r.current_state) base.current_state = r.current_state;

  return normalizeIncident(base);
}

export function normalizeUncertainMatch(raw: unknown): UncertainMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const reportId = str(r.report_id ?? r.reportId ?? r.candidate_report_id);
  const candidateIncidentId = str(r.candidate_incident_id ?? r.candidateIncidentId ?? r.incident_id);
  if (!reportId || !candidateIncidentId) return null;
  const confidenceRaw = num(r.confidence ?? r.match_confidence);
  const confidence = confidenceRaw === null ? 0 : confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw;
  return {
    reportId,
    reportText: str(r.text ?? r.report_text, "(no text provided)"),
    candidateIncidentId,
    confidence,
    timestamp: str(r.timestamp, nowIso()),
  };
}
