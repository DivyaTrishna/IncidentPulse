import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin } from "lucide-react";
import type { Incident } from "../../types/incident";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "../../utils/incidentUtils";
import { formatTime } from "../../utils/dateUtils";

interface IncidentMapProps {
  incidents: Incident[];
  selectedIncidentId: string | null;
  onSelect: (incidentId: string) => void;
}

const DEFAULT_CENTER: [number, number] = [15.49, 73.83];

function buildDivIcon(incident: Incident, isSelected: boolean): L.DivIcon {
  const color = CATEGORY_COLOR[incident.eventType].dot;
  const size = isSelected ? 34 : 26;
  const ring = isSelected ? `box-shadow:0 0 0 4px ${color}33;` : "";
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      background:${color};display:flex;align-items:center;justify-content:center;
      border:2px solid rgba(255,255,255,0.85);${ring}
      font:600 ${isSelected ? 11 : 10}px sans-serif;color:#0a0e14;
    ">${incident.reportCount}</div>
  `;
  return L.divIcon({
    html,
    className: "ip-map-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Recenters/fits the map whenever the incident set with coordinates
 * changes, without forcing a full remount of MapContainer. This is a
 * genuine side effect (imperatively calling the Leaflet map instance), so
 * it belongs in useEffect -- useMemo's memoized value can be discarded
 * and recomputed by React at any time and is not a substitute for an
 * effect with real-world side effects. */
function FitToIncidents({ points }: { points: [number, number][] }) {
  const map = useMap();
  // Points are plain numbers recreated every render, so depending on the
  // array reference would re-run every render; depending on its
  // stringified content instead only re-runs when coordinates actually
  // change.
  const pointsKey = points.map((p) => p.join(",")).join("|");

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, map]);

  return null;
}

export function IncidentMap({ incidents, selectedIncidentId, onSelect }: IncidentMapProps) {
  const located = incidents.filter((i) => i.location !== null);
  const points = located.map((i) => [i.location!.lat, i.location!.lng] as [number, number]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-ip-border">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", background: "#0d1420" }}
      >
        <TileLayer
          // CARTO's dark basemap fits the command-center aesthetic far
          // better than the default OSM tiles, with the same free/no-key
          // usage terms as standard OSM.
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToIncidents points={points} />
        {located.map((incident) => (
          <Marker
            key={incident.incidentId}
            position={[incident.location!.lat, incident.location!.lng]}
            icon={buildDivIcon(incident, incident.incidentId === selectedIncidentId)}
            eventHandlers={{ click: () => onSelect(incident.incidentId) }}
          >
            <Popup>
              <div className="min-w-[160px] font-sans">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ip-text">{incident.incidentId}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ color: CATEGORY_COLOR[incident.eventType].dot }}
                  >
                    {CATEGORY_LABEL[incident.eventType]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ip-muted">
                  {incident.state.affectedRoads[0] ?? "Location unnamed"}
                </p>
                <p className="mt-1 text-xs text-ip-muted">
                  {incident.reportCount} report{incident.reportCount === 1 ? "" : "s"} · updated{" "}
                  {formatTime(incident.lastUpdated)}
                </p>
                <button
                  type="button"
                  onClick={() => onSelect(incident.incidentId)}
                  className="mt-2 w-full rounded bg-ip-accent/90 px-2 py-1 text-xs font-medium text-black hover:bg-ip-accent"
                >
                  View details
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {located.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ip-bg/60">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-ip-border bg-ip-panel px-6 py-5 text-center">
            <MapPin size={20} className="text-ip-muted" />
            <p className="text-sm font-medium text-ip-text">No located incidents</p>
            <p className="max-w-[220px] text-xs text-ip-muted">
              Incidents without coordinates can&apos;t be plotted yet. Check the incident list instead.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
