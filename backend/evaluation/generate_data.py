"""
Synthetic data generator for evaluation.

Generates a realistic set of reports across many ground-truth incidents,
including deliberately difficult cases:

- different incidents close together in time
- different incidents geographically separated
- similar wording but different locations
- same incident with changing state (paraphrases + escalation reports)
- reports outside the time window (should NOT merge with the seed incident)

`ground_truth_incident_id` is attached to every report for scoring in
evaluate.py only -- it must never be read by the production matching
code (incident_engine.py / matching.py never reference this field).

Run:
    python backend/evaluation/generate_data.py
Writes:
    backend/evaluation/synthetic_reports.json
"""

from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import config  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parent / "synthetic_reports.json"

random.seed(42)

# ---------------------------------------------------------------------------
# Event templates: each entry defines paraphrase templates for the
# "seed" description and for escalation reports of the same real event.
# ---------------------------------------------------------------------------
EVENT_TEMPLATES = {
    "fire": {
        "seed": [
            "Smoke near {road}",
            "Smoke seen beside {road}",
            "Fire reported around {road}",
            "Flames visible close to {road}",
            "Fire reported beside {road}",
        ],
        "escalation": [
            "Traffic completely blocked near {road}",
            "Fire engines arriving near {road}",
            "Firefighters on scene at {road}",
            "Road closed due to fire near {road}",
        ],
    },
    "accident": {
        "seed": [
            "Accident reported on {road}",
            "Collision near {road}",
            "Two vehicles collided on {road}",
            "Crash reported near {road}",
        ],
        "escalation": [
            "Traffic completely blocked near {road}",
            "Ambulance arriving at {road}",
            "Police on scene at {road}",
        ],
    },
    "flood": {
        "seed": [
            "Flooding reported near {road}",
            "Waterlogging seen on {road}",
            "Water logging near {road}",
            "Flooded street around {road}",
        ],
        "escalation": [
            "Traffic completely blocked near {road} due to flooding",
            "Road closed near {road} because of waterlogging",
        ],
    },
    "fallen_tree": {
        "seed": [
            "Tree fallen near {road}",
            "Fallen tree blocking {road}",
            "Tree down near {road}",
            "Uprooted tree seen on {road}",
        ],
        "escalation": [
            "Traffic completely blocked near {road} due to fallen tree",
            "Rescue team arriving at {road} to clear tree",
        ],
    },
    "power_outage": {
        "seed": [
            "Power outage reported near {road}",
            "Power cut near {road}",
            "Blackout reported around {road}",
        ],
        "escalation": [
            "No electricity for several hours near {road}",
        ],
    },
}

ROAD_NAMES = [
    "Market Road", "Railway Station", "Church Street", "MG Road",
    "Station Road", "Hill View Colony", "Lake Side Avenue", "Old Bridge Road",
    "Riverside Drive", "Central Park Lane", "North Gate Junction",
    "College Road", "Harbor Street", "Sunset Boulevard", "Pine Grove Road",
    "Industrial Estate Road", "East End Circle", "West Point Avenue",
]

# Bounding box roughly covering a mid-size city, used to place clusters far
# enough apart for the "geographically separated" difficult case.
CITY_CENTERS = [
    (15.490, 73.830),
    (15.560, 73.910),
    (15.410, 73.760),
    (15.620, 73.780),
    (15.470, 73.960),
]


def _jitter_location(base_lat: float, base_lng: float, max_km: float = 0.3) -> tuple[float, float]:
    """Small random offset, capped so points usually stay well inside the
    matching radius for the same incident."""
    # ~0.009 degrees latitude ~= 1 km
    d_lat = random.uniform(-max_km, max_km) * 0.009
    d_lng = random.uniform(-max_km, max_km) * 0.009
    return round(base_lat + d_lat, 6), round(base_lng + d_lng, 6)


def generate(num_incidents: int = 35, source: str = "citizen_report") -> list[dict]:
    reports: list[dict] = []
    report_counter = 1
    incident_counter = 1

    event_types = list(EVENT_TEMPLATES.keys())
    base_time = datetime(2026, 9, 18, 6, 0, 0, tzinfo=timezone.utc)

    def next_report_id() -> str:
        nonlocal report_counter
        rid = f"SYN{report_counter:04d}"
        report_counter += 1
        return rid

    for _ in range(num_incidents):
        gt_id = f"INC-GT-{incident_counter:04d}"
        incident_counter += 1

        event_type = random.choice(event_types)
        templates = EVENT_TEMPLATES[event_type]
        road = random.choice(ROAD_NAMES)
        center_lat, center_lng = random.choice(CITY_CENTERS)
        incident_start = base_time + timedelta(minutes=random.randint(0, 6000))

        # How many paraphrase reports for this same real event (2-6).
        n_seed_reports = random.randint(2, 4)
        n_escalation_reports = random.randint(0, len(templates["escalation"]))

        used_seed_templates = random.sample(
            templates["seed"], k=min(n_seed_reports, len(templates["seed"]))
        )
        used_escalation_templates = random.sample(
            templates["escalation"], k=n_escalation_reports
        )

        t = incident_start
        for tmpl in used_seed_templates:
            lat, lng = _jitter_location(center_lat, center_lng)
            reports.append(
                {
                    "report_id": next_report_id(),
                    "text": tmpl.format(road=road),
                    "timestamp": t.isoformat(),
                    "location": {"lat": lat, "lng": lng},
                    "source": source,
                    "ground_truth_incident_id": gt_id,
                }
            )
            t += timedelta(minutes=random.randint(2, 8))

        # "same incident with changing state": escalation reports, still
        # within the merge time window of the most recent report.
        for tmpl in used_escalation_templates:
            lat, lng = _jitter_location(center_lat, center_lng)
            reports.append(
                {
                    "report_id": next_report_id(),
                    "text": tmpl.format(road=road),
                    "timestamp": t.isoformat(),
                    "location": {"lat": lat, "lng": lng},
                    "source": source,
                    "ground_truth_incident_id": gt_id,
                }
            )
            t += timedelta(minutes=random.randint(3, 10))

        # Difficult case: a report describing the SAME real event but
        # arriving well outside the time window relative to the earlier
        # reports -- this is intentionally a separate ground-truth
        # "incident" in our labeling sense (a late/unrelated follow-up),
        # so it should legitimately create a new predicted incident too.
        if random.random() < 0.25:
            late_time = t + timedelta(minutes=config.TIME_WINDOW_MINUTES + random.randint(15, 60))
            lat, lng = _jitter_location(center_lat, center_lng)
            late_gt_id = f"INC-GT-{incident_counter:04d}"
            incident_counter += 1
            reports.append(
                {
                    "report_id": next_report_id(),
                    "text": random.choice(templates["seed"]).format(road=road),
                    "timestamp": late_time.isoformat(),
                    "location": {"lat": lat, "lng": lng},
                    "source": source,
                    "ground_truth_incident_id": late_gt_id,
                }
            )

        # Difficult case: a DIFFERENT, unrelated incident close in time but
        # a different event type at roughly the same location.
        if random.random() < 0.3:
            other_type = random.choice([e for e in event_types if e != event_type])
            other_templates = EVENT_TEMPLATES[other_type]
            other_gt_id = f"INC-GT-{incident_counter:04d}"
            incident_counter += 1
            close_time = incident_start + timedelta(minutes=random.randint(1, 10))
            lat, lng = _jitter_location(center_lat, center_lng, max_km=0.8)
            reports.append(
                {
                    "report_id": next_report_id(),
                    "text": random.choice(other_templates["seed"]).format(
                        road=random.choice(ROAD_NAMES)
                    ),
                    "timestamp": close_time.isoformat(),
                    "location": {"lat": lat, "lng": lng},
                    "source": source,
                    "ground_truth_incident_id": other_gt_id,
                }
            )

        # Difficult case: similar wording but a genuinely different,
        # distant location (should NOT merge).
        if random.random() < 0.25:
            far_center = random.choice(
                [c for c in CITY_CENTERS if c != (center_lat, center_lng)]
            )
            far_gt_id = f"INC-GT-{incident_counter:04d}"
            incident_counter += 1
            lat, lng = _jitter_location(far_center[0], far_center[1])
            reports.append(
                {
                    "report_id": next_report_id(),
                    "text": random.choice(templates["seed"]).format(road=road),
                    "timestamp": (incident_start + timedelta(minutes=random.randint(1, 15))).isoformat(),
                    "location": {"lat": lat, "lng": lng},
                    "source": source,
                    "ground_truth_incident_id": far_gt_id,
                }
            )

    reports.sort(key=lambda r: r["timestamp"])
    return reports


def main() -> None:
    reports = generate(num_incidents=35)
    OUTPUT_PATH.write_text(json.dumps(reports, indent=2), encoding="utf-8")
    gt_ids = {r["ground_truth_incident_id"] for r in reports}
    print(f"Generated {len(reports)} reports across {len(gt_ids)} ground-truth incidents.")
    print(f"Wrote: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
