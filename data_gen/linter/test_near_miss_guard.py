"""
Near-miss guard — empirical hybrid retrieval assertion (D-08).

For each of the 5 dual-graph questions (Q2, Q5, Q8, Q9, Q12), embeds all
generated unstructured documents using OpenAI text-embedding-3-small at 512
dimensions, runs RRF fusion of vector (cosine) + BM25 rankings using
AutoGraph's ReciprocalRankFusion, and asserts that the top-1 result is a
signal document, not a near-miss distractor.

This test requires:
- OPENAI_API_KEY set in environment (via .env or shell)
- The AutoGraph corpus_graph package available at /Users/plosiewicz/Desktop/autograph
- Generated documents in data_gen/output/unstructured/

Skips gracefully when OPENAI_API_KEY is absent.

AutoGraph path note: sys.path.insert is used here because corpus_graph is a
local checkout at a known path, not an installed package.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env before anything else so OPENAI_API_KEY is available.
# override=True is required: without it a stale shell OPENAI_API_KEY shadows
# the valid .env key, causing 401 AuthenticationError (plan 02-05 note).
_REPO_ROOT = Path(__file__).parent.parent.parent
load_dotenv(_REPO_ROOT / ".env", override=True)

# Add the AutoGraph local checkout to the import path so we can reuse
# its ReciprocalRankFusion implementation (avoids re-implementing RRF).
sys.path.insert(0, "/Users/plosiewicz/Desktop/autograph")

import pytest

# ---------------------------------------------------------------------------
# Constants matching AutoGraph defaults (spike 001 confirmed dim=512)
# ---------------------------------------------------------------------------

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 512  # Matryoshka truncation to match AutoGraph's default

# Question texts used as retrieval queries — themes only (exact phrasing in Phase 6)
QUESTION_TEXTS = {
    "Q12": (
        "Account X looks green on every usage metric — are they actually happy? "
        "Is there a contradiction between the structured data and the unstructured signals?"
    ),
    "Q2": (
        "Which renewals next quarter are at risk, and WHY? "
        "What is the underlying driver of the renewal risk?"
    ),
    "Q9": (
        "Is the champion still engaged on this account? "
        "How often have they been in contact recently?"
    ),
    "Q5": (
        "Which Enterprise customers are ready for ArangoGraph or the GenAI suite, "
        "and what is the documented trigger for the expansion?"
    ),
    "Q8": (
        "What did we promise this customer and did we deliver? "
        "Are there any commitments made outside of CRM or formal contracts?"
    ),
}


# ---------------------------------------------------------------------------
# Embedding + retrieval helpers
# ---------------------------------------------------------------------------


def _require_api_key():
    """Skip the test if OPENAI_API_KEY is not set in the environment."""
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set — skipping near-miss guard (requires OpenAI API)")


def _embed_texts(texts: list) -> "np.ndarray":
    """Embed a list of texts using EMBED_MODEL at EMBED_DIM dimensions."""
    import numpy as np
    from openai import OpenAI

    client = OpenAI()
    resp = client.embeddings.create(
        model=EMBED_MODEL,
        input=texts,
        dimensions=EMBED_DIM,
    )
    return [e.embedding for e in resp.data]


def _cosine_rank(query_vec, corpus_vecs) -> list:
    """Return indices sorted by cosine similarity descending."""
    import numpy as np

    query_arr = np.array(query_vec)
    corpus_arr = np.array(corpus_vecs)
    norms = np.linalg.norm(corpus_arr, axis=1, keepdims=True)
    normed = corpus_arr / (norms + 1e-9)
    scores = normed @ query_arr
    return list(int(i) for i in np.argsort(scores)[::-1])


def _bm25_rank(query: str, docs: list) -> list:
    """Simple BM25 rank using term frequency (no external library required)."""
    import math
    import numpy as np
    from collections import Counter

    query_terms = set(query.lower().split())
    scores = []
    avg_dl = sum(len(d.split()) for d in docs) / max(len(docs), 1)

    for doc in docs:
        terms = Counter(doc.lower().split())
        dl = sum(terms.values())
        score = sum(
            (terms[t] * 2.5) / (terms[t] + 1.5 * (1 - 0.75 + 0.75 * dl / max(avg_dl, 1)))
            for t in query_terms
            if t in terms
        )
        scores.append(score)

    return list(int(i) for i in np.argsort(scores)[::-1])


def _load_unstructured_docs(unstructured_files: list) -> list:
    """
    Load text content from unstructured files.
    Returns list of {"file_name": str, "content": str}.
    """
    docs = []
    for path in unstructured_files:
        try:
            if path.suffix.lower() == ".pdf":
                import pdfplumber
                with pdfplumber.open(path) as pdf:
                    content = "".join(page.extract_text() or "" for page in pdf.pages)
            else:
                content = path.read_text(encoding="utf-8", errors="replace")
            if content.strip():
                docs.append({"file_name": path.name, "content": content})
        except Exception:
            pass  # Skip unreadable files; linter will catch extraction failures separately
    return docs


def _assert_signal_top1(question_text: str, docs: list, manifest: dict) -> None:
    """
    Embed all docs, run RRF (vector + BM25), and assert the top-1 result is
    a signal doc.

    Uses AutoGraph's ReciprocalRankFusion class to match the production
    retrieval pipeline as closely as possible.
    """
    from corpus_graph.rrf import ReciprocalRankFusion

    if not docs:
        pytest.skip("No unstructured docs available for near-miss guard")

    texts = [d["content"] for d in docs]
    q_embeddings = _embed_texts([question_text])
    corpus_embeddings = _embed_texts(texts)

    q_vec = q_embeddings[0]
    vector_ranks = _cosine_rank(q_vec, corpus_embeddings)
    bm25_ranks = _bm25_rank(question_text, texts)

    # Convert to RRF input format expected by AutoGraph's ReciprocalRankFusion
    semantic = [{"doc_id": docs[i]["file_name"]} for i in vector_ranks]
    lexical = [{"doc_id": docs[i]["file_name"]} for i in bm25_ranks]

    rrf = ReciprocalRankFusion(k=60)
    fused = rrf.fuse_results(semantic, lexical, top_k=5)

    if not fused:
        pytest.skip("RRF returned no results — corpus may be empty")

    top_doc_name = fused[0]["doc_id"]
    role = manifest.get(top_doc_name, {}).get("role")

    assert role == "signal", (
        f"Near-miss guard FAILED: top-1 result is '{top_doc_name}' (role={role!r}), "
        f"expected a signal doc. RRF top-5: {[f['doc_id'] for f in fused[:5]]}"
    )


# ---------------------------------------------------------------------------
# Near-miss guard tests (one per question)
# ---------------------------------------------------------------------------


def test_near_miss_guard_q12(load_manifest, load_unstructured_files):
    """
    Near-miss guard for Q12: Usage green / sentiment red.

    Top-1 retrieval for the Q12 question text must be a signal doc —
    not a near-miss (e.g. a positive CSM thread from before the escalation
    period with the same vocabulary).
    """
    _require_api_key()
    docs = _load_unstructured_docs(load_unstructured_files)
    _assert_signal_top1(QUESTION_TEXTS["Q12"], docs, load_manifest)


def test_near_miss_guard_q2(load_manifest, load_unstructured_files):
    """
    Near-miss guard for Q2: Renewal risk + WHY.

    Top-1 retrieval must be a signal doc (a Meridian renewal-risk document),
    not a near-miss (e.g. a successful Northwind renewal email).
    """
    _require_api_key()
    docs = _load_unstructured_docs(load_unstructured_files)
    _assert_signal_top1(QUESTION_TEXTS["Q2"], docs, load_manifest)


def test_near_miss_guard_q9(load_manifest, load_unstructured_files):
    """
    Near-miss guard for Q9: Champion engagement.

    Top-1 retrieval must be a signal doc (a disengagement email or Slack note),
    not a near-miss (e.g. an email thread showing high champion engagement
    from 18 months earlier).
    """
    _require_api_key()
    docs = _load_unstructured_docs(load_unstructured_files)
    _assert_signal_top1(QUESTION_TEXTS["Q9"], docs, load_manifest)


def test_near_miss_guard_q5(load_manifest, load_unstructured_files):
    """
    Near-miss guard for Q5: ArangoGraph / GenAI readiness.

    Top-1 retrieval must be a signal doc (the documented trigger — a Slack
    CSM note or success plan capturing scale pain or GenAI intent).
    """
    _require_api_key()
    docs = _load_unstructured_docs(load_unstructured_files)
    _assert_signal_top1(QUESTION_TEXTS["Q5"], docs, load_manifest)


def test_near_miss_guard_q8(load_manifest, load_unstructured_files):
    """
    Near-miss guard for Q8: Promise vs. delivery.

    Top-1 retrieval must be a signal doc (the unlogged promise email or
    meeting notes), not a noise doc (routine ops emails with no promise).
    """
    _require_api_key()
    docs = _load_unstructured_docs(load_unstructured_files)
    _assert_signal_top1(QUESTION_TEXTS["Q8"], docs, load_manifest)
