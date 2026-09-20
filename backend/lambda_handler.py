"""
AWS Lambda entry point.

Wraps the same FastAPI app (api.py) used locally with Mangum, so the exact
same route/handler code runs behind API Gateway + Lambda in AWS mode.

Lambda configuration:
    Handler: lambda_handler.handler
    Runtime: Python 3.12 (or matching your local version)
    Environment variables: STORAGE_BACKEND=dynamodb, USE_BEDROCK=true/false,
        AWS_REGION, DYNAMODB_REPORTS_TABLE, DYNAMODB_INCIDENTS_TABLE, etc.
        (see .env.example / the deployment notes)
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from mangum import Mangum  # noqa: E402

from api import app  # noqa: E402

handler = Mangum(app)
