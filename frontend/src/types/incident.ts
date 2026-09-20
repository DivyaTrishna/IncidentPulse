// Normalized, frontend-facing types. The backend's raw JSON shape is
// intentionally NOT used directly anywhere in the UI -- everything flows
// through normalizeIncident() / normalizeReport() in utils/normalize.ts
// first, so a backend field rename or omission never crashes a component.

export type IncidentStatus = "active" | "resolved" | "unknown";

export type EventCategory =
  | "fire"
  | "accident"
  | "medical"
  | "crime"
  | "flood"
  | "infrastructure"
  | "unknown";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface IncidentState {
  trafficBlocked: boolean;
  emergencyResponse: boolean;
  affectedRoads: string[];
  affectedAreaKm: number | null;
  severity: string | null;
}

export interface TimelineEvent {
  id: string;
  timestamp: string; // ISO
  eventType: string;
  description: string;
  reportId: string | null;
  evidence: string | null;
}

export interface ChangeRecord {
  id: string;
  type: string;
  description: string;
  significant: boolean;
  before: unknown;
  after: unknown;
  evidenceReportId: string | null;
  detectedAt: string | null;
}

export interface ReportRecord {
  reportId: string;
  text: string;
  timestamp: string; // ISO
  source: string;
  location: LatLng | null;
  confidence: number | null; // semantic similarity / match score, 0-1 if known
}

export interface Incident {
  incidentId: string;
  eventType: EventCategory;
  rawEventType: string | null;
  location: LatLng | null;
  firstSeen: string; // ISO
  lastUpdated: string; // ISO
  reportIds: string[];
  reportCount: number;
  state: IncidentState;
  status: IncidentStatus;
  timeline: TimelineEvent[];
  changes: ChangeRecord[];
  confidence: number | null; // 0-1, if backend/mock provides one
  reports: ReportRecord[]; // full report objects, when available (detail fetch / mock)
  summary: string | null;
}

export interface UncertainMatch {
  reportId: string;
  reportText: string;
  candidateIncidentId: string;
  confidence: number; // 0-1
  timestamp: string;
}

export type SystemMode = "live" | "demo";

export interface SubmitReportInput {
  text: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
  timestamp: string | null; // ISO, optional -> backend/mock defaults to now
}

export interface NotificationItem {
  id: string;
  incidentId: string;
  title: string;
  detail: string;
  createdAt: number; // epoch ms
}
