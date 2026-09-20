"""
Bedrock-backed abstractions.

Provides:

- BedrockSemanticMatcher: implements the SemanticMatcher interface using
  Bedrock text embeddings (Titan Embeddings by default) with cosine
  similarity, instead of local TF-IDF.
- generate_explanation(): optionally rewords an already-computed,
  verified structured change into a nicer sentence using a Bedrock LLM.
  It is only ever given verified structured facts -- it cannot invent
  evidence, and its output is never used to decide whether a change is
  significant.

Both fail gracefully: if Bedrock is unreachable or misconfigured, callers
(semantic_matcher.get_semantic_matcher / change_engine callers) fall back
to local, deterministic behavior. LOCAL MODE MUST WORK WITHOUT BEDROCK,
and USE_BEDROCK defaults to false.
"""

from __future__ import annotations

import json
import logging
import math

import config
from semantic_matcher import LocalSemanticMatcher, SemanticMatcher

logger = logging.getLogger("incidentpulse.bedrock")


def _get_bedrock_client():
    import boto3

    return boto3.client("bedrock-runtime", region_name=config.AWS_REGION)


class BedrockSemanticMatcher(SemanticMatcher):
    """
    Semantic similarity via Bedrock embeddings + cosine similarity.

    On any failure (network, credentials, model access, throttling), logs
    a warning and delegates to a LocalSemanticMatcher instance so the
    caller never sees an exception propagate out of similarity().
    """

    def __init__(self):
        self._client = _get_bedrock_client()
        self._fallback = LocalSemanticMatcher()
        self._cache: dict[str, list[float]] = {}

    def _embed(self, text: str) -> list[float] | None:
        if text in self._cache:
            return self._cache[text]
        try:
            response = self._client.invoke_model(
                modelId=config.BEDROCK_EMBEDDING_MODEL_ID,
                body=json.dumps({"inputText": text}),
                contentType="application/json",
                accept="application/json",
            )
            payload = json.loads(response["body"].read())
            embedding = payload.get("embedding")
            if not embedding:
                return None
            self._cache[text] = embedding
            return embedding
        except Exception as exc:
            logger.warning("Bedrock embedding call failed, falling back to local similarity: %s", exc)
            return None

    @staticmethod
    def _cosine(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return max(0.0, min(1.0, dot / (norm_a * norm_b)))

    def similarity(self, text1: str, text2: str) -> float:
        emb1 = self._embed(text1)
        emb2 = self._embed(text2)
        if emb1 is None or emb2 is None:
            return self._fallback.similarity(text1, text2)
        return self._cosine(emb1, emb2)


def generate_explanation(structured_facts: dict) -> str | None:
    """
    Optionally improve the wording of an already-computed change
    description using a Bedrock LLM. `structured_facts` should contain
    only verified fields (type/before/after/evidence_report_id/etc.) --
    the model is instructed to use ONLY those facts and never invent
    additional details or evidence.

    Returns None (caller should use the deterministic description
    instead) on any failure or if USE_BEDROCK is False.
    """
    if not config.USE_BEDROCK:
        return None

    try:
        client = _get_bedrock_client()
        prompt = (
            "Rewrite the following verified incident-change facts as ONE "
            "concise, factual sentence for an incident report. Do not add "
            "any information not present in the facts. Do not invent "
            "evidence or details.\n\nFacts (JSON):\n"
            f"{json.dumps(structured_facts, default=str)}\n\nSentence:"
        )
        response = client.invoke_model(
            modelId=config.BEDROCK_MODEL_ID,
            body=json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 100,
                    "messages": [{"role": "user", "content": prompt}],
                }
            ),
            contentType="application/json",
            accept="application/json",
        )
        payload = json.loads(response["body"].read())
        content = payload.get("content", [])
        text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
        sentence = "".join(text_parts).strip()
        return sentence or None
    except Exception as exc:
        logger.warning("Bedrock explanation generation failed, using deterministic description: %s", exc)
        return None
