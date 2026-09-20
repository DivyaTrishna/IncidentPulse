"""
Pydantic models for IncidentPulse.

Two top-level entities:

- Report: a single incoming piece of text describing something happening
  in the world, with a timestamp and coordinates.
- Incident: an evolving real-world event, built up from one or more
  reports, with a current state, a timeline, and a change history.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class Location(BaseModel):
    """A geographic point."""

    lat: float
    lng: float

    @field_validator("lat")
    @classmethod
    def _valid_lat(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError(f"latitude out of range: {v}")
        return v

    @field_validator("lng")
    @classmethod
    def _valid_lng(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError(f"longitude out of range: {v}")
        return v


class ReportSource(str, Enum):
    CITIZEN_REPORT = "citizen_report"
    SENSOR = "sensor"
    SOCIAL_MEDIA = "social_media"
    OFFICIAL = "official"
    OTHER = "other"


class Report(BaseModel):
    """A single incoming report describing a real-world observation."""


    report_id: str
    text: str
    timestamp: datetime
    location: Optional[Location] = None
    source: str = ReportSource.CITIZEN_REPORT.value

    # Present ONLY for synthetic/evaluation data. The production matching
    # algorithm (matching.py / incident_engine.py) MUST NEVER read this
    # field. It exists solely so evaluate.py can score predictions against
    # a known ground truth.
    ground_truth_incident_id: Optional[str] = None

    @field_validator("text")
    @classmethod
    def _non_empty_text(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("report text must not be empty")
        return v


class ReportCreate(BaseModel):
    """Payload accepted by POST /reports. report_id is optional/generated."""

    report_id: Optional[str] = None
    text: str
    timestamp: Optional[datetime] = None
    location: Optional[Location] = None
    source: str = ReportSource.CITIZEN_REPORT.value
    ground_truth_incident_id: Optional[str] = None

    @field_validator("text")
    @classmethod
    def _non_empty_text(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("report text must not be empty")
        return v


class ExtractedInfo(BaseModel):
    """Structured information pulled out of a report's text."""

    event_type: Optional[str] = None
    traffic_blocked: bool = False
    emergency_response: bool = False
    location_names: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class IncidentStatus(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"


class IncidentState(BaseModel):
    """The current evolving state of an incident."""

    event_type: Optional[str] = None
    traffic_blocked: bool = False
    emergency_response: bool = False
    affected_roads: list[str] = Field(default_factory=list)
    affected_area_km: float = 0.0
    severity: Optional[str] = None
    status: IncidentStatus = IncidentStatus.ACTIVE

    def snapshot(self) -> dict[str, Any]:
        """A plain-dict copy, safe to stash as "previous state"."""
        return self.model_dump(mode="json")


class TimelineEvent(BaseModel):
    """One entry in an incident's timeline."""


    timestamp: datetime
    event_type: str
    description: str
    report_id: Optional[str] = None
    evidence: Optional[str] = None


class ChangeRecord(BaseModel):
    """One detected, structured change to an incident's state."""

    type: str
    before: Any = None
    after: Any = None
    description: str
    significant: bool = False
    evidence_report_id: Optional[str] = None
    detected_at: Optional[datetime] = None



class Incident(BaseModel):
    """A real-world incident built up from one or more merged reports."""


    incident_id: str
    event_type: Optional[str] = None
    location: Optional[Location] = None
    first_seen: datetime
    last_updated: datetime
    reports: list[str] = Field(default_factory=list)
    current_state: IncidentState = Field(default_factory=IncidentState)
    status: IncidentStatus = IncidentStatus.ACTIVE
    timeline: list[TimelineEvent] = Field(default_factory=list)
    change_history: list[ChangeRecord] = Field(default_factory=list)

    # The score from the most recent successful MERGE decision (None for
    # an incident that has only ever had its founding report — there is
    # no "match" to score yet). This is what GET /incidents and
    # GET /incidents/{id} expose as "confidence"; POST /reports separately
    # returns the confidence for that specific request's decision.
    last_match_confidence: Optional[float] = None

    def significant_change_count(self) -> int:
        return sum(1 for c in self.change_history if c.significant)


class MatchScores(BaseModel):
    location: float = 0.0
    time: float = 0.0
    event: float = 0.0
    semantic: float = 0.0


class MatchAction(str, Enum):
    MERGED = "MERGED"
    CREATED = "CREATED"
    UNCERTAIN = "UNCERTAIN"


class ReportProcessResult(BaseModel):
    """The full structured result of processing one incoming report."""

    success: bool = True
    action: MatchAction
    incident_id: Optional[str] = None
    candidate_incident_id: Optional[str] = None
    report_id: str
    confidence: float = 0.0
    scores: MatchScores = Field(default_factory=MatchScores)
    state_changed: bool = False
    significant_change: bool = False
    changes: list[ChangeRecord] = Field(default_factory=list)
    message: Optional[str] = None
