"""
Evaluation script.

Reads backend/evaluation/synthetic_reports.json (generate it first with
generate_data.py), feeds every report through the REAL incident engine
(the same incident_engine.process_report used by the API), and scores the
resulting predicted incident clusters against ground_truth_incident_id.

`ground_truth_incident_id` is used ONLY here, for scoring. It is stripped
before being handed to the engine's extraction/matching code path is
irrelevant anyway -- incident_engine.process_report never reads that
field from the Report object it's given, by construction (see
matching.py / incident_engine.py).

--- Metric definitions (pairwise co-reference evaluation) ---

For every unordered pair of reports (a, b):

  - same_gt   = they share the same ground_truth_incident_id
  - same_pred = the engine placed them in the same predicted incident_id
                (an UNCERTAIN report is NOT merged into anything, so it is
                only ever in a singleton predicted cluster)

  True Positive  (correct merge): same_gt AND same_pred
  False Positive (false merge):   same_pred AND NOT same_gt
  False Negative (false split):   same_gt AND NOT same_pred

  precision = TP / (TP + FP)   -- of the pairs we merged, how many were right
  recall    = TP / (TP + FN)   -- of the pairs that should merge, how many did we

This is the standard pairwise clustering precision/recall used for
coreference / entity-resolution style evaluation, and it directly
penalizes both over-merging (false merges) and under-merging (false
splits) at the level the spec asks for.

Run:
    python backend/evaluation/evaluate.py
"""

from __future__ import annotations

import sys
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import json  # noqa: E402

import incident_engine  # noqa: E402
from database import LocalStorage  # noqa: E402
from models import Report  # noqa: E402

SYNTHETIC_DATA_PATH = Path(__file__).resolve().parent / "synthetic_reports.json"


def load_synthetic_reports() -> list[dict]:
    if not SYNTHETIC_DATA_PATH.exists():
        raise FileNotFoundError(
            f"{SYNTHETIC_DATA_PATH} not found. Run generate_data.py first."
        )
    raw = json.loads(SYNTHETIC_DATA_PATH.read_text(encoding="utf-8"))
    raw.sort(key=lambda r: r["timestamp"])
    return raw


def run_pipeline(raw_reports: list[dict]) -> tuple[dict[str, str], dict[str, str], float]:
    """
    Feeds every report through the real engine, in an isolated in-memory-
    on-disk storage (a temp JSON pair) so this never touches the live
    app's data/reports.json or data/incidents.json.

    Returns:
      predicted: report_id -> predicted_incident_id (or "UNCERTAIN:<id>"
                 sentinel for reports the engine declined to merge)
      ground_truth: report_id -> ground_truth_incident_id
      total_seconds: total wall-clock processing time
    """
    import tempfile

    tmp_dir = Path(tempfile.mkdtemp(prefix="incidentpulse_eval_"))
    storage = LocalStorage(
        reports_path=tmp_dir / "reports.json",
        incidents_path=tmp_dir / "incidents.json",
    )
    storage.reset()

    predicted: dict[str, str] = {}
    ground_truth: dict[str, str] = {}

    start = time.perf_counter()
    for item in raw_reports:
        gt_id = item["ground_truth_incident_id"]
        ground_truth[item["report_id"]] = gt_id

        # Build the Report WITHOUT ground truth reaching the engine's
        # decision path -- we keep it on the object only because the
        # Report model schema allows it for storage/evaluation purposes;
        # process_report()/matching.py never read it.
        report = Report(
            report_id=item["report_id"],
            text=item["text"],
            timestamp=item["timestamp"],
            location=item.get("location"),
            source=item.get("source", "citizen_report"),
            ground_truth_incident_id=gt_id,
        )
        storage.add_report(report)
        result = incident_engine.process_report(storage, report)

        if result.incident_id:
            predicted[report.report_id] = result.incident_id
        else:
            # UNCERTAIN: give every such report its own unique singleton
            # cluster id so it never spuriously "matches" another
            # UNCERTAIN report.
            predicted[report.report_id] = f"__UNCERTAIN__:{report.report_id}"

    total_seconds = time.perf_counter() - start
    return predicted, ground_truth, total_seconds


def score(predicted: dict[str, str], ground_truth: dict[str, str]) -> dict:
    report_ids = list(ground_truth.keys())

    tp = fp = fn = 0

    for a, b in combinations(report_ids, 2):
        same_gt = ground_truth[a] == ground_truth[b]
        same_pred = predicted[a] == predicted[b]

        if same_pred and same_gt:
            tp += 1
        elif same_pred and not same_gt:
            fp += 1
        elif same_gt and not same_pred:
            fn += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    return {
        "correct_merges_tp": tp,
        "false_merges_fp": fp,
        "false_splits_fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def main() -> None:
    raw_reports = load_synthetic_reports()
    print(f"Loaded {len(raw_reports)} synthetic reports.")

    predicted, ground_truth, total_seconds = run_pipeline(raw_reports)

    metrics = score(predicted, ground_truth)
    avg_ms = (total_seconds / len(raw_reports)) * 1000 if raw_reports else 0.0

    n_predicted_clusters = len(set(predicted.values()))
    n_gt_clusters = len(set(ground_truth.values()))

    print("\n" + "=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print(f"Reports processed        : {len(raw_reports)}")
    print(f"Ground-truth incidents   : {n_gt_clusters}")
    print(f"Predicted incidents      : {n_predicted_clusters}")
    print(f"Total processing time    : {total_seconds:.3f}s")
    print(f"Average time / report    : {avg_ms:.2f}ms")
    print("-" * 60)
    print(f"Correct merges (TP pairs): {metrics['correct_merges_tp']}")
    print(f"False merges   (FP pairs): {metrics['false_merges_fp']}")
    print(f"False splits   (FN pairs): {metrics['false_splits_fn']}")
    print(f"Precision                : {metrics['precision']}")
    print(f"Recall                   : {metrics['recall']}")
    print(f"F1                       : {metrics['f1']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
