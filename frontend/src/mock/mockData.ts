// Demo-mode data. Authored in the SAME raw shape the real backend
// returns (snake_case fields, nested current_state, etc.) so it flows
// through the exact same normalizeIncident()/normalizeReport() functions
// as live API data -- this is what proves the normalization layer
// actually works, rather than having a separate "already nice" mock
// shape that quietly diverges from reality.

const MARKET_ROAD = { lat: 15.4903, lng: 73.8301 };
const AIRPORT_ROAD = { lat: 15.3808, lng: 73.8314 };
const RIVER_ROAD = { lat: 15.5042, lng: 73.8558 };
const RAILWAY_STATION = { lat: 15.4989, lng: 73.8083 };

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

// -----------------------------------------------------------------------
// INC-1001 — Fire, Market Road (the "hero" incident used by demo simulation)
// -----------------------------------------------------------------------
function buildFireIncident() {
  return {
    incident_id: "INC-1001",
    event_type: "fire",
    location: MARKET_ROAD,
    first_seen: iso(38),
    last_updated: iso(20),
    status: "active",
    confidence: 0.91,
    report_count: 8,
    summary: "Fire near Market Road with confirmed traffic disruption and emergency response on scene.",
    current_state: {
      traffic_blocked: true,
      emergency_response: true,
      affected_roads: ["Market Road"],
      affected_area_km: 0.8,
      severity: "high",
    },
    reports: [
      "R001", "R002", "R003", "R004", "R005", "R006", "R007", "R008",
    ],
    reports_full: [
      { report_id: "R001", text: "Smoke near Market Road", timestamp: iso(38), source: "citizen_report", location: MARKET_ROAD, confidence: 1.0 },
      { report_id: "R002", text: "Fire reported beside Market Road", timestamp: iso(35), source: "citizen_report", location: MARKET_ROAD, confidence: 0.88 },
      { report_id: "R003", text: "Flames visible near the market entrance", timestamp: iso(31), source: "social_media", location: MARKET_ROAD, confidence: 0.82 },
      { report_id: "R004", text: "Traffic has stopped near Market Road", timestamp: iso(28), source: "citizen_report", location: MARKET_ROAD, confidence: 0.79 },
      { report_id: "R005", text: "Road completely blocked, long queue forming", timestamp: iso(25), source: "citizen_report", location: MARKET_ROAD, confidence: 0.77 },
      { report_id: "R006", text: "Fire engines arrived at the location", timestamp: iso(20), source: "official", location: MARKET_ROAD, confidence: 0.9 },
      { report_id: "R007", text: "Firefighters actively working to control the blaze", timestamp: iso(18), source: "official", location: MARKET_ROAD, confidence: 0.86 },
      { report_id: "R008", text: "Smoke spreading toward MG Road, visibility dropping", timestamp: iso(12), source: "citizen_report", location: MARKET_ROAD, confidence: 0.74 },
    ],
    timeline: [
      { timestamp: iso(38), event_type: "incident_created", description: "Incident created.", report_id: "R001", evidence: null },
      { timestamp: iso(35), event_type: "report_merged", description: "Report merged into incident.", report_id: "R002", evidence: null },
      { timestamp: iso(31), event_type: "report_merged", description: "Report merged into incident.", report_id: "R003", evidence: null },
      { timestamp: iso(28), event_type: "traffic_impact", description: "Traffic impact detected.", report_id: "R004", evidence: "R004" },
      { timestamp: iso(25), event_type: "report_merged", description: "Report merged into incident.", report_id: "R005", evidence: null },
      { timestamp: iso(20), event_type: "emergency_response", description: "Emergency response detected.", report_id: "R006", evidence: "R006" },
      { timestamp: iso(18), event_type: "report_merged", description: "Report merged into incident.", report_id: "R007", evidence: null },
      { timestamp: iso(12), event_type: "affected_roads", description: "Reported impact expanded from 1 to 2 affected road(s) (Market Road, MG Road).", report_id: "R008", evidence: "R008" },
    ],
    change_history: [
      { type: "traffic_impact", before: false, after: true, description: "Traffic impact detected.", significant: true, evidence_report_id: "R004", detected_at: iso(28) },
      { type: "emergency_response", before: false, after: true, description: "Emergency response detected.", significant: true, evidence_report_id: "R006", detected_at: iso(20) },
      { type: "affected_roads", before: 1, after: 2, description: "Reported impact expanded from 1 to 2 affected road(s) (Market Road, MG Road).", significant: true, evidence_report_id: "R008", detected_at: iso(12) },
      { type: "report_count", before: 6, after: 8, description: "Report count increased from 6 to 8.", significant: false, evidence_report_id: "R008", detected_at: iso(12) },
    ],
  };
}

// -----------------------------------------------------------------------
// INC-1002 — Road accident, Airport Road
// -----------------------------------------------------------------------
function buildAccidentIncident() {
  return {
    incident_id: "INC-1002",
    event_type: "accident",
    location: AIRPORT_ROAD,
    first_seen: iso(52),
    last_updated: iso(30),
    status: "active",
    confidence: 0.83,
    report_count: 4,
    summary: "Two-vehicle collision on Airport Road; traffic backed up, ambulance dispatched.",
    current_state: {
      traffic_blocked: true,
      emergency_response: true,
      affected_roads: ["Airport Road"],
      affected_area_km: 0.4,
      severity: "medium",
    },
    reports: ["R101", "R102", "R103", "R104"],
    reports_full: [
      { report_id: "R101", text: "Collision reported near Airport Road junction", timestamp: iso(52), source: "citizen_report", location: AIRPORT_ROAD, confidence: 1.0 },
      { report_id: "R102", text: "Two vehicles collided on Airport Road, traffic building up", timestamp: iso(46), source: "citizen_report", location: AIRPORT_ROAD, confidence: 0.85 },
      { report_id: "R103", text: "Traffic completely blocked near Airport Road", timestamp: iso(38), source: "citizen_report", location: AIRPORT_ROAD, confidence: 0.81 },
      { report_id: "R104", text: "Ambulance arriving at Airport Road", timestamp: iso(30), source: "official", location: AIRPORT_ROAD, confidence: 0.88 },
    ],
    timeline: [
      { timestamp: iso(52), event_type: "incident_created", description: "Incident created.", report_id: "R101", evidence: null },
      { timestamp: iso(46), event_type: "report_merged", description: "Report merged into incident.", report_id: "R102", evidence: null },
      { timestamp: iso(38), event_type: "traffic_impact", description: "Traffic impact detected.", report_id: "R103", evidence: "R103" },
      { timestamp: iso(30), event_type: "emergency_response", description: "Emergency response detected.", report_id: "R104", evidence: "R104" },
    ],
    change_history: [
      { type: "traffic_impact", before: false, after: true, description: "Traffic impact detected.", significant: true, evidence_report_id: "R103", detected_at: iso(38) },
      { type: "emergency_response", before: false, after: true, description: "Emergency response detected.", significant: true, evidence_report_id: "R104", detected_at: iso(30) },
    ],
  };
}

// -----------------------------------------------------------------------
// INC-1003 — Flooding, River Road
// -----------------------------------------------------------------------
function buildFloodIncident() {
  return {
    incident_id: "INC-1003",
    event_type: "flood",
    location: RIVER_ROAD,
    first_seen: iso(95),
    last_updated: iso(40),
    status: "active",
    confidence: 0.78,
    report_count: 6,
    summary: "Rising water levels near River Road following heavy rainfall; several low-lying stretches affected.",
    current_state: {
      traffic_blocked: true,
      emergency_response: false,
      affected_roads: ["River Road", "Old Bridge Road"],
      affected_area_km: 1.2,
      severity: "medium",
    },
    reports: ["R201", "R202", "R203", "R204", "R205", "R206"],
    reports_full: [
      { report_id: "R201", text: "Waterlogging seen on River Road after heavy rain", timestamp: iso(95), source: "citizen_report", location: RIVER_ROAD, confidence: 1.0 },
      { report_id: "R202", text: "Water level rising near River Road bridge", timestamp: iso(84), source: "citizen_report", location: RIVER_ROAD, confidence: 0.8 },
      { report_id: "R203", text: "Flooded street around River Road, cars avoiding the stretch", timestamp: iso(70), source: "social_media", location: RIVER_ROAD, confidence: 0.76 },
      { report_id: "R204", text: "Traffic completely blocked near River Road due to flooding", timestamp: iso(58), source: "citizen_report", location: RIVER_ROAD, confidence: 0.82 },
      { report_id: "R205", text: "Old Bridge Road also waterlogged now", timestamp: iso(48), source: "citizen_report", location: RIVER_ROAD, confidence: 0.7 },
      { report_id: "R206", text: "Water receding slightly near River Road", timestamp: iso(40), source: "citizen_report", location: RIVER_ROAD, confidence: 0.68 },
    ],
    timeline: [
      { timestamp: iso(95), event_type: "incident_created", description: "Incident created.", report_id: "R201", evidence: null },
      { timestamp: iso(84), event_type: "report_merged", description: "Report merged into incident.", report_id: "R202", evidence: null },
      { timestamp: iso(70), event_type: "report_merged", description: "Report merged into incident.", report_id: "R203", evidence: null },
      { timestamp: iso(58), event_type: "traffic_impact", description: "Traffic impact detected.", report_id: "R204", evidence: "R204" },
      { timestamp: iso(48), event_type: "affected_roads", description: "Reported impact expanded from 1 to 2 affected road(s) (River Road, Old Bridge Road).", report_id: "R205", evidence: "R205" },
      { timestamp: iso(40), event_type: "report_merged", description: "Report merged into incident.", report_id: "R206", evidence: null },
    ],
    change_history: [
      { type: "traffic_impact", before: false, after: true, description: "Traffic impact detected.", significant: true, evidence_report_id: "R204", detected_at: iso(58) },
      { type: "affected_roads", before: 1, after: 2, description: "Reported impact expanded from 1 to 2 affected road(s) (River Road, Old Bridge Road).", significant: true, evidence_report_id: "R205", detected_at: iso(48) },
    ],
  };
}

// -----------------------------------------------------------------------
// INC-1004 — Infrastructure, Railway Station
// -----------------------------------------------------------------------
function buildInfrastructureIncident() {
  return {
    incident_id: "INC-1004",
    event_type: "power_outage",
    location: RAILWAY_STATION,
    first_seen: iso(64),
    last_updated: iso(55),
    status: "active",
    confidence: 0.69,
    report_count: 3,
    summary: "Power outage reported near Railway Station affecting nearby signal and platform lighting.",
    current_state: {
      traffic_blocked: false,
      emergency_response: false,
      affected_roads: ["Railway Station"],
      affected_area_km: 0.3,
      severity: "low",
    },
    reports: ["R301", "R302", "R303"],
    reports_full: [
      { report_id: "R301", text: "Power outage reported near Railway Station", timestamp: iso(64), source: "citizen_report", location: RAILWAY_STATION, confidence: 1.0 },
      { report_id: "R302", text: "Platform lighting down at Railway Station", timestamp: iso(60), source: "citizen_report", location: RAILWAY_STATION, confidence: 0.72 },
      { report_id: "R303", text: "No electricity for over an hour near Railway Station", timestamp: iso(55), source: "citizen_report", location: RAILWAY_STATION, confidence: 0.69 },
    ],
    timeline: [
      { timestamp: iso(64), event_type: "incident_created", description: "Incident created.", report_id: "R301", evidence: null },
      { timestamp: iso(60), event_type: "report_merged", description: "Report merged into incident.", report_id: "R302", evidence: null },
      { timestamp: iso(55), event_type: "report_merged", description: "Report merged into incident.", report_id: "R303", evidence: null },
    ],
    change_history: [],
  };
}

export function getMockIncidentsRaw() {
  return [
    buildFireIncident(),
    buildAccidentIncident(),
    buildFloodIncident(),
    buildInfrastructureIncident(),
  ];
}

export function getMockUncertainMatchesRaw() {
  return [
    {
      report_id: "R019",
      text: "Smoke seen near central market",
      candidate_incident_id: "INC-1001",
      confidence: 0.58,
      timestamp: iso(9),
    },
    {
      report_id: "R220",
      text: "Water on the road somewhere near the old bridge",
      candidate_incident_id: "INC-1003",
      confidence: 0.51,
      timestamp: iso(6),
    },
  ];
}

// -----------------------------------------------------------------------
// Demo simulation script -- scripted additions applied to INC-1001 while
// "Demo Simulation" is enabled, matching the story arc in the spec:
// traffic disruption -> emergency response -> affected area expansion.
// The mock store (see mock/mockStore.ts) applies these one at a time.
// -----------------------------------------------------------------------
export interface SimulationStateDelta {
  trafficBlocked: boolean;
  emergencyResponse: boolean;
  affectedRoads: string[];
}

export interface SimulationStep {
  reportText: string;
  source: string;
  changeType: "traffic_impact" | "emergency_response" | "affected_roads";
  changeDescription: string;
  significant: boolean;
  apply: (state: SimulationStateDelta) => void;
}

export const SIMULATION_SCRIPT: SimulationStep[] = [
  {
    reportText: "Traffic stopped near Market Road",
    source: "citizen_report",
    changeType: "traffic_impact",
    changeDescription: "Traffic impact detected.",
    significant: true,
    apply: (s) => {
      s.trafficBlocked = true;
    },
  },
  {
    reportText: "Fire engines arriving at Market Road",
    source: "official",
    changeType: "emergency_response",
    changeDescription: "Emergency response detected.",
    significant: true,
    apply: (s) => {
      s.emergencyResponse = true;
    },
  },
  {
    reportText: "Smoke spreading toward MG Road",
    source: "citizen_report",
    changeType: "affected_roads",
    changeDescription: "Reported impact expanded from 1 to 2 affected road(s) (Market Road, MG Road).",
    significant: true,
    apply: (s) => {
      if (!s.affectedRoads.includes("MG Road")) s.affectedRoads.push("MG Road");
    },
  },
];
