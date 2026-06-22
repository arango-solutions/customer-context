"""
Regression suite locking in the 04-04 demo-critical gate fix (CR-01 / CR-02 / IN-03).

Proves the forbidden failure mode is gone in BOTH directions:
  - no false-PASS  — an unlinked / mis-linked demo-critical id forces exit 1, and
  - no permanent false-negative red — a correctly-built bridge PASSES all 9.

The two gates under test:
  - scripts.verify_entity_bridge.check_demo_critical (structured same_as linkage)
  - scripts.verify_coref_eval.evaluate_demo_critical_coref + resolve_demo_critical
    (same_as bridge path: hub canonical_id == expected_id; NOT the KG entity_id stamp)

NO live ArangoDB is used — an in-process FakeDB satisfies the narrow surface the
gates touch: has_collection(name) -> bool and aql.execute(aql, bind_vars=...) ->
iterable[dict]. The FakeDB is driven by a per-id "bridge model" the fixtures build;
each query inspects the AQL text + bind_vars and returns the canned projection that
mirrors the real RETURN shape.
"""

import sys
from pathlib import Path

import pytest

# Repo root on sys.path so `import scripts...` resolves under pytest.
_REPO_ROOT = Path(__file__).parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.demo_critical import DEMO_CRITICAL_IDS, DEMO_CRITICAL_ENTITIES  # noqa: E402
from scripts import verify_entity_bridge as veb  # noqa: E402
from scripts import verify_coref_eval as vce  # noqa: E402

# Convenience handles for the 3 ground-truth-covered ids.
OKAFOR = "633f43bd-5cbd-579e-9105-2ded0f2e7c76"
BROOKS = "135970e6-29ec-5bcb-8cd1-887973aa326d"
VANCE = "ead03ac6-14ab-5dd9-8bf8-794c507ff628"

# Real ground-truth mentions (from manifest.json) — the surface-form check uses these.
GT_MENTIONS = {
    OKAFOR: "Ockafar",
    BROOKS: "Brookes",
    VANCE: "Vaance",
}


# ---------------------------------------------------------------------------
# Bridge model + FakeDB
# ---------------------------------------------------------------------------


class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def __iter__(self):
        return iter(self._rows)

    def __next__(self):
        if not self._rows:
            raise StopIteration
        return self._rows.pop(0)


class _AQL:
    def __init__(self, db):
        self._db = db

    def execute(self, aql, bind_vars=None):
        return _Cursor(self._db._answer(aql, bind_vars or {}))


class FakeDB:
    """
    In-process fake. `model` maps each demo-critical id -> dict:
      {
        "has_hub": bool,                 # a hub with canonical_id == id exists
        "structured_linked": bool,       # >=1 structured-leaf same_as edge -> that hub
        "reached": bool,                 # >=1 same_as edge reaches that hub (coref)
        "edges": [{"surface_form": str, "match_method": str}, ...],
        "kg_stamped": bool,              # entity_id == id stamped on a KG row
        "wrong_canonical_id": str|None,  # a leaf for id resolves to a DIFFERENT hub
      }
    Collections present default to all the gates need; override via `collections`.
    """

    def __init__(self, model, collections=None):
        self.model = model
        self.aql = _AQL(self)
        self._collections = collections or {
            "customer360_Entities",
            "canonical_entities",
            "same_as",
            "Account",
            "Contact",
            "Contract",
        }

    def has_collection(self, name):
        return name in self._collections

    def _answer(self, aql, bind_vars):
        ids = bind_vars.get("demo_critical_ids") or bind_vars.get("ids") or []

        # _detect_mislinks (coref) — distinctive: filters on wrong canonical_id
        if "hub.canonical_id != id" in aql:
            rows = []
            for i in ids:
                wrong = self.model.get(i, {}).get("wrong_canonical_id")
                if wrong:
                    rows.append({"id": i, "wrong_canonical_id": wrong})
            return rows

        # _resolve_ids_via_bridge (coref) — distinctive: RETURNs edges list
        if "reached: hub != null AND LENGTH(edges)" in aql or "RETURN { id: id, reached:" in aql:
            rows = []
            for i in ids:
                m = self.model.get(i, {})
                edges = m.get("edges", [])
                reached = bool(m.get("reached")) and len(edges) > 0
                rows.append({"id": i, "reached": reached, "edges": edges})
            return rows

        # entity_bridge check_demo_critical aql_linked — RETURNs has_hub + structured_linked
        if "has_hub" in aql:
            rows = []
            for i in ids:
                m = self.model.get(i, {})
                rows.append(
                    {
                        "id": i,
                        "has_hub": bool(m.get("has_hub")),
                        "structured_linked": bool(m.get("structured_linked")),
                    }
                )
            return rows

        # entity_bridge check_entity_id_stamp aql_linked — RETURNs structured_linked only
        if "structured_linked: structured_edges > 0" in aql or (
            "structured_linked" in aql and "has_hub" not in aql
        ):
            rows = []
            for i in ids:
                m = self.model.get(i, {})
                rows.append({"id": i, "structured_linked": bool(m.get("structured_linked"))})
            return rows

        # KG-stamp queries — distinct entity_ids stamped
        if "RETURN DISTINCT e.entity_id" in aql:
            return [i for i in ids if self.model.get(i, {}).get("kg_stamped")]

        return []


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _resolved_entry(eid, *, deterministic=False):
    """A fully-resolved id: hub + structured edge + reaching same_as edge."""
    if eid in GT_MENTIONS and not deterministic:
        edges = [{"surface_form": GT_MENTIONS[eid], "match_method": "embedding"}]
    else:
        edges = [{"surface_form": DEMO_CRITICAL_ENTITIES[eid]["display_name"],
                  "match_method": "deterministic" if deterministic else "embedding"}]
    return {
        "has_hub": True,
        "structured_linked": True,
        "reached": True,
        "edges": edges,
        "kg_stamped": eid in GT_MENTIONS,  # only the 3 covered ids carry a KG stamp
        "wrong_canonical_id": None,
    }


@pytest.fixture
def all_nine_linked():
    # Covered ids (Okafor/Brooks/Vance) carry a real ground-truth surface form;
    # the other 6 resolve via deterministic linkage.
    model = {}
    for eid in DEMO_CRITICAL_IDS:
        model[eid] = _resolved_entry(eid, deterministic=eid not in GT_MENTIONS)
    return FakeDB(model)


@pytest.fixture
def one_unlinked():
    model = {}
    for eid in DEMO_CRITICAL_IDS:
        model[eid] = _resolved_entry(eid, deterministic=eid not in GT_MENTIONS)
    # James Okafor: no hub, no edge, no stamp.
    model[OKAFOR] = {
        "has_hub": False,
        "structured_linked": False,
        "reached": False,
        "edges": [],
        "kg_stamped": False,
        "wrong_canonical_id": None,
    }
    return FakeDB(model)


@pytest.fixture
def one_mislinked():
    model = {}
    for eid in DEMO_CRITICAL_IDS:
        model[eid] = _resolved_entry(eid, deterministic=eid not in GT_MENTIONS)
    # Okafor reaches no hub with canonical_id == OKAFOR, but its leaf resolves to BROOKS.
    model[OKAFOR] = {
        "has_hub": False,
        "structured_linked": False,
        "reached": False,
        "edges": [],
        "kg_stamped": False,
        "wrong_canonical_id": BROOKS,
    }
    return FakeDB(model)


@pytest.fixture
def covered_wrong_surface_form():
    model = {}
    for eid in DEMO_CRITICAL_IDS:
        model[eid] = _resolved_entry(eid, deterministic=eid not in GT_MENTIONS)
    # Okafor reaches the RIGHT hub, but the contributing edge carries a surface
    # form that is NOT a ground-truth mention and match_method != deterministic.
    model[OKAFOR] = {
        "has_hub": True,
        "structured_linked": True,
        "reached": True,
        "edges": [{"surface_form": "Some Unrelated Name", "match_method": "embedding"}],
        "kg_stamped": False,
        "wrong_canonical_id": None,
    }
    return FakeDB(model)


@pytest.fixture(autouse=True)
def _stub_ground_truth(monkeypatch):
    """
    The coref gate's resolve_demo_critical() loads ground truth from manifest.json.
    Stub it so the 3 covered ids carry their real mentions without touching disk.
    """
    gt = {
        "JO": OKAFOR, "Okafer": OKAFOR, "Ockafar": OKAFOR, "the director": OKAFOR,
        "TB": BROOKS, "Brookes": BROOKS, "the engineering manager": BROOKS,
        "PV": VANCE, "Vaance": VANCE, "the CFO": VANCE,
    }
    monkeypatch.setattr(vce, "_load_ground_truth", lambda: gt)


# ---------------------------------------------------------------------------
# entity_bridge gate tests
# ---------------------------------------------------------------------------


def test_entity_bridge_demo_critical_all_linked_passes(all_nine_linked):
    ok, msg = veb.check_demo_critical(all_nine_linked)
    assert ok is True, msg


def test_entity_bridge_demo_critical_one_missing_fails(one_unlinked):
    ok, msg = veb.check_demo_critical(one_unlinked)
    assert ok is False
    assert "James Okafor" in msg


def test_entity_bridge_denominator_is_nine(all_nine_linked, one_unlinked):
    _, pass_msg = veb.check_demo_critical(all_nine_linked)
    _, fail_msg = veb.check_demo_critical(one_unlinked)
    assert "/9" in pass_msg
    assert "/9" in fail_msg


# ---------------------------------------------------------------------------
# coref gate tests
# ---------------------------------------------------------------------------


def test_coref_demo_critical_all_nine_passes(all_nine_linked):
    ok, msg, statuses = vce.evaluate_demo_critical_coref(all_nine_linked)
    assert ok is True, msg
    assert "/9" in msg
    assert all(s["status"] == "resolved" for s in statuses.values())


def test_coref_demo_critical_partial_coverage_fails(one_unlinked):
    ok, msg, _ = vce.evaluate_demo_critical_coref(one_unlinked)
    assert ok is False
    assert "/9" in msg
    assert "100%" not in msg.split("resolved")[0]  # not a 3/3=100% false pass
    assert "James Okafor" in msg


def test_coref_demo_critical_mislinked_fails(one_mislinked):
    ok, msg, statuses = vce.evaluate_demo_critical_coref(one_mislinked)
    assert ok is False
    assert statuses[OKAFOR]["status"] == "mis-linked"
    assert "mis-linked" in msg


def test_coref_resolution_is_bridge_path_not_stamp(all_nine_linked):
    # A covered id with NO KG stamp but a same_as edge reaching its hub still resolves.
    statuses = vce.resolve_demo_critical(all_nine_linked)
    # Uncovered ids carry kg_stamped=False yet resolve via the bridge path.
    sarah = "4818c0ff-b555-5395-8950-ae3916c176a3"
    assert all_nine_linked.model[sarah]["kg_stamped"] is False
    assert statuses[sarah]["status"] == "resolved"

    # An id with NO same_as edge to its hub does NOT resolve (linkage drives the verdict).
    no_edge_model = dict(all_nine_linked.model)
    no_edge_model[sarah] = {
        "has_hub": True, "structured_linked": False, "reached": False,
        "edges": [], "kg_stamped": True, "wrong_canonical_id": None,
    }
    db2 = FakeDB(no_edge_model)
    statuses2 = vce.resolve_demo_critical(db2)
    assert statuses2[sarah]["status"] != "resolved"


def test_coref_surface_form_must_match_ground_truth(covered_wrong_surface_form):
    ok, msg, statuses = vce.evaluate_demo_critical_coref(covered_wrong_surface_form)
    assert ok is False
    assert statuses[OKAFOR]["status"] == "covered-but-wrong-surface-form"
    assert "covered-but-wrong-surface-form" in msg
