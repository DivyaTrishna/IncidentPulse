"""
Timeline helpers.

An incident's `timeline` is a plain list[TimelineEvent] on the Incident
model. This module centralizes how entries get appended so formatting
stays consistent and callers don't build TimelineEvent objects by hand
all over the codebase.
"""

from __future__ import annotations

from datetime import datetime

from models import Incident, TimelineEvent


def add_event(
    incident: Incident,
    timestamp: datetime,
    event_type: str,
    description: str,
    report_id: str | None = None,
    evidence: str | None = None,
) -> TimelineEvent:
    """Append a timeline event to an incident (in place) and return it."""
    event = TimelineEvent(
        timestamp=timestamp,
        event_type=event_type,
        description=description,
        report_id=report_id,
        evidence=evidence,
    )
    incident.timeline.append(event)
    return event


def incident_created_event(incident: Incident, timestamp: datetime, report_id: str) -> TimelineEvent:
    return add_event(
        incident,
        timestamp,
        event_type="incident_created",
        description="Incident created.",
        report_id=report_id,
    )


def report_merged_event(incident: Incident, timestamp: datetime, report_id: str) -> TimelineEvent:
    return add_event(
        incident,
        timestamp,
        event_type="report_merged",
        description="Report merged into incident.",
        report_id=report_id,
    )
