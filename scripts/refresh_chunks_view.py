"""One-shot ArangoSearch view-link refresh for customer360_chunks_search_view.

Why this exists: the delete-first Layer-3 truncate (build_unstructured.py Stage 3.5)
clears customer360_Chunks and orchestrate re-inserts fresh chunks with NEW _ids.
The ArangoSearch view's inverted index still holds dangling references to the
pre-truncate chunk _ids, so BM25 search ranks stale _ids that no longer materialize
-> `AQL: ... failed to materialize document ... NotFound [MaterializeNode]`, which
breaks every hybrid/dual-graph retrieval path.

A plain `updateProperties` merge with the SAME link config does NOT force a full
re-index. The fix is a DROP of the customer360_Chunks link, a settle, then a RE-ADD
with the captured config -> a full re-index over the current chunks.

Scope guard: this script ONLY ever touches the single link `customer360_Chunks` on
the single view `customer360_chunks_search_view`. It never reconfigures any other
view, link, analyzer, or the structured graph.

Usage:
    python scripts/refresh_chunks_view.py          # capture -> drop -> settle -> re-add -> probe
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env", override=True)  # override=True mandatory (stale-shell guard)

from arango import ArangoClient  # noqa: E402

VIEW_NAME = "customer360_chunks_search_view"
CHUNKS = "customer360_Chunks"
# The proven link config (matches agent/test/hybridSpike.test.ts::ensureChunksView).
CHUNKS_LINK = {"fields": {"content": {"analyzers": ["text_en"]}}, "includeAllFields": False}
SETTLE_S = 5.0


def _arango_cfg() -> dict:
    url = os.environ.get("ARANGO_URL") or os.environ["ARANGO_ENDPOINT"]
    user = os.environ.get("ARANGO_USER") or os.environ["ARANGO_USERNAME"]
    password = os.environ["ARANGO_PASSWORD"]
    db = os.environ.get("ARANGO_DB") or os.environ.get("ARANGO_DATABASE") or "customer360"
    return {"url": url.rstrip("/"), "user": user, "password": password, "db": db}


def _get_db(cfg: dict):
    auth = httpx.post(
        f"{cfg['url']}/_open/auth",
        json={"username": cfg["user"], "password": cfg["password"]},
        timeout=30,
    )
    auth.raise_for_status()
    jwt = auth.json()["jwt"]
    return ArangoClient(hosts=cfg["url"]).db(cfg["db"], user_token=jwt)


def refresh_chunks_view(db) -> dict:
    """Capture-first, then drop -> settle -> re-add the customer360_Chunks link only."""
    view = db.view(VIEW_NAME)  # raises if absent
    # 1. CAPTURE FIRST — record current definition so it could be restored if needed.
    props = view  # python-arango db.view() returns the full properties dict
    links_before = (props.get("links") or {})
    captured = links_before.get(CHUNKS)
    print(f"[view] CAPTURED current {VIEW_NAME} links keys: {sorted(links_before.keys())}")
    print(f"[view] CAPTURED {CHUNKS} link config: {json.dumps(captured)}")

    # 2. DROP the chunks link ONLY (None drops a single link; other links untouched).
    print(f"[view] dropping {CHUNKS} link ...")
    db.update_view(VIEW_NAME, {"links": {CHUNKS: None}})
    time.sleep(SETTLE_S)

    after_drop = (db.view(VIEW_NAME).get("links") or {})
    if CHUNKS in after_drop:
        raise SystemExit(f"[view] FAIL — {CHUNKS} link still present after drop: {after_drop.get(CHUNKS)!r}")
    print(f"[view] link dropped; remaining links: {sorted(after_drop.keys())}")

    # 3. RE-ADD with the proven config -> forces a full re-index over current chunks.
    print(f"[view] re-adding {CHUNKS} link (fields.content.analyzers=['text_en']) ...")
    db.update_view(VIEW_NAME, {"links": {CHUNKS: CHUNKS_LINK}})
    time.sleep(SETTLE_S)

    after_readd = (db.view(VIEW_NAME).get("links") or {})
    if CHUNKS not in after_readd:
        raise SystemExit(f"[view] FAIL — {CHUNKS} link missing after re-add")
    print(f"[view] link re-added; links now: {sorted(after_readd.keys())}")
    return {"captured": captured, "links_after": sorted(after_readd.keys())}


def probe_bm25(db, *, attempts: int = 6, interval_s: float = 5.0) -> bool:
    """BM25 probe: SEARCH the view, then materialize the matched chunk's content.
    A stale index would throw NotFound [MaterializeNode]; a healthy re-index returns
    >=1 live chunk. Retries to allow the re-index to finish committing."""
    aql = (
        "FOR c IN @@view "
        "  SEARCH ANALYZER(c.content IN TOKENS(@q, 'text_en'), 'text_en') "
        "  SORT BM25(c) DESC "
        "  LIMIT 3 "
        "  RETURN { id: c._id, len: LENGTH(c.content) }"
    )
    last_err = None
    for i in range(1, attempts + 1):
        try:
            cur = db.aql.execute(aql, bind_vars={"@view": VIEW_NAME, "q": "renewal escalation churn risk"})
            rows = list(cur)
            live = [r for r in rows if r.get("id") and (r.get("len") or 0) > 0]
            if live:
                print(f"[probe] OK — BM25 materialized {len(live)} live chunk(s): {[r['id'] for r in live]}")
                return True
            print(f"[probe] attempt {i}/{attempts}: 0 rows yet (re-index settling) ...")
        except Exception as exc:  # noqa: BLE001 — surface the materialize error if it persists
            last_err = exc
            print(f"[probe] attempt {i}/{attempts}: {type(exc).__name__}: {str(exc)[:200]}")
        if i < attempts:
            time.sleep(interval_s)
    if last_err is not None:
        raise SystemExit(f"[probe] FAIL — BM25 probe still erroring after re-add: {last_err}")
    raise SystemExit("[probe] FAIL — BM25 probe returned 0 live chunks after re-add (index not populated)")


def main() -> int:
    cfg = _arango_cfg()
    db = _get_db(cfg)
    print(f"[view] refreshing {VIEW_NAME} on db={cfg['db']} ...")
    refresh_chunks_view(db)
    probe_bm25(db)
    print("[view] DONE — chunks_search_view link refreshed; BM25 materializes live chunks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
