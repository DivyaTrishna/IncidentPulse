"""
Candidate search and match scoring.

Pipeline stage: EVENT INFORMATION EXTRACTION -> CANDIDATE INCIDENT SEARCH
-> MATCHING.

Given a new report (already extracted) and the set of existing incidents,
this module:

1. Filters to plausible candidates using time + location (cheap, so we
   never run semantic similarity against every historical report).
2. Scores each candidate on location / time / event / semantic axes.
3. Combines them into a single weighted confidence score.

Nothing here ever reads the report's ground-truth evaluation field.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime

import config
from models import ExtractedInfo, Incident, Location, MatchScores, Report


def haversine_km(loc1: Location, loc2: Location) -> float:
    """Great-circle distance between two points, in kilometers."""
    R = 6371.0088  # mean Earth radius, km
    lat1, lng1 = math.radians(loc1.lat), math.radians(loc1.lng)
    lat2, lng2 = math.radians(loc2.lat), math.radians(loc2.lng)

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    c = 2 * math.asin(min(1.0, math.sqrt(a)))
    return R * c


def time_diff_minutes(t1: datetime, t2: datetime) -> float:
    return abs((t1 - t2).total_seconds()) / 60.0


def location_score(distance_km: float, radius_km: float = config.LOCATION_RADIUS_KM) -> float:
    """
    Normalized [0, 1] score: 1.0 at distance 0, decaying to 0.0 at the
    radius boundary. Outside the radius the caller should reject the
    candidate entirely (see find_candidates).
    """
    if radius_km <= 0:
        return 1.0 if distance_km == 0 else 0.0
    if distance_km >= radius_km:
        return 0.0
    return 1.0 - (distance_km / radius_km)


def time_score(minutes: float, window_minutes: float = config.TIME_WINDOW_MINUTES) -> float:
    """
    Normalized [0, 1] score: 1.0 at zero time difference, decaying to 0.0
    at the window boundary. Outside the window the caller should reject
    the candidate entirely (see find_candidates).
    """
    if window_minutes <= 0:
        return 1.0 if minutes == 0 else 0.0
    if minutes >= window_minutes:
        return 0.0
    return 1.0 - (minutes / window_minutes)


def event_relationship_score(type_a: str | None, type_b: str | None) -> float:
    """
    Score how related two event types are, using config.EVENT_RELATIONSHIPS.

    - Same non-null type -> 1.0
    - Related pair (either order) -> configured strength
    - Exactly one side unknown (None) -> a report can easily contain no
      hazard keyword at all (e.g. "Ambulance arriving", "Police on scene")
      while still describing the same real event; that absence is not
      evidence of a *different* event, so it scores higher than two
      fully-unknown sides but still below an actual type match.
    - Both sides unknown (None) -> neutral-low; no information either way.
    - Unrelated known types -> low score.
    """
    if type_a is None and type_b is None:
        return 0.3
    if type_a is None or type_b is None:
        return 0.5
    if type_a == type_b:
        return 1.0
    key = (type_a, type_b)
    rev_key = (type_b, type_a)
    if key in config.EVENT_RELATIONSHIPS:
        return config.EVENT_RELATIONSHIPS[key]
    if rev_key in config.EVENT_RELATIONSHIPS:
        return config.EVENT_RELATIONSHIPS[rev_key]
    return 0.1


@dataclass
class Candidate:
    incident: Incident
    distance_km: float
    minutes_apart: float
    scores: MatchScores = field(default_factory=MatchScores)
    final_score: float = 0.0


def find_candidates(
    report: Report,
    incidents: list[Incident],
    time_window_minutes: float = config.TIME_WINDOW_MINUTES,
    radius_km: float = config.LOCATION_RADIUS_KM,
) -> list[Candidate]:
    """
    Stage 1 filter: keep only incidents within the time window AND the
    geographic radius of the incoming report. Cheap, so it runs before any
    semantic similarity computation.
    """
    candidates: list[Candidate] = []

    for incident in incidents:
        minutes = time_diff_minutes(report.timestamp, incident.last_updated)
        if minutes >= time_window_minutes:
            continue

        if report.location is not None and incident.location is not None:
            distance = haversine_km(report.location, incident.location)
            if distance >= radius_km:
                continue
        elif report.location is None or incident.location is None:
            # No coordinates to compare on one side; treat as "unknown
            # distance" rather than auto-rejecting, since the report model
            # allows optional location.
            distance = 0.0
        else:
            distance = 0.0

        candidates.append(Candidate(incident=incident, distance_km=distance, minutes_apart=minutes))

    return candidates


def score_candidate(
    candidate: Candidate,
    report: Report,
    extracted: ExtractedInfo,
    semantic_text_pool: list[str],
) -> Candidate:
    """
    Compute the four component scores and the final weighted score for one
    candidate incident, mutating and returning the candidate.
    """
    from semantic_matcher import get_semantic_matcher

    loc_score = location_score(candidate.distance_km)
    t_score = time_score(candidate.minutes_apart)
    ev_score = event_relationship_score(extracted.event_type, candidate.incident.event_type)

    matcher = get_semantic_matcher()
    sem_score = matcher.best_similarity(report.text, semantic_text_pool) if semantic_text_pool else 0.0

    final = (
        loc_score * config.LOCATION_WEIGHT
        + t_score * config.TIME_WEIGHT
        + ev_score * config.EVENT_WEIGHT
        + sem_score * config.SEMANTIC_WEIGHT
    )

    candidate.scores = MatchScores(location=loc_score, time=t_score, event=ev_score, semantic=sem_score)
    candidate.final_score = final
    return candidate


def rank_candidates(
    report: Report,
    extracted: ExtractedInfo,
    incidents: list[Incident],
    report_text_by_id: dict[str, str],
) -> list[Candidate]:
    """
    Full MATCHING stage: find plausible candidates, score each, and return
    them sorted best-first.
    """
    candidates = find_candidates(report, incidents)

    for candidate in candidates:
        text_pool = [
            report_text_by_id[rid]
            for rid in candidate.incident.reports
            if rid in report_text_by_id
        ]
        score_candidate(candidate, report, extracted, text_pool)

    candidates.sort(key=lambda c: c.final_score, reverse=True)
    return candidates
