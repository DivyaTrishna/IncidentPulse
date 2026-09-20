"""
Central configuration for IncidentPulse.

All tunable parameters live here so nothing is hardcoded deeper in the
application. Values can be overridden with environment variables, which
matters most for the STORAGE_BACKEND / USE_BEDROCK switches that flip the
app between LOCAL MODE and AWS MODE.
"""

from __future__ import annotations

import os
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    val = os.environ.get(name)
    if val is None:
        return default
    try:
        return float(val)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    val = os.environ.get(name)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# BACKEND_DIR is the directory this file lives in, so paths resolve
# correctly whether the app is launched as `python backend/main.py` from the
# repo root, or `python main.py` from inside backend/.
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"
REPORTS_PATH = DATA_DIR / "reports.json"
INCIDENTS_PATH = DATA_DIR / "incidents.json"

# ---------------------------------------------------------------------------
# Candidate search window
# ---------------------------------------------------------------------------
TIME_WINDOW_MINUTES = _env_float("TIME_WINDOW_MINUTES", 30.0)
LOCATION_RADIUS_KM = _env_float("LOCATION_RADIUS_KM", 1.0)

# ---------------------------------------------------------------------------
# Match score weights (must sum to ~1.0, not strictly enforced)
# ---------------------------------------------------------------------------
LOCATION_WEIGHT = _env_float("LOCATION_WEIGHT", 0.35)
TIME_WEIGHT = _env_float("TIME_WEIGHT", 0.25)
EVENT_WEIGHT = _env_float("EVENT_WEIGHT", 0.20)
SEMANTIC_WEIGHT = _env_float("SEMANTIC_WEIGHT", 0.20)

# ---------------------------------------------------------------------------
# Decision thresholds
# ---------------------------------------------------------------------------
MERGE_THRESHOLD = _env_float("MERGE_THRESHOLD", 0.75)
UNCERTAIN_THRESHOLD = _env_float("UNCERTAIN_THRESHOLD", 0.45)

# ---------------------------------------------------------------------------
# Significant-change thresholds
# ---------------------------------------------------------------------------
SIGNIFICANT_ROAD_INCREASE = _env_int("SIGNIFICANT_ROAD_INCREASE", 1)
SIGNIFICANT_AREA_INCREASE_KM = _env_float("SIGNIFICANT_AREA_INCREASE_KM", 0.3)
SIGNIFICANT_AREA_INCREASE_RATIO = _env_float("SIGNIFICANT_AREA_INCREASE_RATIO", 1.5)
SIGNIFICANT_REPORT_COUNT_RATIO = _env_float("SIGNIFICANT_REPORT_COUNT_RATIO", 1.5)
SIGNIFICANT_REPORT_COUNT_MIN_DELTA = _env_int("SIGNIFICANT_REPORT_COUNT_MIN_DELTA", 3)

# ---------------------------------------------------------------------------
# Storage / AWS switches
# ---------------------------------------------------------------------------
# "local" (default, JSON files) or "dynamodb"
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local").strip().lower()

USE_BEDROCK = _env_bool("USE_BEDROCK", False)

DYNAMODB_REPORTS_TABLE = os.environ.get("DYNAMODB_REPORTS_TABLE", "IncidentPulseReports")
DYNAMODB_INCIDENTS_TABLE = os.environ.get("DYNAMODB_INCIDENTS_TABLE", "IncidentPulseIncidents")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"
)
BEDROCK_EMBEDDING_MODEL_ID = os.environ.get(
    "BEDROCK_EMBEDDING_MODEL_ID", "amazon.titan-embed-text-v1"
)

# Allows POST /reset to be safely disabled in a real deployment. Defaults to
# allowed for local/hackathon use; set ALLOW_RESET=false in production.
ALLOW_RESET = _env_bool("ALLOW_RESET", True)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# Comma-separated list of allowed origins for the frontend dev server.
# Override with CORS_ALLOWED_ORIGINS="https://your-deployed-frontend" in
# a real deployment; defaults cover both localhost and 127.0.0.1 Vite dev
# origins since browsers treat them as distinct origins.
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

# ---------------------------------------------------------------------------
# Event type relationship map
# ---------------------------------------------------------------------------
# Symmetric relationship strengths between event types, in [0, 1].
# 1.0 = same/near-identical, lower = weaker but still plausibly related,
# 0.0 (i.e. absent from the map) = unrelated -> low event score.
EVENT_RELATIONSHIPS: dict[tuple[str, str], float] = {
    ("fire", "traffic"): 0.7,
    ("fire", "accident"): 0.3,
    ("accident", "traffic"): 0.8,
    ("accident", "crash"): 0.95,
    ("crash", "traffic"): 0.8,
    ("flood", "waterlogging"): 0.9,
    ("flood", "traffic"): 0.5,
    ("waterlogging", "traffic"): 0.6,
    ("fallen_tree", "traffic"): 0.7,
    ("fallen_tree", "power_outage"): 0.4,
    ("power_outage", "traffic"): 0.2,
}

# Known event types recognized by the deterministic extractor.
KNOWN_EVENT_TYPES = [
    "fire",
    "traffic",
    "accident",
    "crash",
    "power_outage",
    "fallen_tree",
    "flood",
    "waterlogging",
]
