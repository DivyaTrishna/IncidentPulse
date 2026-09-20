import type { EventCategory, Incident, IncidentStatus } from "../types/incident";

// Maps the many raw event_type strings the backend's extractor can
// produce onto a small set of display categories used for map markers
// and badges. Unknown/unlisted types fall back to "unknown" rather than
// crashing or showing "undefined".
const CATEGORY_MAP: Record<string, EventCategory> = {
  fire: "fire",
  smoke: "fire",
  accident: "accident",
  crash: "accident",
  traffic: "accident",
  medical: "medical",
  ambulance: "medical",
  crime: "crime",
  flood: "flood",
  waterlogging: "flood",
  fallen_tree: "infrastructure",
  power_outage: "infrastructure",
  infrastructure: "infrastructure",
};

export function toEventCategory(rawType: string | null | undefined): EventCategory {
  if (!rawType) return "unknown";
  const key = rawType.trim().toLowerCase();
  return CATEGORY_MAP[key] ?? "unknown";
}

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  fire: "Fire",
  accident: "Accident",
  medical: "Medical",
  crime: "Crime",
  flood: "Flooding",
  infrastructure: "Infrastructure",
  unknown: "Unclassified",
};

// Tailwind color tokens per category — used consistently across map
// markers, badges, and list accents so an incident is recognizable at a
// glance regardless of which component renders it.
export const CATEGORY_COLOR: Record<EventCategory, { text: string; bg: string; border: string; dot: string }> = {
  fire: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", dot: "#f2545b" },
  accident: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "#f2954b" },
  medical: { text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/30", dot: "#ef6ea8" },
  crime: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30", dot: "#a78bfa" },
  flood: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "#3ba7ff" },
  infrastructure: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "#e8b339" },
  unknown: { text: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", dot: "#7c8aa3" },
};

export const STATUS_COLOR: Record<IncidentStatus, { text: string; bg: string; dot: string }> = {
  active: { text: "text-ip-green", bg: "bg-ip-green/10", dot: "#3ecf8e" },
  resolved: { text: "text-ip-muted", bg: "bg-ip-muted/10", dot: "#7c8aa3" },
  unknown: { text: "text-ip-yellow", bg: "bg-ip-yellow/10", dot: "#e8b339" },
};

export type IncidentFilter = "all" | "active" | "updated" | "uncertain" | "resolved";
export type IncidentSort = "recent" | "first_detected" | "report_count";

const RECENTLY_UPDATED_MS = 15 * 60 * 1000; // 15 minutes

export function isRecentlyUpdated(incident: Incident): boolean {
  const t = new Date(incident.lastUpdated).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= RECENTLY_UPDATED_MS;
}

export function filterIncidents(
  incidents: Incident[],
  filter: IncidentFilter,
  uncertainIncidentIds: Set<string>
): Incident[] {
  switch (filter) {
    case "active":
      return incidents.filter((i) => i.status === "active");
    case "resolved":
      return incidents.filter((i) => i.status === "resolved");
    case "updated":
      return incidents.filter((i) => isRecentlyUpdated(i));
    case "uncertain":
      return incidents.filter((i) => uncertainIncidentIds.has(i.incidentId));
    case "all":
    default:
      return incidents;
  }
}

export function searchIncidents(incidents: Incident[], query: string): Incident[] {
  const q = query.trim().toLowerCase();
  if (!q) return incidents;
  return incidents.filter((i) => {
    if (i.incidentId.toLowerCase().includes(q)) return true;
    if ((i.rawEventType ?? i.eventType).toLowerCase().includes(q)) return true;
    if (i.state.affectedRoads.some((r) => r.toLowerCase().includes(q))) return true;
    if (i.reports.some((r) => r.text.toLowerCase().includes(q))) return true;
    return false;
  });
}

export function sortIncidents(incidents: Incident[], sort: IncidentSort): Incident[] {
  const copy = [...incidents];
  switch (sort) {
    case "first_detected":
      return copy.sort((a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime());
    case "report_count":
      return copy.sort((a, b) => b.reportCount - a.reportCount);
    case "recent":
    default:
      return copy.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
  }
}
