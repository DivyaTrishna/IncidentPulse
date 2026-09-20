"""
The incident engine: orchestrates the full pipeline for one incoming
report.

REPORT -> EXTRACTION -> CANDIDATE SEARCH -> MATCHING -> MERGE/CREATE/
UNCERTAIN -> UPDATE STATE -> COMPARE PREVIOUS STATE -> WHAT CHANGED? ->
TIMELINE -> PERSISTENCE -> (structured) RESULT.

This module works against the `Storage` interface only (never against
LocalStorage/DynamoDBStorage directly), so it is agnostic to local vs AWS
mode. Likewise it never reads the report's ground-truth evaluation field.
"""

from __future__ import annotations

import itertools
import re
from datetime import datetime

import change_engine
import config
import extraction
import matching
import timeline as timeline_mod
from database import Storage
from models import (
    ExtractedInfo,
    Incident,
    IncidentState,
    IncidentStatus,
    MatchAction,
    MatchScores,
    Report,
    ReportProcessResult,
)

_INCIDENT_ID_RE = re.compile(r"^INC-(\d+)$")
_REPORT_ID_RE = re.compile(r"^R(\d+)$")


def generate_incident_id(existing: list[Incident]) -> str:
    """Generate the next INC-#### id, based on the highest existing number."""
    max_num = 1000
    for incident in existing:
        m = _INCIDENT_ID_RE.match(incident.incident_id)
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"INC-{max_num + 1}"


def generate_report_id(existing_ids: set[str]) -> str:
    """Generate the next R#### id, based on the highest existing number."""
    max_num = 0
    for rid in existing_ids:
        m = _REPORT_ID_RE.match(rid)
        if m:
            max_num = max(max_num, int(m.group(1)))
    candidate_num = max_num + 1
    candidate = f"R{candidate_num:03d}"
    while candidate in existing_ids:
        candidate_num += 1
        candidate = f"R{candidate_num:03d}"
    return candidate


def _state_from_extraction(extracted: ExtractedInfo, report: Report) -> IncidentState:
    """Build a fresh IncidentState for a brand-new incident from one report."""
    roads = list(extracted.location_names)
    return IncidentState(
        event_type=extracted.event_type,
        traffic_blocked=extracted.traffic_blocked,
        emergency_response=extracted.emergency_response,
        affected_roads=roads,
        affected_area_km=0.5 if roads else 0.0,
        status=IncidentStatus.ACTIVE,
    )


def _merge_state(current: IncidentState, extracted: ExtractedInfo, report: Report) -> IncidentState:
    """
    Compute the new IncidentState after merging a report into an existing
    incident. Flags are monotonic-OR (once true, stays true unless a
    resolution mechanism explicitly clears it); event_type is filled in if
    previously unknown; affected_roads accumulates newly named roads.
    """
    new_roads = list(current.affected_roads)
    for name in extracted.location_names:
        if name not in new_roads:
            new_roads.append(name)

    # Simple, explainable area heuristic: base 0.5 km once any road is
    # known, plus 0.3 km per additional distinct road beyond the first.
    # This is a deliberately simple deterministic proxy, not a geo model.
    if new_roads:
        area = 0.5 + 0.3 * max(0, len(new_roads) - 1)
    else:
        area = current.affected_area_km

    event_type = current.event_type or extracted.event_type

    return IncidentState(
        event_type=event_type,
        traffic_blocked=current.traffic_blocked or extracted.traffic_blocked,
        emergency_response=current.emergency_response or extracted.emergency_response,
        affected_roads=new_roads,
        affected_area_km=round(area, 3),
        severity=current.severity,
        status=current.status,
    )


def _create_incident(
    storage: Storage,
    report: Report,
    extracted: ExtractedInfo,
    all_incidents: list[Incident],
) -> Incident:
    incident_id = generate_incident_id(all_incidents)
    state = _state_from_extraction(extracted, report)

    incident = Incident(
        incident_id=incident_id,
        event_type=extracted.event_type,
        location=report.location,
        first_seen=report.timestamp,
        last_updated=report.timestamp,
        reports=[report.report_id],
        current_state=state,
        status=IncidentStatus.ACTIVE,
    )
    timeline_mod.incident_created_event(incident, report.timestamp, report.report_id)
    return incident


def process_report(storage: Storage, report: Report) -> ReportProcessResult:
    """
    Run the full pipeline for one already-persisted-or-about-to-be report.
    Does NOT persist the incoming report itself (caller decides when, e.g.
    to reject duplicates first) but DOES persist any created/merged
    incident.
    """
    now = report.timestamp

    # 1. EVENT INFORMATION EXTRACTION
    extracted = extraction.extract(report.text)

    # 2 & 3. CANDIDATE INCIDENT SEARCH + MATCHING
    all_incidents = storage.get_all_incidents()
    all_reports = storage.load_reports()
    report_text_by_id = {r.report_id: r.text for r in all_reports}
    report_text_by_id[report.report_id] = report.text

    ranked = matching.rank_candidates(report, extracted, all_incidents, report_text_by_id)
    best = ranked[0] if ranked else None

    # 4. MERGE / CREATE / UNCERTAIN
    if best is not None and best.final_score >= config.MERGE_THRESHOLD:
        action = MatchAction.MERGED
    elif best is not None and best.final_score >= config.UNCERTAIN_THRESHOLD:
        action = MatchAction.UNCERTAIN
    else:
        action = MatchAction.CREATED

    if action == MatchAction.UNCERTAIN:
        # Do NOT auto-merge. Report is still recorded by the caller, but no
        # incident is created or modified.
        return ReportProcessResult(
            success=True,
            action=action,
            candidate_incident_id=best.incident.incident_id if best else None,
            report_id=report.report_id,
            confidence=round(best.final_score, 4) if best else 0.0,
            scores=best.scores if best else MatchScores(),
            message="Best match was below the merge threshold; human review recommended.",
        )

    if action == MatchAction.CREATED:
        incident = _create_incident(storage, report, extracted, all_incidents)
        storage.update_incident(incident)
        return ReportProcessResult(
            success=True,
            action=action,
            incident_id=incident.incident_id,
            report_id=report.report_id,
            confidence=round(best.final_score, 4) if best else 1.0,
            scores=best.scores if best else MatchScores(),
            state_changed=True,
            significant_change=False,
            changes=[],
            message=f"No suitable existing incident found; created {incident.incident_id}.",
        )

    # action == MERGED
    assert best is not None
    incident = best.incident

    # 5. UPDATE INCIDENT STATE -- but first snapshot the previous state
    # (STATE HISTORY stage) so the change engine can compare.
    previous_state_snapshot = incident.current_state.snapshot()
    previous_report_count = len(incident.reports)

    new_state = _merge_state(incident.current_state, extracted, report)

    incident.reports.append(report.report_id)
    incident.last_updated = report.timestamp
    incident.current_state = new_state
    incident.event_type = new_state.event_type
    incident.status = new_state.status
    incident.last_match_confidence = round(best.final_score, 4)

    # 6 & 7. COMPARE PREVIOUS STATE / WHAT CHANGED?
    changes = change_engine.detect_changes(
        previous_state=previous_state_snapshot,
        new_state=new_state,
        previous_report_count=previous_report_count,
        new_report_count=len(incident.reports),
        evidence_report_id=report.report_id,
        now=now,
    )
    incident.change_history.extend(changes)

    # 8. TIMELINE
    timeline_mod.report_merged_event(incident, report.timestamp, report.report_id)
    for change in changes:
        timeline_mod.add_event(
            incident,
            timestamp=now,
            event_type=change.type,
            description=change.description,
            report_id=report.report_id,
            evidence=change.evidence_report_id,
        )

    # 9. PERSISTENCE
    storage.update_incident(incident)

    return ReportProcessResult(
        success=True,
        action=action,
        incident_id=incident.incident_id,
        report_id=report.report_id,
        confidence=round(best.final_score, 4),
        scores=best.scores,
        state_changed=len(changes) > 0,
        significant_change=change_engine.any_significant(changes),
        changes=changes,
        message=f"Report merged into {incident.incident_id}.",
    )
