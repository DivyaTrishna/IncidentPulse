"""
IncidentPulse entry point.

Designed to be run as:

    python backend/main.py

from the repository root (it also works as `python main.py` from inside
backend/, since we add this file's directory to sys.path before any local
imports run).

Running it does two things:
1. Runs a real end-to-end demo through the actual incident engine
   (section 32 of the spec) and prints the results.
2. Starts the FastAPI server with uvicorn.

Use --demo-only to skip starting the server (handy for quick checks / CI).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make sure local modules (config, models, api, ...) import correctly
# regardless of the current working directory the script was launched from.
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from datetime import datetime, timedelta, timezone  # noqa: E402

import config  # noqa: E402
import incident_engine  # noqa: E402
from database import get_storage, reset_storage_singleton  # noqa: E402
from models import Location, Report  # noqa: E402


def run_demo(verbose: bool = True) -> list:
    """
    Runs the exact demo sequence from the spec against the real engine
    (no faked results) and returns the list of ReportProcessResult.
    """
    reset_storage_singleton()
    storage = get_storage()
    storage.reset()

    base_time = datetime(2026, 9, 18, 10, 0, 0, tzinfo=timezone.utc)
    market_road = Location(lat=15.490, lng=73.830)
    railway_station = Location(lat=15.510, lng=73.855)  # >1km away -> separate incident

    demo_reports = [
        ("Smoke near Market Road", base_time + timedelta(minutes=2)),
        ("Fire reported beside Market Road", base_time + timedelta(minutes=5)),
        ("Traffic completely blocked near Market Road", base_time + timedelta(minutes=11)),
        ("Fire engines arriving near Market Road", base_time + timedelta(minutes=18)),
        ("Tree fallen near Railway Station", base_time + timedelta(minutes=25)),
    ]

    results = []
    existing_ids: set[str] = set()

    if verbose:
        print("=" * 70)
        print("INCIDENTPULSE DEMO — processing 5 reports through the real engine")
        print("=" * 70)

    for idx, (text, ts) in enumerate(demo_reports, start=1):
        location = railway_station if "Railway" in text else market_road
        report_id = incident_engine.generate_report_id(existing_ids)
        existing_ids.add(report_id)

        report = Report(
            report_id=report_id,
            text=text,
            timestamp=ts,
            location=location,
            source="citizen_report",
        )
        storage.add_report(report)
        result = incident_engine.process_report(storage, report)
        results.append(result)

        if verbose:
            print(f"\n[{idx}] {ts.strftime('%H:%M')} — \"{text}\"")
            print(f"    report_id : {report.report_id}")
            print(f"    action    : {result.action.value}")
            print(f"    incident  : {result.incident_id or result.candidate_incident_id}")
            print(f"    confidence: {result.confidence:.3f}")
            if result.changes:
                for c in result.changes:
                    flag = "SIGNIFICANT" if c.significant else "minor"
                    print(f"    change    : [{flag}] {c.description}")

    if verbose:
        print("\n" + "=" * 70)
        print("FINAL INCIDENTS")
        print("=" * 70)
        for incident in storage.get_all_incidents():
            print(f"\n{incident.incident_id} ({incident.event_type})")
            print(f"  reports: {incident.reports}")
            print(f"  state  : {incident.current_state.model_dump()}")
            print("  timeline:")
            for event in incident.timeline:
                print(f"    {event.timestamp.strftime('%H:%M')} -> {event.description}")

    return results


def main() -> None:
    """
    Startup behavior:

        python backend/main.py             -> starts the API normally,
                                               using whatever is already
                                               in data/reports.json /
                                               data/incidents.json (does
                                               NOT reset or insert demo
                                               data)
        python backend/main.py --demo      -> resets storage, runs the
                                               scripted 5-report demo
                                               (section 32), then starts
                                               the API
        python backend/main.py --demo-only -> runs the demo and exits
                                               without starting the API
                                               (useful for quick checks)
    """
    demo_only = "--demo-only" in sys.argv
    run_demo_flag = demo_only or "--demo" in sys.argv

    if run_demo_flag:
        run_demo(verbose=True)
    else:
        storage = get_storage()
        existing = storage.get_all_incidents()
        print(f"Starting with existing local data: {len(existing)} incident(s) on file.")
        print("(Run with --demo to reset storage and load the scripted demo instead.)")

    if demo_only:
        return

    import uvicorn

    print("\n" + "=" * 70)
    print(f"Starting FastAPI server (storage_backend={config.STORAGE_BACKEND}, "
          f"use_bedrock={config.USE_BEDROCK})")
    print("Docs: http://127.0.0.1:8000/docs")
    print("=" * 70 + "\n")

    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False, app_dir=str(_BACKEND_DIR))


if __name__ == "__main__":
    main()
