"""
Semantic text similarity abstraction.

`SemanticMatcher` is the interface the rest of the app depends on. This
module provides `LocalSemanticMatcher`, a pure-stdlib TF-IDF + cosine
similarity implementation that needs no internet access and no model
download. `aws/bedrock.py` provides `BedrockSemanticMatcher`, which
implements the same interface using Bedrock embeddings.

`get_semantic_matcher()` picks the right implementation based on
config.USE_BEDROCK, falling back to local if Bedrock is unavailable.
"""

from __future__ import annotations

import math
import re
from abc import ABC, abstractmethod
from collections import Counter

_WORD_RE = re.compile(r"[a-zA-Z]+")

_STOPWORDS = {
    "a", "an", "the", "near", "beside", "around", "close", "to", "at", "in",
    "on", "is", "was", "are", "were", "reported", "report", "seen", "of",
    "and", "has", "have", "been", "being", "by", "from", "with", "this",
    "that", "it", "as", "for",
}

# Deterministic synonym canonicalization: real reports describing the same
# incident routinely use different words for the same concept ("collision"
# vs "accident", "waterlogging" vs "flooded", "ambulance" vs "paramedics").
# Plain TF-IDF cosine treats these as completely unrelated tokens, which
# was measured (see evaluation/evaluate.py) to be a major cause of
# under-merging real paraphrases. Mapping each token to a canonical form
# before vectorizing keeps the method fully deterministic and explainable
# (no embeddings/models) while letting genuine synonyms contribute
# overlapping dimensions instead of none at all.
_SYNONYM_GROUPS: list[list[str]] = [
    # "smoke" is grouped with fire here to match extraction.py's own
    # modeling decision (smoke keywords classify as event_type "fire" --
    # see extraction.py) -- the semantic layer should treat them as the
    # same concept for the same reason the extractor does.
    ["fire", "flame", "flames", "blaze", "ablaze", "burning", "smoke", "smoky"],
    ["flood", "flooding", "flooded", "waterlogging", "waterlogged"],
    ["accident", "collision", "collided", "crash", "crashed"],
    ["traffic", "congestion", "gridlock", "jam", "blocked", "stopped", "halted"],
    ["ambulance", "paramedic", "paramedics"],
    ["police", "cop", "cops", "officer", "officers"],
    ["fallen", "uprooted", "down"],
    ["power", "electricity", "blackout"],
    ["outage", "cut", "failure"],
    ["emergency", "responder", "responders", "rescue", "arriving", "arrived", "dispatched"],
    ["engine", "engines", "firefighter", "firefighters", "fireman", "firemen"],
]

_SYNONYM_CANONICAL: dict[str, str] = {
    word: group[0] for group in _SYNONYM_GROUPS for word in group
}


def _tokenize(text: str) -> list[str]:
    words = _WORD_RE.findall(text.lower())
    return [_SYNONYM_CANONICAL.get(w, w) for w in words if w not in _STOPWORDS and len(w) > 1]


class SemanticMatcher(ABC):
    """Interface: compare two pieces of text and return a [0, 1] score."""

    @abstractmethod
    def similarity(self, text1: str, text2: str) -> float:
        """Return a similarity score between text1 and text2 in [0, 1]."""
        raise NotImplementedError

    def best_similarity(self, text: str, corpus: list[str]) -> float:
        """Convenience: highest similarity of `text` against any item in
        `corpus`. Returns 0.0 for an empty corpus."""
        if not corpus:
            return 0.0
        return max(self.similarity(text, other) for other in corpus)


class LocalSemanticMatcher(SemanticMatcher):
    """
    Lightweight local TF-IDF + cosine similarity implementation.

    Uses a two-document TF-IDF (IDF computed over just the pair being
    compared) which keeps the implementation simple, deterministic, and
    independent of any global corpus state -- appropriate for pairwise
    "does this report belong to this incident" comparisons.
    """

    def similarity(self, text1: str, text2: str) -> float:
        tokens1 = _tokenize(text1)
        tokens2 = _tokenize(text2)

        if not tokens1 or not tokens2:
            return 0.0

        if tokens1 == tokens2:
            return 1.0

        documents = [tokens1, tokens2]
        vocab = set(tokens1) | set(tokens2)

        # Document frequency per term across the 2-document corpus.
        df: dict[str, int] = {}
        for term in vocab:
            df[term] = sum(1 for doc in documents if term in doc)

        def vectorize(tokens: list[str]) -> dict[str, float]:
            tf = Counter(tokens)
            total = len(tokens)
            vec: dict[str, float] = {}
            for term, count in tf.items():
                term_freq = count / total
                # +1 smoothing avoids div-by-zero / log(1) == 0 collapse
                idf = math.log((1 + len(documents)) / (1 + df[term])) + 1
                vec[term] = term_freq * idf
            return vec

        vec1 = vectorize(tokens1)
        vec2 = vectorize(tokens2)

        dot = sum(vec1.get(t, 0.0) * vec2.get(t, 0.0) for t in vocab)
        norm1 = math.sqrt(sum(v * v for v in vec1.values()))
        norm2 = math.sqrt(sum(v * v for v in vec2.values()))

        if norm1 == 0.0 or norm2 == 0.0:
            return 0.0

        cosine = dot / (norm1 * norm2)
        # Blend in a small raw token-overlap (Jaccard) term. Pure TF-IDF
        # cosine on very short texts (a handful of words) can be noisy;
        # blending stabilizes it without changing the overall approach.
        set1, set2 = set(tokens1), set(tokens2)
        jaccard = len(set1 & set2) / len(set1 | set2) if (set1 | set2) else 0.0

        score = 0.7 * cosine + 0.3 * jaccard
        return max(0.0, min(1.0, score))


_matcher_instance: SemanticMatcher | None = None


def get_semantic_matcher() -> SemanticMatcher:
    """
    Return the configured SemanticMatcher singleton.

    Honors config.USE_BEDROCK; falls back to LocalSemanticMatcher if
    Bedrock is requested but unavailable (e.g. missing boto3 credentials),
    so a misconfigured environment never breaks local functionality.
    """
    global _matcher_instance
    if _matcher_instance is not None:
        return _matcher_instance

    import config

    if config.USE_BEDROCK:
        try:
            from aws.bedrock import BedrockSemanticMatcher

            _matcher_instance = BedrockSemanticMatcher()
        except Exception:
            _matcher_instance = LocalSemanticMatcher()
    else:
        _matcher_instance = LocalSemanticMatcher()

    return _matcher_instance
