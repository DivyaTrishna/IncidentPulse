"""
Storage abstraction.

`Storage` is the interface the incident engine depends on. `LocalStorage`
implements it with two JSON files (reports.json / incidents.json) so the
whole system works with zero AWS setup. `aws/dynamodb.py` provides
`DynamoDBStorage`, which implements the same interface against DynamoDB.

`get_storage()` picks the implementation based on config.STORAGE_BACKEND.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from threading import RLock

import config
from models import Incident, Report

logger = logging.getLogger("incidentpulse.database")


class Storage(ABC):
    """Interface for report/incident persistence."""

    @abstractmethod
    def load_reports(self) -> list[Report]: ...

    @abstractmethod
    def save_reports(self, reports: list[Report]) -> None: ...

    @abstractmethod
    def add_report(self, report: Report) -> None: ...

    @abstractmethod
    def load_incidents(self) -> list[Incident]: ...

    @abstractmethod
    def save_incidents(self, incidents: list[Incident]) -> None: ...

    @abstractmethod
    def get_incident(self, incident_id: str) -> Incident | None: ...

    @abstractmethod
    def get_all_incidents(self) -> list[Incident]: ...

    @abstractmethod
    def update_incident(self, incident: Incident) -> None: ...

    @abstractmethod
    def report_exists(self, report_id: str) -> bool: ...

    @abstractmethod
    def reset(self) -> None: ...


class LocalStorage(Storage):
    """
    JSON-file backed storage.

    Safe against: missing files, empty files, invalid JSON (treated as
    empty), and datetime (de)serialization via the Pydantic models'
    `model_dump(mode="json")` / `model_validate`.

    Thread-safety: a single process-wide lock guards read-modify-write
    sequences, which is sufficient for a single-process FastAPI/uvicorn
    hackathon deployment.
    """

    def __init__(self, reports_path: Path | None = None, incidents_path: Path | None = None):
        self.reports_path = reports_path or config.REPORTS_PATH
        self.incidents_path = incidents_path or config.INCIDENTS_PATH
        self._lock = RLock()
        self._ensure_files()

    def _ensure_files(self) -> None:
        self.reports_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.reports_path.exists():
            self.reports_path.write_text("[]", encoding="utf-8")
        if not self.incidents_path.exists():
            self.incidents_path.write_text("[]", encoding="utf-8")

    @staticmethod
    def _read_json_list(path: Path) -> list[dict]:
        if not path.exists():
            return []
        raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in %s; treating as empty.", path)
            return []
        if not isinstance(data, list):
            logger.warning("Expected a JSON list in %s; treating as empty.", path)
            return []
        return data

    @staticmethod
    def _write_json_list(path: Path, items: list[dict]) -> None:
        path.write_text(json.dumps(items, indent=2, default=str), encoding="utf-8")

    # -- reports ---------------------------------------------------------

    def load_reports(self) -> list[Report]:
        with self._lock:
            raw = self._read_json_list(self.reports_path)
        reports: list[Report] = []
        for item in raw:
            try:
                reports.append(Report.model_validate(item))
            except Exception:
                logger.warning("Skipping malformed report record: %r", item)
        return reports

    def save_reports(self, reports: list[Report]) -> None:
        with self._lock:
            self._write_json_list(
                self.reports_path, [r.model_dump(mode="json") for r in reports]
            )

    def add_report(self, report: Report) -> None:
        with self._lock:
            reports = self.load_reports()
            reports.append(report)
            self.save_reports(reports)

    def report_exists(self, report_id: str) -> bool:
        return any(r.report_id == report_id for r in self.load_reports())

    # -- incidents ---------------------------------------------------------

    def load_incidents(self) -> list[Incident]:
        with self._lock:
            raw = self._read_json_list(self.incidents_path)
        incidents: list[Incident] = []
        for item in raw:
            try:
                incidents.append(Incident.model_validate(item))
            except Exception:
                logger.warning("Skipping malformed incident record: %r", item)
        return incidents

    def save_incidents(self, incidents: list[Incident]) -> None:
        with self._lock:
            self._write_json_list(
                self.incidents_path, [i.model_dump(mode="json") for i in incidents]
            )

    def get_incident(self, incident_id: str) -> Incident | None:
        for incident in self.load_incidents():
            if incident.incident_id == incident_id:
                return incident
        return None

    def get_all_incidents(self) -> list[Incident]:
        return self.load_incidents()

    def update_incident(self, incident: Incident) -> None:
        with self._lock:
            incidents = self.load_incidents()
            for idx, existing in enumerate(incidents):
                if existing.incident_id == incident.incident_id:
                    incidents[idx] = incident
                    break
            else:
                incidents.append(incident)
            self.save_incidents(incidents)

    # -- misc ---------------------------------------------------------

    def reset(self) -> None:
        with self._lock:
            self._write_json_list(self.reports_path, [])
            self._write_json_list(self.incidents_path, [])


_storage_instance: Storage | None = None


def get_storage() -> Storage:
    """Return the configured Storage singleton based on config.STORAGE_BACKEND."""
    global _storage_instance
    if _storage_instance is not None:
        return _storage_instance

    if config.STORAGE_BACKEND == "dynamodb":
        try:
            from aws.dynamodb import DynamoDBStorage

            _storage_instance = DynamoDBStorage()
        except Exception as exc:
            logger.error("Failed to initialize DynamoDBStorage (%s); falling back to LocalStorage.", exc)
            _storage_instance = LocalStorage()
    else:
        _storage_instance = LocalStorage()

    return _storage_instance


def reset_storage_singleton() -> None:
    """Test helper: clear the cached singleton so a fresh get_storage() re-reads config."""
    global _storage_instance
    _storage_instance = None
