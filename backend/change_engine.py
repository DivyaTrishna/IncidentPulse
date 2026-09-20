"""
The "What Changed?" engine.

Input: previous incident state (a plain dict snapshot), the new
IncidentState, and the report/evidence that caused the update.

Output: a list of ChangeRecord, each flagged significant or not, with a
human-readable description and, where applicable, the report ID that is
evidence for the change. Descriptions are generated purely from verified
structured facts -- nothing here is invented.
"""

from __future__ import annotations

from datetime import datetime

import config
from models import ChangeRecord, IncidentState


def _road_list_display(roads: list[str]) -> str:
    return ", ".join(roads) if roads else "none"


def detect_changes(
    previous_state: dict,
    new_state: IncidentState,
    previous_report_count: int,
    new_report_count: int,
    evidence_report_id: str | None,
    now: datetime,
) -> list[ChangeRecord]:
    """
    Compare previous_state (dict snapshot of the old IncidentState) against
    new_state, and return structured ChangeRecords for every detected
    difference. Significance is decided per-change using the rules in
    section 22 of the spec / config thresholds.
    """
    changes: list[ChangeRecord] = []

    # --- traffic_blocked --------------------------------------------------
    prev_traffic = bool(previous_state.get("traffic_blocked", False))
    if prev_traffic != new_state.traffic_blocked:
        significant = (not prev_traffic) and new_state.traffic_blocked
        changes.append(
            ChangeRecord(
                type="traffic_impact",
                before=prev_traffic,
                after=new_state.traffic_blocked,
                description=(
                    "Traffic impact detected."
                    if new_state.traffic_blocked
                    else "Traffic impact cleared."
                ),
                significant=significant,
                evidence_report_id=evidence_report_id,
                detected_at=now,
            )
        )

    # --- emergency_response ------------------------------------------------
    prev_response = bool(previous_state.get("emergency_response", False))
    if prev_response != new_state.emergency_response:
        significant = (not prev_response) and new_state.emergency_response
        changes.append(
            ChangeRecord(
                type="emergency_response",
                before=prev_response,
                after=new_state.emergency_response,
                description=(
                    "Emergency response detected."
                    if new_state.emergency_response
                    else "No further emergency response activity reported."
                ),
                significant=significant,
                evidence_report_id=evidence_report_id,
                detected_at=now,
            )
        )

    # --- affected_roads ------------------------------------------------
    prev_roads = list(previous_state.get("affected_roads", []) or [])
    new_roads = list(new_state.affected_roads)
    if set(prev_roads) != set(new_roads):
        delta = len(new_roads) - len(prev_roads)
        significant = delta >= config.SIGNIFICANT_ROAD_INCREASE and len(new_roads) > len(prev_roads)
        changes.append(
            ChangeRecord(
                type="affected_roads",
                before=len(prev_roads),
                after=len(new_roads),
                description=(
                    f"Reported impact expanded from {len(prev_roads)} to "
                    f"{len(new_roads)} affected road(s) "
                    f"({_road_list_display(new_roads)})."
                    if len(new_roads) > len(prev_roads)
                    else f"Affected roads updated: {len(prev_roads)} -> {len(new_roads)}."
                ),
                significant=significant,
                evidence_report_id=evidence_report_id,
                detected_at=now,
            )
        )

    # --- affected_area_km ------------------------------------------------
    prev_area = float(previous_state.get("affected_area_km", 0.0) or 0.0)
    new_area = float(new_state.affected_area_km)
    if abs(prev_area - new_area) > 1e-9:
        abs_increase = new_area - prev_area
        ratio = (new_area / prev_area) if prev_area > 0 else (float("inf") if new_area > 0 else 1.0)
        significant = abs_increase > 0 and (
            abs_increase >= config.SIGNIFICANT_AREA_INCREASE_KM
            or ratio >= config.SIGNIFICANT_AREA_INCREASE_RATIO
        )
        changes.append(
            ChangeRecord(
                type="affected_area",
                before=round(prev_area, 3),
                after=round(new_area, 3),
                description=f"Affected area changed from {prev_area:.2f} km to {new_area:.2f} km.",
                significant=significant,
                evidence_report_id=evidence_report_id,
                detected_at=now,
            )
        )

    # --- status ------------------------------------------------
    prev_status = str(previous_state.get("status", "active"))
    new_status = new_state.status.value if hasattr(new_state.status, "value") else str(new_state.status)
    if prev_status != new_status:
        changes.append(
            ChangeRecord(
                type="status",
                before=prev_status,
                after=new_status,
                description=f"Incident status changed from {prev_status} to {new_status}.",
                significant=True,
                evidence_report_id=evidence_report_id,
                detected_at=now,
            )
        )

    # --- event_type (classification change) ------------------------------------------------
    prev_event_type = previous_state.get("event_type")
    if prev_event_type != new_state.event_type and new_state.event_type is not None:
        # Only meaningful if we're refining from "unknown" or genuinely
        # reclassifying, not just repeating the same value.
        if prev_event_type is None:
            changes.append(
                ChangeRecord(
                    type="event_classification",
                    before=prev_event_type,
                    after=new_state.event_type,
                    description=f"Event classified as {new_state.event_type}.",
                    significant=False,
                    evidence_report_id=evidence_report_id,
                    detected_at=now,
                )
            )
        else:
            changes.append(
                ChangeRecord(
                    type="event_classification",
                    before=prev_event_type,
                    after=new_state.event_type,
                    description=(
                        f"Event classification changed from {prev_event_type} "
                        f"to {new_state.event_type}."
                    ),
                    significant=True,
                    evidence_report_id=evidence_report_id,
                    detected_at=now,
                )
            )

    # --- report count ------------------------------------------------
    if new_report_count != previous_report_count:
        delta = new_report_count - previous_report_count
        ratio = (new_report_count / previous_report_count) if previous_report_count > 0 else float("inf")
        significant = delta >= config.SIGNIFICANT_REPORT_COUNT_MIN_DELTA and ratio >= config.SIGNIFICANT_REPORT_COUNT_RATIO
        changes.append(
            ChangeRecord(
                type="report_count",
                before=previous_report_count,
                after=new_report_count,
                description=f"Report count increased from {previous_report_count} to {new_report_count}.",
                significant=significant,
                evidence_report_id=evidence_report_id,
                detected_at=now,
            )
        )

    return changes


def any_significant(changes: list[ChangeRecord]) -> bool:
    return any(c.significant for c in changes)
