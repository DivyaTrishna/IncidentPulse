"""
Deterministic event-information extraction.

This module turns raw report text into structured `ExtractedInfo`
(event type, traffic/emergency flags, mentioned location names, keywords).

It is intentionally rule-based and local-only so the system has a working
extractor with zero external dependencies. `Bedrock`-backed extraction can
later be swapped in behind the same `extract(text) -> ExtractedInfo`
interface (see aws/bedrock.py) without touching any caller.
"""

from __future__ import annotations

import re

from models import ExtractedInfo

# ---------------------------------------------------------------------------
# Event-type keyword map. Order matters: more specific / higher-priority
# event types are checked first so e.g. "fire" wins over a generic mention
# in ambiguous text.
# ---------------------------------------------------------------------------
EVENT_KEYWORDS: dict[str, list[str]] = {
    # Smoke is treated as an indicator of fire, not a separate event type:
    # a "smoke near X" report and a "fire reported near X" report describe
    # the same underlying real-world event.
    "fire": ["fire", "flame", "flames", "ablaze", "burning", "blaze", "smoke", "smoky"],
    "accident": ["accident", "collision", "collided"],
    "crash": ["crash", "crashed"],
    "flood": ["flood", "flooded", "flooding"],
    "waterlogging": ["waterlogging", "water logging", "waterlogged", "water-logged"],
    "fallen_tree": ["fallen tree", "tree fallen", "tree fell", "tree down", "uprooted tree"],
    "power_outage": ["power outage", "power cut", "blackout", "power failure", "no electricity"],
    "traffic": ["traffic", "congestion", "gridlock", "jam", "backed up"],
}

# Multi-word phrases must be checked before single tokens, so keep a
# separate ordered list for those to avoid partial-word false positives.
_MULTI_WORD_TYPES = ["fallen_tree", "power_outage", "waterlogging"]

TRAFFIC_BLOCKED_PATTERNS = [
    r"\btraffic\b.*\b(blocked|halted|stopped|closed|jammed)\b",
    r"\broad\b.*\b(blocked|closed)\b",
    r"\bblocked\b.*\btraffic\b",
    r"\bcompletely blocked\b",
    r"\ball lanes (blocked|closed)\b",
]

EMERGENCY_RESPONSE_PATTERNS = [
    r"\bfire (engine|truck|trucks|engines)\b",
    r"\bfire fighters?\b",
    r"\bfirefighters?\b",
    r"\bambulance(s)?\b",
    r"\bpolice (arriv|on scene|responding|dispatched)\b",
    r"\bemergency (response|crew|team|services)\b",
    r"\brescue team\b",
    r"\bresponders? (arriv|on scene|dispatched)\b",
    r"\barriving\b.*\b(fire|scene|engine)\b",
]

_WORD_RE = re.compile(r"[a-zA-Z]+")

# Very small stopword list, enough to keep extracted keywords meaningful
# without pulling in an external NLP library.
_STOPWORDS = {
    "a", "an", "the", "near", "beside", "around", "close", "to", "at", "in",
    "on", "is", "was", "are", "were", "reported", "report", "seen", "of",
    "and", "has", "have", "been", "being", "by", "from", "with", "this",
    "that", "it", "as", "for",
}


def _normalize(text: str) -> str:
    return text.lower().strip()


def detect_event_type(text_lower: str) -> str | None:
    """Return the best-matching known event type, or None."""
    for etype in _MULTI_WORD_TYPES:
        for kw in EVENT_KEYWORDS[etype]:
            if kw in text_lower:
                return etype

    for etype, keywords in EVENT_KEYWORDS.items():
        if etype in _MULTI_WORD_TYPES:
            continue
        for kw in keywords:
            # word-boundary match for single tokens to avoid substrings
            # like "crashed" matching a stray "ash" style bug.
            if re.search(rf"\b{re.escape(kw)}\b", text_lower):
                return etype
    return None


def detect_traffic_blocked(text_lower: str) -> bool:
    return any(re.search(p, text_lower) for p in TRAFFIC_BLOCKED_PATTERNS)


def detect_emergency_response(text_lower: str) -> bool:
    return any(re.search(p, text_lower) for p in EMERGENCY_RESPONSE_PATTERNS)


def extract_location_names(text: str) -> list[str]:
    """
    Best-effort extraction of location-like phrases for display/evidence
    purposes only. The matching algorithm relies on coordinates, not this.

    Heuristic: capture capitalized multi-word sequences (e.g. "Market
    Road", "Railway Station") that follow a location preposition.
    """
    names: list[str] = []
    pattern = re.compile(
        r"\b(?:near|beside|around|close to|at|on|toward|towards|along)\s+"
        r"([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)"
    )
    for match in pattern.finditer(text):
        candidate = match.group(1).strip()
        if candidate and candidate not in names:
            names.append(candidate)
    return names


def extract_keywords(text_lower: str) -> list[str]:
    words = _WORD_RE.findall(text_lower)
    seen: list[str] = []
    for w in words:
        if w in _STOPWORDS or len(w) < 3:
            continue
        if w not in seen:
            seen.append(w)
    return seen


def extract(text: str) -> ExtractedInfo:
    """
    Extract structured event information from raw report text.

    This is the local, deterministic implementation. It has no external
    dependencies and is safe to call for every incoming report.
    """
    text_lower = _normalize(text)

    event_type = detect_event_type(text_lower)
    traffic_blocked = detect_traffic_blocked(text_lower)
    emergency_response = detect_emergency_response(text_lower)
    location_names = extract_location_names(text)
    keywords = extract_keywords(text_lower)

    return ExtractedInfo(
        event_type=event_type,
        traffic_blocked=traffic_blocked,
        emergency_response=emergency_response,
        location_names=location_names,
        keywords=keywords,
    )
