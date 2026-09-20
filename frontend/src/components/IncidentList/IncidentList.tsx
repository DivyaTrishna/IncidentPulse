import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Incident } from "../../types/incident";
import { IncidentCard } from "../IncidentCard/IncidentCard";
import {
  filterIncidents,
  searchIncidents,
  sortIncidents,
  type IncidentFilter,
  type IncidentSort,
} from "../../utils/incidentUtils";

interface IncidentListProps {
  incidents: Incident[];
  uncertainIncidentIds: Set<string>;
  selectedIncidentId: string | null;
  onSelect: (incidentId: string) => void;
}

const FILTERS: { key: IncidentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "updated", label: "Updated" },
  { key: "uncertain", label: "Uncertain" },
  { key: "resolved", label: "Resolved" },
];

const SORTS: { key: IncidentSort; label: string }[] = [
  { key: "recent", label: "Recently updated" },
  { key: "first_detected", label: "First detected" },
  { key: "report_count", label: "Report count" },
];

export function IncidentList({ incidents, uncertainIncidentIds, selectedIncidentId, onSelect }: IncidentListProps) {
  const [filter, setFilter] = useState<IncidentFilter>("all");
  const [sort, setSort] = useState<IncidentSort>("recent");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const filtered = filterIncidents(incidents, filter, uncertainIncidentIds);
    const searched = searchIncidents(filtered, query);
    return sortIncidents(searched, sort);
  }, [incidents, filter, uncertainIncidentIds, query, sort]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ip-border p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ip-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, type, road, or report text…"
            aria-label="Search incidents"
            className="w-full rounded-md border border-ip-border bg-ip-bg py-1.5 pl-8 pr-2.5 text-xs text-ip-text placeholder:text-ip-muted focus:border-ip-accent focus:outline-none"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === f.key
                  ? "bg-ip-accent text-black"
                  : "bg-ip-panel2 text-ip-muted hover:text-ip-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ip-muted">
          <label htmlFor="incident-sort">Sort:</label>
          <select
            id="incident-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as IncidentSort)}
            className="rounded border border-ip-border bg-ip-bg px-1.5 py-1 text-[11px] text-ip-text focus:border-ip-accent focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm font-medium text-ip-text">No incidents match</p>
            <p className="text-xs text-ip-muted">Try a different filter or search term.</p>
          </div>
        ) : (
          visible.map((incident) => (
            <IncidentCard
              key={incident.incidentId}
              incident={incident}
              selected={incident.incidentId === selectedIncidentId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
