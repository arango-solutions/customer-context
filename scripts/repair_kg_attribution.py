"""Plan 03-05 repair — fix AutoGraph file_name<->content scramble in customer360_Documents.

AutoGraph desyncs Document.file_name from content on this service (the mapping is a
permutation — see memory autograph-filename-scramble). Manifest-keyed stamping therefore
mis-attributes ~78/105 docs. This script re-derives each Document's TRUE identity from its
own content and re-stamps file_name/module/account_id/entity_id/citable_url:

  - header docs (84/105): parse the embedded `<!-- module=.. account_id=.. entity_id=..
    citable_url=.. -->` header → look up the canonical manifest entry by citable_url.
  - headerless docs (21/105: 17 pdf + 4 header-stripped txt): the remaining 21 manifest
    entries are theirs by bijection; pair each via best content overlap (Jaccard) against
    the source files on disk (PDF text via PyMuPDF).

Then verifies the scramble is 0 (every Document.file_name == its true manifest key, and the
set of file_names is exactly the manifest key set).

Usage:
    python scripts/repair_kg_attribution.py --dry-run   # show the remap + match scores
    python scripts/repair_kg_attribution.py             # apply the re-stamp
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
load_dotenv(_REPO_ROOT / ".env", override=True)

from arango import ArangoClient  # noqa: E402

_MANIFEST = _REPO_ROOT / "data_gen" / "output" / "manifest.json"
_UNSTRUCTURED = _REPO_ROOT / "data_gen" / "output" / "unstructured"
KG_DOCUMENTS = "customer360_Documents"
_HDR = re.compile(r"citable_url=(\S+)")
_WORD = re.compile(r"[a-z0-9]+")


def _get_db():
    url = (os.environ.get("ARANGO_URL") or os.environ["ARANGO_ENDPOINT"]).rstrip("/")
    user = os.environ.get("ARANGO_USER") or os.environ["ARANGO_USERNAME"]
    pw = os.environ["ARANGO_PASSWORD"]
    db = os.environ.get("ARANGO_DB") or os.environ.get("ARANGO_DATABASE") or "customer360"
    jwt = httpx.post(f"{url}/_open/auth", json={"username": user, "password": pw}, timeout=30).json()["jwt"]
    return ArangoClient(hosts=url).db(db, user_token=jwt)


def _words(text: str, limit: int = 2000) -> set:
    return set(_WORD.findall((text or "").lower())[:limit])


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _source_text(file_name: str, module: str) -> str:
    path = _UNSTRUCTURED / module / file_name
    if not path.exists():
        return ""
    if file_name.lower().endswith(".pdf"):
        try:
            import fitz  # PyMuPDF
            with fitz.open(path) as doc:
                return "\n".join(page.get_text() for page in doc)
        except Exception:
            return ""
    txt = path.read_text(encoding="utf-8", errors="ignore")
    # strip the leading HTML-comment identity header if present
    return re.sub(r"^\s*<!--.*?-->", "", txt, count=1, flags=re.DOTALL)


def main() -> int:
    ap = argparse.ArgumentParser(description="Repair AutoGraph file_name<->content scramble")
    ap.add_argument("--dry-run", action="store_true", help="show remap + match scores, do not write")
    args = ap.parse_args()

    manifest = json.loads(_MANIFEST.read_text(encoding="utf-8"))
    by_url = {v.get("citable_url", "").rstrip("/"): k for k, v in manifest.items() if v.get("citable_url")}

    db = _get_db()
    docs = list(db.aql.execute(f"FOR d IN {KG_DOCUMENTS} RETURN {{key:d._key, fn:d.file_name, c:d.content}}"))

    remap: dict[str, str] = {}  # doc _key -> true manifest file_name
    claimed: set[str] = set()
    headerless: list[dict] = []

    # Phase 1 — header docs (deterministic via embedded citable_url)
    for d in docs:
        m = _HDR.search((d["c"] or "")[:400])
        if m:
            true_fn = by_url.get(m.group(1).rstrip(">").strip())
            if true_fn:
                remap[d["key"]] = true_fn
                claimed.add(true_fn)
                continue
        headerless.append(d)

    remaining = [k for k in manifest if k not in claimed]
    print(f"[repair] header docs matched: {len(remap)} | headerless: {len(headerless)} | remaining manifest: {len(remaining)}")
    if len(headerless) != len(remaining):
        print(f"[repair] WARN — headerless ({len(headerless)}) != remaining ({len(remaining)}); bijection broken", file=sys.stderr)

    # Phase 2 — headerless docs paired to remaining manifest entries by content overlap
    src_words = {fn: _words(_source_text(fn, manifest[fn].get("module", ""))) for fn in remaining}
    doc_words = {d["key"]: _words(d["c"]) for d in headerless}
    # greedy best-match with uniqueness
    pairs = []
    for d in headerless:
        for fn in remaining:
            pairs.append((_jaccard(doc_words[d["key"]], src_words[fn]), d["key"], fn))
    pairs.sort(reverse=True)
    used_keys, used_fns = set(), set()
    match_report = []
    for score, key, fn in pairs:
        if key in used_keys or fn in used_fns:
            continue
        used_keys.add(key); used_fns.add(fn)
        remap[key] = fn
        match_report.append((score, key, fn))
    for score, key, fn in sorted(match_report):
        flag = "  <-- LOW" if score < 0.30 else ""
        print(f"[repair]   pdf/txt match score={score:.2f} -> {fn[:60]}{flag}")

    # Build the stamp set from true identity (manifest is authoritative)
    updates = []
    for d in docs:
        true_fn = remap.get(d["key"])
        if not true_fn:
            print(f"[repair] WARN — no true identity for doc {d['key']} (current fn={d['fn']})", file=sys.stderr)
            continue
        meta = manifest[true_fn]
        updates.append({
            "_key": d["key"],
            "file_name": true_fn,
            "module": meta.get("module"),
            "account_id": meta.get("account_id"),
            "entity_id": meta.get("entity_id"),
            "citable_url": meta.get("citable_url"),
        })

    changed = sum(1 for d, u in zip(sorted(docs, key=lambda x: x["key"]), sorted(updates, key=lambda x: x["_key"])) )
    n_fixed = sum(1 for d in docs for u in updates if u["_key"] == d["key"] and u["file_name"] != d["fn"])
    print(f"[repair] total docs: {len(docs)} | stamps prepared: {len(updates)} | file_name corrections: {n_fixed}")

    if args.dry_run:
        print("[repair] DRY-RUN — no writes")
        return 0

    # Apply via AQL UPDATE keyed by _key (bind_vars only)
    aql = (
        "FOR u IN @updates "
        f"  UPDATE u._key WITH {{ file_name: u.file_name, module: u.module, "
        "    account_id: u.account_id, entity_id: u.entity_id, citable_url: u.citable_url } "
        f"  IN {KG_DOCUMENTS} RETURN 1"
    )
    n = len(list(db.aql.execute(aql, bind_vars={"updates": updates})))
    print(f"[repair] applied {n} updates")

    # Verify scramble == 0
    docs2 = list(db.aql.execute(f"FOR d IN {KG_DOCUMENTS} RETURN {{fn:d.file_name, c:d.content}}"))
    bad = 0
    def acct(s):
        s = s or ""
        return "NW" if ("northwind" in s or "0d5b5863" in s) else ("ME" if ("meridian" in s or "9eff6d7b" in s) else "?")
    for d in docs2:
        m = _HDR.search((d["c"] or "")[:400])
        if m and acct(d["fn"]) != "?" and acct(m.group(1)) != "?" and acct(d["fn"]) != acct(m.group(1)):
            bad += 1
    fns = [d["fn"] for d in docs2]
    perm_ok = sorted(fns) == sorted(manifest.keys())
    print(f"[repair] VERIFY — header-account mismatches: {bad} | file_name set == manifest keys: {perm_ok} | dupes: {len(fns)-len(set(fns))}")
    if bad == 0 and perm_ok and len(fns) == len(set(fns)):
        print("[repair] PASSED — scramble repaired, attribution now content-derived")
        return 0
    print("[repair] FAILED — residual scramble; inspect above", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
