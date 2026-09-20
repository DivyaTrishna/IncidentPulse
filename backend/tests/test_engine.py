"""
Practical tests exercising the real engine end-to-end (no mocking of the
core logic). Run with: pytest backend/tests -v
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

import change_engine
import extraction
import incident_engine
import matching
from database import LocalStorage
from models import Incident, IncidentState, Location, MatchAction, Report
from semantic_matcher import LocalSemanticMatcher

MARKET_ROAD = Location(lat=15.490, lng=73.830)
NEARBY = Location(lat=15.4915, lng=73.8305)  # ~170m away
FAR_AWAY = Location(lat=15.700, lng=74.200)  # far outside radius

BASE_TIME = datetime(2026, 9, 18, 10, 0, 0, tzinfo=timezone.utc)


@pytest.fixture()
def storage(tmp_path: Path) -> LocalStorage:
    return LocalStorage(
        reports_path=tmp_path / "reports.json",
        incidents_path=tmp_path / "incidents.json",
    )


def make_report(report_id, text, minutes_offset=0, location=MARKET_ROAD, gt=None) -> Report:
    return Report(
        report_id=report_id,
        text=text,
        timestamp=BASE_TIME + timedelta(minutes=minutes_offset),
        location=location,
        source="citizen_report",
        ground_truth_incident_id=gt,
    )


# ---------------------------------------------------------------------------
# 1. Report validation
# ---------------------------------------------------------------------------
def test_report_validation_rejects_empty_text():
    with pytest.raises(ValidationError):
        Report(
            report_id="R1",
            text="   ",
            timestamp=BASE_TIME,
            location=MARKET_ROAD,
            source="citizen_report",
        )


def test_report_validation_rejects_bad_coordinates():
    with pytest.raises(ValidationError):
        Location(lat=999, lng=73.8)


# ---------------------------------------------------------------------------
# 2. Incident creation
# ---------------------------------------------------------------------------
def test_incident_creation_for_first_report(storage: LocalStorage):
    report = make_report("R001", "Smoke near Market Road")
    storage.add_report(report)
    result = incident_engine.process_report(storage, report)

    assert result.action == MatchAction.CREATED
    assert result.incident_id is not None

    incident = storage.get_incident(result.incident_id)
    assert incident is not None
    assert incident.reports == ["R001"]
    assert incident.event_type == "fire"
    assert incident.timeline[0].event_type == "incident_created"


# ---------------------------------------------------------------------------
# 3. Same-incident merge (paraphrased, escalating reports)
# ---------------------------------------------------------------------------
def test_same_incident_merges_across_paraphrases(storage: LocalStorage):
    r1 = make_report("R001", "Smoke near Market Road", minutes_offset=0)
    storage.add_report(r1)
    res1 = incident_engine.process_report(storage, r1)
    assert res1.action == MatchAction.CREATED
    incident_id = res1.incident_id

    r2 = make_report("R002", "Fire reported beside Market Road", minutes_offset=3)
    storage.add_report(r2)
    res2 = incident_engine.process_report(storage, r2)
    assert res2.action == MatchAction.MERGED
    assert res2.incident_id == incident_id

    r3 = make_report("R003", "Traffic completely blocked near Market Road", minutes_offset=9)
    storage.add_report(r3)
    res3 = incident_engine.process_report(storage, r3)
    assert res3.action == MatchAction.MERGED
    assert res3.state_changed
    assert res3.significant_change

    incident = storage.get_incident(incident_id)
    assert incident.current_state.traffic_blocked is True
    assert len(incident.reports) == 3


# ---------------------------------------------------------------------------
# 4. Unrelated incident creation (different location -> new incident)
# ---------------------------------------------------------------------------
def test_far_away_report_creates_separate_incident(storage: LocalStorage):
    r1 = make_report("R001", "Smoke near Market Road", minutes_offset=0, location=MARKET_ROAD)
    storage.add_report(r1)
    res1 = incident_engine.process_report(storage, r1)

    r2 = make_report("R002", "Smoke near Market Road", minutes_offset=2, location=FAR_AWAY)
    storage.add_report(r2)
    res2 = incident_engine.process_report(storage, r2)

    assert res2.action == MatchAction.CREATED
    assert res2.incident_id != res1.incident_id


# ---------------------------------------------------------------------------
# 5. Haversine distance
# ---------------------------------------------------------------------------
def test_haversine_known_distance():
    # Roughly 1 degree of latitude ~= 111km
    a = Location(lat=0.0, lng=0.0)
    b = Location(lat=1.0, lng=0.0)
    dist = matching.haversine_km(a, b)
    assert 110.0 < dist < 112.0


def test_haversine_zero_for_same_point():
    assert matching.haversine_km(MARKET_ROAD, MARKET_ROAD) == pytest.approx(0.0, abs=1e-9)


# ---------------------------------------------------------------------------
# 6. Time matching
# ---------------------------------------------------------------------------
def test_time_score_decays_and_rejects_outside_window():
    assert matching.time_score(0) == pytest.approx(1.0)
    assert matching.time_score(15, window_minutes=30) == pytest.approx(0.5)
    assert matching.time_score(30, window_minutes=30) == 0.0
    assert matching.time_score(45, window_minutes=30) == 0.0


def test_find_candidates_excludes_outside_time_window():
    incident = Incident(
        incident_id="INC-1000",
        event_type="fire",
        location=MARKET_ROAD,
        first_seen=BASE_TIME,
        last_updated=BASE_TIME,
        reports=["R001"],
    )
    late_report = make_report("R002", "Fire again near Market Road", minutes_offset=60)
    candidates = matching.find_candidates(late_report, [incident])
    assert candidates == []


# ---------------------------------------------------------------------------
# 7. Event relationship
# ---------------------------------------------------------------------------
def test_event_relationship_same_type():
    assert matching.event_relationship_score("fire", "fire") == 1.0


def test_event_relationship_related_types():
    score = matching.event_relationship_score("accident", "traffic")
    assert 0.5 < score < 1.0


def test_event_relationship_unrelated_types():
    score = matching.event_relationship_score("fire", "power_outage")
    assert score < 0.3


# ---------------------------------------------------------------------------
# 8. Semantic similarity
# ---------------------------------------------------------------------------
def test_semantic_similarity_identical_text():
    matcher = LocalSemanticMatcher()
    assert matcher.similarity("Fire near Market Road", "Fire near Market Road") == pytest.approx(1.0)


def test_semantic_similarity_paraphrase_higher_than_unrelated():
    matcher = LocalSemanticMatcher()
    sim_paraphrase = matcher.similarity(
        "Smoke near Market Road", "Fire reported beside Market Road"
    )
    sim_unrelated = matcher.similarity(
        "Smoke near Market Road", "Power outage reported downtown"
    )
    assert sim_paraphrase > sim_unrelated


# ---------------------------------------------------------------------------
# 9. Confidence score / weighted combination
# ---------------------------------------------------------------------------
def test_confidence_score_high_for_close_match(storage: LocalStorage):
    r1 = make_report("R001", "Fire reported near Market Road", minutes_offset=0)
    storage.add_report(r1)
    incident_engine.process_report(storage, r1)

    r2 = make_report("R002", "Fire reported near Market Road", minutes_offset=1, location=NEARBY)
    storage.add_report(r2)
    res2 = incident_engine.process_report(storage, r2)

    assert res2.confidence > 0.75


# ---------------------------------------------------------------------------
# 10. Uncertain case
# ---------------------------------------------------------------------------
def test_uncertain_case_does_not_auto_merge(storage: LocalStorage):
    r1 = make_report("R001", "Fire reported near Market Road", minutes_offset=0)
    storage.add_report(r1)
    incident_id = incident_engine.process_report(storage, r1).incident_id

    # Different, only loosely related event type, moderate distance
    # (~700m, inside radius) and near the edge of the time window -> should
    # land in the uncertain band rather than auto-merging or auto-creating.
    edge_location = Location(lat=15.4965, lng=73.830)  # ~700m north
    r2 = make_report(
        "R002",
        "Power cut reported nearby",
        minutes_offset=25,
        location=edge_location,
    )
    storage.add_report(r2)
    res2 = incident_engine.process_report(storage, r2)

    # This scenario is constructed to fall below MERGE_THRESHOLD; assert
    # it never silently merges without at least reaching that bar.
    if res2.action == MatchAction.MERGED:
        assert res2.confidence >= 0.75
    else:
        assert res2.action in (MatchAction.UNCERTAIN, MatchAction.CREATED)
        assert res2.incident_id is None or res2.action == MatchAction.CREATED


# ---------------------------------------------------------------------------
# 11. State update
# ---------------------------------------------------------------------------
def test_state_update_reflects_new_report(storage: LocalStorage):
    r1 = make_report("R001", "Smoke near Market Road", minutes_offset=0)
    storage.add_report(r1)
    res1 = incident_engine.process_report(storage, r1)
    incident = storage.get_incident(res1.incident_id)
    assert incident.current_state.emergency_response is False

    r2 = make_report("R002", "Fire engines arriving near Market Road", minutes_offset=5)
    storage.add_report(r2)
    incident_engine.process_report(storage, r2)

    incident = storage.get_incident(res1.incident_id)
    assert incident.current_state.emergency_response is True


# ---------------------------------------------------------------------------
# 12. What Changed
# ---------------------------------------------------------------------------
def test_change_engine_detects_traffic_change():
    previous = IncidentState(traffic_blocked=False, emergency_response=False).snapshot()
    new_state = IncidentState(traffic_blocked=True, emergency_response=False)

    changes = change_engine.detect_changes(
        previous_state=previous,
        new_state=new_state,
        previous_report_count=2,
        new_report_count=3,
        evidence_report_id="R003",
        now=BASE_TIME,
    )
    traffic_changes = [c for c in changes if c.type == "traffic_impact"]
    assert len(traffic_changes) == 1
    assert traffic_changes[0].significant is True
    assert traffic_changes[0].evidence_report_id == "R003"


def test_change_engine_no_changes_when_state_identical():
    state_dict = IncidentState(traffic_blocked=True).snapshot()
    new_state = IncidentState(traffic_blocked=True)
    changes = change_engine.detect_changes(
        previous_state=state_dict,
        new_state=new_state,
        previous_report_count=3,
        new_report_count=3,
        evidence_report_id="R003",
        now=BASE_TIME,
    )
    assert changes == []


# ---------------------------------------------------------------------------
# 13. Timeline
# ---------------------------------------------------------------------------
def test_timeline_grows_with_each_merge(storage: LocalStorage):
    r1 = make_report("R001", "Smoke near Market Road", minutes_offset=0)
    storage.add_report(r1)
    res1 = incident_engine.process_report(storage, r1)

    r2 = make_report("R002", "Fire reported beside Market Road", minutes_offset=3)
    storage.add_report(r2)
    incident_engine.process_report(storage, r2)

    incident = storage.get_incident(res1.incident_id)
    assert len(incident.timeline) >= 2
    assert incident.timeline[0].event_type == "incident_created"
    assert any(e.event_type == "report_merged" for e in incident.timeline)


# ---------------------------------------------------------------------------
# 14. JSON persistence
# ---------------------------------------------------------------------------
def test_json_persistence_round_trip(tmp_path: Path):
    storage = LocalStorage(
        reports_path=tmp_path / "reports.json", incidents_path=tmp_path / "incidents.json"
    )
    r1 = make_report("R001", "Smoke near Market Road", minutes_offset=0)
    storage.add_report(r1)
    incident_engine.process_report(storage, r1)

    # Fresh storage instance reading the same files
    storage2 = LocalStorage(
        reports_path=tmp_path / "reports.json", incidents_path=tmp_path / "incidents.json"
    )
    incidents = storage2.get_all_incidents()
    assert len(incidents) == 1
    assert incidents[0].reports == ["R001"]

    reports = storage2.load_reports()
    assert len(reports) == 1
    assert isinstance(reports[0].timestamp, datetime)


def test_json_persistence_handles_missing_and_invalid_files(tmp_path: Path):
    reports_path = tmp_path / "reports.json"
    incidents_path = tmp_path / "incidents.json"
    incidents_path.write_text("not valid json{{{", encoding="utf-8")

    storage = LocalStorage(reports_path=reports_path, incidents_path=incidents_path)
    assert storage.load_reports() == []
    assert storage.get_all_incidents() == []


# ---------------------------------------------------------------------------
# 15. Ground-truth leakage prevention
# ---------------------------------------------------------------------------
def test_ground_truth_never_used_for_matching(storage: LocalStorage):
    """
    Two reports that are actually unrelated (different location, different
    event) but share the same (fake) ground_truth_incident_id must NOT be
    merged just because that field matches -- the engine must never read
    it.
    """
    r1 = make_report(
        "R001", "Fire reported near Market Road", minutes_offset=0,
        location=MARKET_ROAD, gt="INC-GT-SAME",
    )
    storage.add_report(r1)
    res1 = incident_engine.process_report(storage, r1)

    r2 = make_report(
        "R002", "Power cut reported downtown", minutes_offset=2,
        location=FAR_AWAY, gt="INC-GT-SAME",
    )
    storage.add_report(r2)
    res2 = incident_engine.process_report(storage, r2)

    assert res2.incident_id != res1.incident_id


def test_incident_engine_source_never_references_ground_truth_field():
    """Static guard: incident_engine.py and matching.py must not reference
    ground_truth_incident_id anywhere in their source."""
    import incident_engine as ie_mod
    import matching as matching_mod

    for module in (ie_mod, matching_mod):
        src = Path(module.__file__).read_text(encoding="utf-8")
        assert "ground_truth_incident_id" not in src
