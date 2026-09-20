# IncidentPulse — Frontend

A real-time command-center dashboard that turns fragmented reports into a
continuously evolving picture of what's happening. Built as the frontend
for the IncidentPulse hackathon project.

> "From fragmented reports to a continuously updated picture of what is
> happening."

## 1. What it is

Many raw reports — "Smoke near Market Road", "Fire reported beside Market
Road", "Traffic stopped near Market Road" — actually describe the same
evolving real-world incident. This dashboard visualizes that grouping: it
shows live incidents on a map and in a list, lets an operator drill into
any one of them to see its current state, its timeline, and — most
importantly — **what changed recently and why**, with the evidence report
that triggered each change.

## 2. Features

- Dark command-center dashboard: sidebar navigation, KPI cards, live map, incident list, detail panel
- Interactive Leaflet map with category-colored, report-count-sized markers
- **"What Changed?"** — the key feature: a prominent, evidence-linked feed of significant state changes
- Chronological incident timeline
- Full evidence/report list per incident, with source, location, and match confidence when available
- Uncertain-match review panel (visual-only "Review" action — never fakes a backend merge)
- New-report submission form, wired to `POST /reports`
- Live polling (`GET /incidents` every 10s, configurable) with meaningful-change-only notifications
- **Demo Mode**: the entire dashboard works with zero backend, using realistic mock data
- **Demo Simulation**: an optional scripted sequence that evolves INC-1001 live during a presentation
- Defensive normalization layer: the UI never crashes on a missing/renamed backend field
- Automatic fallback to Demo Mode if the backend is unreachable, with automatic recovery back to Live Mode if it comes back

## 3. Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- Lucide React (icons)
- Leaflet + React Leaflet (map)
- Axios (HTTP)

No heavy dependencies, no ML libraries in the browser, no map API key required (uses CARTO's free dark basemap tiles).

## 4. Folder structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout/            Sidebar + Header + content shell
│   │   ├── Header/             Top bar: connection status, refresh, demo sim toggle
│   │   ├── Sidebar/            Nav, branding, connection dot
│   │   ├── KPICards/           Active/Reports/Updated/Uncertain/System-status cards
│   │   ├── IncidentMap/        Leaflet map with category markers
│   │   ├── IncidentList/       Search + filter + sort + card list
│   │   ├── IncidentCard/       One incident summary card
│   │   ├── IncidentDetails/    Selected-incident overview panel
│   │   ├── IncidentTimeline/   Vertical chronological timeline
│   │   ├── WhatChanged/        The evidence-linked change feed
│   │   ├── ReportList/         Raw report/evidence list
│   │   ├── SubmitReport/       New report form
│   │   ├── UncertainMatches/   Review panel for low-confidence matches
│   │   ├── Notifications/      Toast stack for meaningful updates
│   │   └── StatusIndicator/    Reusable colored-dot status badge
│   ├── pages/Dashboard/        Composes everything into the dashboard page
│   ├── api/                    client.ts (axios), incidents.ts (all backend calls)
│   ├── mock/                   mockData.ts (realistic incidents), mockStore.ts (fake backend + demo sim)
│   ├── hooks/useIncidents.ts   Central hook: polling, mode switching, notifications
│   ├── utils/                  normalize.ts (defensive parsing), incidentUtils.ts, dateUtils.ts, formatters.ts
│   ├── types/incident.ts       Normalized frontend types
│   ├── App.tsx, main.tsx, index.css, vite-env.d.ts
├── .env.example
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md (this file)
```

## 5. Installation

```bash
cd frontend
npm install
```

## 6. Running locally

```bash
npm run dev
```

Opens at `http://localhost:5173`. Works immediately with **no backend** —
it probes `GET /health` on startup, and if that fails, switches to Demo
Mode automatically.

## 7. Environment variables

Copy `.env.example` to `.env` and adjust if needed:

```bash
VITE_API_URL=http://127.0.0.1:8000
VITE_POLL_INTERVAL_MS=10000
```

- `VITE_API_URL` — base URL of the IncidentPulse backend. If unset, defaults to `http://127.0.0.1:8000`.
- `VITE_POLL_INTERVAL_MS` — how often the dashboard polls `GET /incidents`. Default: `10000` (10s).

## 8. Backend API configuration

The frontend expects:

```
GET  /health
POST /reports
GET  /incidents
GET  /incidents/{incident_id}
GET  /incidents/{incident_id}/timeline
POST /reset
```

All backend calls live in `src/api/incidents.ts` — nowhere else in the
app calls `fetch`/`axios` directly. Every response is passed through
`src/utils/normalize.ts` before it touches a component, so a renamed or
missing optional field (`confidence`, `severity`, `summary`, etc.)
degrades gracefully instead of crashing the UI.

## 9. Demo mode

If the backend is unreachable (or `VITE_API_URL` isn't set), the app
automatically switches to **DEMO MODE**, clearly labeled in the sidebar
and header. It's backed by four realistic, presentation-ready incidents
(fire, accident, flood, infrastructure), each with full reports,
timeline, and change history. Submitting a report in demo mode runs a
small keyword-matching heuristic against the mock incidents (mentioning
"Market Road" merges into the fire incident, for example) so the
submission flow feels real without needing a live matching engine.

Demo mode also does a lightweight `GET /health` check alongside every
poll — if a backend appears later, the dashboard switches back to Live
Mode automatically.

## 10. Demo simulation

Click **"Demo Simulation"** in the header (only shown in Demo Mode) to
kick off a scripted, ~7-second-interval sequence on INC-1001:

1. "Traffic stopped near Market Road" → **Traffic impact detected**
2. "Fire engines arriving at Market Road" → **Emergency response detected**
3. "Smoke spreading toward MG Road" → **Affected area expanded** (MG Road added)

Each step adds a real report, updates the incident's state, and appears
in **What Changed?**, the timeline, and a toast notification — this is
what makes the dashboard visibly "alive" during a presentation. The
script runs once and stops (it doesn't loop). It never touches a real
backend, even if one is configured — simulation only ever mutates the
local in-memory mock store.

## 11. Build command

```bash
npm run build     # tsc -b && vite build — outputs to dist/
npm run preview   # serve the production build locally
```

`npm run build` runs a full TypeScript project build before bundling, so
a type error anywhere in the app fails the build rather than shipping
silently.
