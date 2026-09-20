# IncidentPulse — Backend

Turns fragmented reports describing real-world events into continuously
updated incidents, with a live "what changed?" feed and timeline.

## Quick start (local mode, no AWS needed)

```bash
# From the repository root (do NOT cd into backend/ first):
pip install -r backend/requirements.txt

# Run the deterministic demo (matches the Market Road / Railway Station
# walkthrough from the spec):
python backend/main.py
# or explicitly:
python backend/main.py demo

# Start the API server (http://localhost:8000, docs at /docs):
python backend/main.py serve
```

Works out of the box on Windows, macOS and Linux — local mode uses only the
Python standard library plus FastAPI/Pydantic/boto3(unused unless AWS mode
is enabled); no model downloads, no internet access required.

## API

| Method | Path                              | Purpose                                   |
|--------|------------------------------------|--------------------------------------------|
| GET    | `/health`                          | Liveness + current config                  |
| POST   | `/reports`                         | Submit a report; runs the full pipeline    |
| GET    | `/incidents`                       | List incident summaries                    |
| GET    | `/incidents/{incident_id}`         | Full incident detail                       |
| GET    | `/incidents/{incident_id}/timeline`| Timeline only                              |
| POST   | `/reset`                           | Clear local test data                      |

Example:

```bash
curl -X POST http://localhost:8000/reports \
  -H "Content-Type: application/json" \
  -d '{"text": "Fire reported near Market Road", "location": {"lat": 15.49, "lng": 73.83}}'
```

## Pipeline

```
REPORT
  -> EVENT INFORMATION EXTRACTION   (extraction.py)
  -> CANDIDATE INCIDENT SEARCH      (matching.py: time + location gating)
  -> MATCHING                       (matching.py: weighted score)
  -> MERGE / CREATE / UNCERTAIN     (incident_engine.py)
  -> UPDATE INCIDENT STATE          (incident_engine.py)
  -> COMPARE PREVIOUS STATE         (change_engine.py)
  -> WHAT CHANGED?                  (change_engine.py)
  -> TIMELINE / EVIDENCE            (timeline.py)
  -> PERSISTENCE                    (database.py)
  -> API RESPONSE                   (api.py)
```

`ground_truth_incident_id` (present only on synthetic evaluation reports) is
never read by any file in this list — see `evaluation/evaluate.py` for how
it's used strictly after the fact, for scoring.

## Local vs AWS mode

Everything is controlled by environment variables (see `.env.example`); the
core engine (`incident_engine.py`, `matching.py`, `change_engine.py`) never
imports AWS-specific code directly — it depends only on the `StorageBackend`
and `SemanticMatcher` abstractions.

| Setting            | Local (default) | AWS                              |
|---------------------|------------------|-----------------------------------|
| `STORAGE_BACKEND`   | `local` (JSON files under `data/`) | `dynamodb` (`aws/dynamodb.py`) |
| `USE_BEDROCK`       | `false` (TF-IDF cosine similarity, `semantic_matcher.py`) | `true` (`aws/bedrock.py`) |

If AWS is misconfigured or unreachable, both `database.get_storage()` and
`semantic_matcher.get_semantic_matcher()` fall back to the local
implementation automatically rather than crashing the app.

Suggested AWS architecture:

```
Frontend -> API Gateway -> Lambda (lambda_handler.py, via Mangum)
                              |-- DynamoDB (reports, incidents)
                              |-- Bedrock (optional: similarity + wording)
```

## Evaluation

```bash
python backend/evaluation/generate_data.py --num-incidents 35
python backend/evaluation/evaluate.py
```

Computes pairwise precision/recall/F1 (see docstring in `evaluate.py` for
exact TP/FP/FN definitions) and average per-report processing time. No
numbers are hardcoded — everything is computed from the generated data.

## Tests

```bash
cd backend && python -m pytest tests/ -v
```

## Configuration

All tunables (time window, radius, weights, thresholds, event relationship
map) live in `config.py` and are overridable via environment variables.
