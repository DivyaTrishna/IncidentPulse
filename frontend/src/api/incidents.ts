import { apiClient } from "./client";
import type { Incident, SubmitReportInput } from "../types/incident";
import { normalizeIncident, normalizeIncidentDetail } from "../utils/normalize";

export interface HealthResult {
  ok: boolean;
  storageBackend: string | null;
  useBedrock: boolean | null;
}

export interface SubmitReportResult {
  success: boolean;
  action: "MERGED" | "CREATED" | "UNCERTAIN" | string;
  incidentId: string | null;
  candidateIncidentId: string | null;
  reportId: string;
  confidence: number;
  message: string | null;
}

/** GET /health -- used both as a startup probe and by the periodic
 * connection check that decides whether to (re)switch into demo mode. */
export async function getHealth(): Promise<HealthResult> {
  const res = await apiClient.get("/health");
  const data = res.data ?? {};
  return {
    ok: data.success !== false && data.status === "ok",
    storageBackend: typeof data.storage_backend === "string" ? data.storage_backend : null,
    useBedrock: typeof data.use_bedrock === "boolean" ? data.use_bedrock : null,
  };
}

/** GET /incidents -- list summaries. */
export async function getIncidents(): Promise<Incident[]> {
  const res = await apiClient.get("/incidents");
  const rawList = Array.isArray(res.data?.incidents) ? res.data.incidents : [];
  const incidents: Incident[] = [];
  for (const raw of rawList) {
    const normalized = normalizeIncident(raw);
    if (normalized) incidents.push(normalized);
  }
  return incidents;
}

/** GET /incidents/{id} -- full detail (state, reports, timeline, changes). */
export async function getIncident(incidentId: string): Promise<Incident | null> {
  const res = await apiClient.get(`/incidents/${encodeURIComponent(incidentId)}`);
  return normalizeIncidentDetail(res.data);
}

/** GET /incidents/{id}/timeline -- used for a lightweight timeline-only
 * refresh; getIncident() already includes the timeline, so this is
 * mainly exposed for completeness / future lighter-weight polling. */
export async function getIncidentTimeline(incidentId: string) {
  const res = await apiClient.get(`/incidents/${encodeURIComponent(incidentId)}/timeline`);
  const rawTimeline = Array.isArray(res.data?.timeline) ? res.data.timeline : [];
  return rawTimeline;
}

/** POST /reports */
export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const payload: Record<string, unknown> = {
    text: input.text,
    source: input.source || "citizen_report",
  };
  if (input.timestamp) payload.timestamp = input.timestamp;
  if (input.latitude !== null && input.longitude !== null) {
    payload.location = { lat: input.latitude, lng: input.longitude };
  }

  const res = await apiClient.post("/reports", payload);
  const data = res.data ?? {};
  return {
    success: data.success !== false,
    action: data.action ?? "UNCERTAIN",
    incidentId: typeof data.incident_id === "string" ? data.incident_id : null,
    candidateIncidentId: typeof data.candidate_incident_id === "string" ? data.candidate_incident_id : null,
    reportId: data.report_id ?? "",
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
    message: typeof data.message === "string" ? data.message : null,
  };
}

/** POST /reset */
export async function resetSystem(): Promise<void> {
  await apiClient.post("/reset");
}
