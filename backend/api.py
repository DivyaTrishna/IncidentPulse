"""
FastAPI application for IncidentPulse.

Endpoints:

  GET  /health
  POST /reports
  GET  /incidents
  GET  /incidents/{incident_id}
  GET  /incidents/{incident_id}/timeline
  POST /reset
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

import config
import incident_engine
from database import get_storage
from models import Report, ReportCreate, ReportProcessResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("incidentpulse.api")

app = FastAPI(title="IncidentPulse", version="1.0.0")

# ---------------------------------------------------------------------------
# CORS: the frontend runs on Vite's dev server (localhost:5173 /
# 127.0.0.1:5173) while the backend runs on 127.0.0.1:8000 -- different
# origins, so the browser blocks requests (including the OPTIONS preflight
# every non-trivial POST triggers) unless the backend explicitly allows
# them. Origins are configurable via CORS_ALLOWED_ORIGINS so a real
# deployment can restrict this without code changes; nothing here touches
# AWS credentials or secrets, which never reach the frontend regardless.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


# ---------------------------------------------------------------------------
# Error handling: never leak stack traces through the API.
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    logger.exception("Unhandled error while processing %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"success": False, "error": "internal_server_error"})


@app.exception_handler(ValidationError)
async def validation_exception_handler(request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"success": False, "error": "validation_error", "details": exc.errors()})


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "success": True,
        "status": "ok",
        "storage_backend": config.STORAGE_BACKEND,
        "use_bedrock": config.USE_BEDROCK,
    }


# ---------------------------------------------------------------------------
# POST /reports
# ---------------------------------------------------------------------------
@app.post("/reports")
def create_report(payload: ReportCreate):
    storage = get_storage()

    if payload.timestamp is None:
        timestamp = datetime.now(timezone.utc)
    else:
        timestamp = payload.timestamp

    existing_ids = {r.report_id for r in storage.load_reports()}

    if payload.report_id:
        if payload.report_id in existing_ids:
            raise HTTPException(status_code=409, detail=f"Duplicate report_id: {payload.report_id}")
        report_id = payload.report_id
    else:
        report_id = incident_engine.generate_report_id(existing_ids)

    try:
        report = Report(
            report_id=report_id,
            text=payload.text,
            timestamp=timestamp,
            location=payload.location,
            source=payload.source,
            ground_truth_incident_id=payload.ground_truth_incident_id,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors())

    storage.add_report(report)

    try:
        result: ReportProcessResult = incident_engine.process_report(storage, report)
    except Exception:
        logger.exception("Failed to process report %s", report_id)
        raise HTTPException(status_code=500, detail="Failed to process report")

    return result.model_dump(mode="json")


# ---------------------------------------------------------------------------
# GET /incidents
# ---------------------------------------------------------------------------
@app.get("/incidents")
def list_incidents():
    storage = get_storage()
    incidents = storage.get_all_incidents()
    incidents.sort(key=lambda i: i.last_updated, reverse=True)

    summaries = []
    for incident in incidents:
        summaries.append(
            {
                "incident_id": incident.incident_id,
                "event_type": incident.event_type,
                "location": incident.location.model_dump(mode="json") if incident.location else None,
                "report_count": len(incident.reports),
                "first_seen": incident.first_seen,
                "last_updated": incident.last_updated,
                "status": incident.status,
                "current_state": incident.current_state.model_dump(mode="json"),
                "significant_change_count": incident.significant_change_count(),
                "confidence": incident.last_match_confidence,
            }
        )
    return {"success": True, "incidents": summaries}


# ---------------------------------------------------------------------------
# GET /incidents/{incident_id}
# ---------------------------------------------------------------------------
@app.get("/incidents/{incident_id}")
def get_incident(incident_id: str):
    storage = get_storage()
    incident = storage.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Unknown incident_id: {incident_id}")

    all_reports = {r.report_id: r for r in storage.load_reports()}
    reports = [
        all_reports[rid].model_dump(mode="json")
        for rid in incident.reports
        if rid in all_reports
    ]

    return {
        "success": True,
        "incident": incident.model_dump(mode="json"),
        "current_state": incident.current_state.model_dump(mode="json"),
        "reports": reports,
        "timeline": [e.model_dump(mode="json") for e in incident.timeline],
        "change_history": [c.model_dump(mode="json") for c in incident.change_history],
        "significant_changes": [c.model_dump(mode="json") for c in incident.change_history if c.significant],
    }


# ---------------------------------------------------------------------------
# GET /incidents/{incident_id}/timeline
# ---------------------------------------------------------------------------
@app.get("/incidents/{incident_id}/timeline")
def get_incident_timeline(incident_id: str):
    storage = get_storage()
    incident = storage.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Unknown incident_id: {incident_id}")

    return {
        "success": True,
        "incident_id": incident_id,
        "timeline": [e.model_dump(mode="json") for e in incident.timeline],
    }


# ---------------------------------------------------------------------------
# POST /reset
# ---------------------------------------------------------------------------
@app.post("/reset")
def reset():
    if not config.ALLOW_RESET:
        raise HTTPException(status_code=403, detail="Reset is disabled in this environment.")
    storage = get_storage()
    storage.reset()
    return {"success": True, "message": "Local test data cleared."}
