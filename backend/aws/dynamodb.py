"""
DynamoDB-backed Storage implementation.

Implements the same `Storage` interface as `database.LocalStorage`, so the
incident engine and API layer work unmodified whether STORAGE_BACKEND is
"local" or "dynamodb".

Table design (simple, single-table-per-entity for clarity in a hackathon
timeframe):

  IncidentPulseReports
    partition key: report_id (S)

  IncidentPulseIncidents
    partition key: incident_id (S)

Credentials come from the standard boto3 chain (environment variables,
shared config file, or an IAM role) -- nothing is hardcoded here. See
.env.example / the deployment notes for the IAM permissions needed.
"""

from __future__ import annotations

import json
import logging

import config
from database import Storage
from models import Incident, Report

logger = logging.getLogger("incidentpulse.dynamodb")


class DynamoDBStorage(Storage):
    def __init__(self):
        import boto3  # imported lazily so local mode never requires boto3 network setup

        self._boto3 = boto3
        self._resource = boto3.resource("dynamodb", region_name=config.AWS_REGION)
        self._reports_table = self._resource.Table(config.DYNAMODB_REPORTS_TABLE)
        self._incidents_table = self._resource.Table(config.DYNAMODB_INCIDENTS_TABLE)
        # Fail fast with a clear error if the tables aren't reachable, so
        # get_storage() can fall back to LocalStorage instead of the app
        # silently limping along.
        self._reports_table.load()
        self._incidents_table.load()

    # DynamoDB doesn't store nested Pydantic models natively as clean JSON;
    # we store each item's full JSON representation under a `data` attribute
    # alongside the key, which keeps this class simple and matches the
    # LocalStorage JSON semantics closely (easy to reason about / debug).

    def load_reports(self) -> list[Report]:
        items = self._scan_all(self._reports_table)
        reports: list[Report] = []
        for item in items:
            try:
                reports.append(Report.model_validate(json.loads(item["data"])))
            except Exception:
                logger.warning("Skipping malformed DynamoDB report item: %r", item)
        return reports

    def save_reports(self, reports: list[Report]) -> None:
        with self._reports_table.batch_writer() as batch:
            for report in reports:
                batch.put_item(
                    Item={
                        "report_id": report.report_id,
                        "data": json.dumps(report.model_dump(mode="json"), default=str),
                    }
                )

    def add_report(self, report: Report) -> None:
        self._reports_table.put_item(
            Item={
                "report_id": report.report_id,
                "data": json.dumps(report.model_dump(mode="json"), default=str),
            }
        )

    def report_exists(self, report_id: str) -> bool:
        resp = self._reports_table.get_item(Key={"report_id": report_id})
        return "Item" in resp

    def load_incidents(self) -> list[Incident]:
        items = self._scan_all(self._incidents_table)
        incidents: list[Incident] = []
        for item in items:
            try:
                incidents.append(Incident.model_validate(json.loads(item["data"])))
            except Exception:
                logger.warning("Skipping malformed DynamoDB incident item: %r", item)
        return incidents

    def save_incidents(self, incidents: list[Incident]) -> None:
        with self._incidents_table.batch_writer() as batch:
            for incident in incidents:
                batch.put_item(
                    Item={
                        "incident_id": incident.incident_id,
                        "data": json.dumps(incident.model_dump(mode="json"), default=str),
                    }
                )

    def get_incident(self, incident_id: str) -> Incident | None:
        resp = self._incidents_table.get_item(Key={"incident_id": incident_id})
        item = resp.get("Item")
        if not item:
            return None
        try:
            return Incident.model_validate(json.loads(item["data"]))
        except Exception:
            logger.warning("Malformed DynamoDB incident item for %s", incident_id)
            return None

    def get_all_incidents(self) -> list[Incident]:
        return self.load_incidents()

    def update_incident(self, incident: Incident) -> None:
        self._incidents_table.put_item(
            Item={
                "incident_id": incident.incident_id,
                "data": json.dumps(incident.model_dump(mode="json"), default=str),
            }
        )

    def reset(self) -> None:
        if not config.ALLOW_RESET:
            raise RuntimeError("Reset is disabled (ALLOW_RESET=false); refusing to clear DynamoDB tables.")
        for table, key_name in (
            (self._reports_table, "report_id"),
            (self._incidents_table, "incident_id"),
        ):
            items = self._scan_all(table)
            with table.batch_writer() as batch:
                for item in items:
                    batch.delete_item(Key={key_name: item[key_name]})

    @staticmethod
    def _scan_all(table) -> list[dict]:
        items: list[dict] = []
        resp = table.scan()
        items.extend(resp.get("Items", []))
        while "LastEvaluatedKey" in resp:
            resp = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
            items.extend(resp.get("Items", []))
        return items
