"""Provision a dedicated 512-dim AutoGraph service for the customer360 project.

Sequence:
  1. Load env (override=True); resolve ARANGO_URL/ARANGO_ENDPOINT and related vars.
  2. Read OPENAI_API_KEY from environment.
  3. Instantiate ACPClient.
  4. Guard — create database (idempotent; 409 = already exists, fine).
  5. Idempotent project creation via get_project / create_project.
  6. Idempotency guard — skip deploy if customer360_autograph_service_id already in
     service_discovery.json AND the service is DEPLOYED.
  7. Deploy NEW AutoGraph service tagged project=customer360, demo=customer360.
     embedding_dim="512" is LOCKED — never change for customer360 (Phase 2 near-miss
     guard is locked at 512).
  8. Wait for DEPLOYED (acp.wait_for_service_ready, 300 s cap).
  9. Probe AutoGraph URL via URL-candidate probing (4 patterns, 180 s cap).
 10. Write service_discovery.json with customer360_autograph_service_id,
     customer360_autograph_url, customer360_autograph_db.

Security: OPENAI_API_KEY, ARANGO_PASSWORD, and the JWT are NEVER printed, logged,
or written to any file.

Usage:
    python scripts/setup_autograph.py
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# ── path setup ────────────────────────────────────────────────────────────────
# lib/ is a sibling of scripts/ — add the repo root to sys.path so `from lib`
# imports resolve regardless of where the script is invoked from.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from lib.acp_client import ACPClient, ACPError, normalize_service_id  # noqa: E402
from lib.autograph_client import AutographClient  # noqa: E402

# ── configuration ─────────────────────────────────────────────────────────────
# customer360-specific parameters — DO NOT CHANGE embedding_dim (Phase 2 locked).
CUSTOMER360_DB = "customer360"
EMBEDDING_DIM = "512"          # LOCKED — Phase 2 near-miss guard depends on this
EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4o-mini"
GENAI_PROJECT_NAME = "customer360"
PROJECT_NAME = "customer360"
LABELS = {"project": "customer360", "demo": "customer360"}

_DISCOVERY = _REPO_ROOT / "service_discovery.json"

# URL probe candidates (same 4 patterns as health360 / wtw-benchmark)
_URL_CANDIDATES = [
    "{base}/autograph/{suffix}",
    "{base}/autograph/{full_id}",
    "{base}/_platform/{full_id}",
    "{base}/services/{full_id}",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ── helpers ───────────────────────────────────────────────────────────────────


def _read_discovery() -> dict:
    if _DISCOVERY.exists():
        try:
            return json.loads(_DISCOVERY.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _update_discovery(key: str, value: object) -> None:
    data = _read_discovery()
    data[key] = value
    _DISCOVERY.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"[OK] service_discovery.json updated: {key}")


def _probe_autograph_url(
    arango_url: str,
    user: str,
    password: str,
    service_id: str,
    *,
    deadline_s: float = 180.0,
) -> str:
    """Probe URL candidates until one returns 200 on /v1/health.

    Accepts any service_id whose prefix is "arangodb-<type>-<suffix>".
    The suffix is extracted by splitting off the last "-"-separated token
    group after the second dash-word (e.g. arangodb-autograph-abc123 →
    suffix=abc123). If the standard prefix is found we strip it exactly;
    otherwise we fall back to splitting on the last "-" pair to get the
    trailing suffix, and log the actual service_id for diagnostics.
    """
    EXPECTED_PREFIX = "arangodb-autograph-"
    if service_id.startswith(EXPECTED_PREFIX):
        suffix = service_id[len(EXPECTED_PREFIX):]
    else:
        # Non-standard prefix — log and extract suffix generically
        print(
            f"[WARN] service_id {service_id!r} does not start with "
            f"{EXPECTED_PREFIX!r} — extracting suffix from last segment"
        )
        # Split "arangodb-<type>-<suffix>" on the second "-" boundary
        parts = service_id.split("-", 2)
        suffix = parts[-1] if len(parts) >= 2 else service_id

    base = arango_url.rstrip("/")
    candidates = [
        c.format(base=base, suffix=suffix, full_id=service_id)
        for c in _URL_CANDIDATES
    ]
    print(f"[..] URL candidates:\n  " + "\n  ".join(candidates))

    deadline = time.monotonic() + deadline_s
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        for url in candidates:
            try:
                test_client = AutographClient(
                    url,
                    arango_url,
                    user,
                    password,
                    tls_verify=True,
                    timeout_s=10.0,
                )
                test_client.health()
                return url
            except Exception as e:  # noqa: BLE001
                last_error = e
        time.sleep(2)

    raise RuntimeError(
        f"Could not resolve AutoGraph URL within {deadline_s:.0f}s. "
        f"Last error: {last_error}\nTried:\n  " + "\n  ".join(candidates)
    )


# ── main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    # Step 1: load env with override=True so stale shell exports don't shadow .env
    env_path = _REPO_ROOT / ".env"
    if env_path.is_file():
        load_dotenv(env_path, override=True)
        print(f"[OK] loaded .env from {env_path}")
    else:
        print(f"[WARN] no .env found at {env_path} — relying on process env")

    # Resolve env vars — support both naming conventions
    arango_url = (os.environ.get("ARANGO_URL") or os.environ.get("ARANGO_ENDPOINT", "")).strip()
    user = (os.environ.get("ARANGO_USER") or os.environ.get("ARANGO_USERNAME", "")).strip()
    password = os.environ.get("ARANGO_PASSWORD", "").strip()
    db_name = (
        os.environ.get("ARANGO_DB")
        or os.environ.get("ARANGO_DATABASE")
        or CUSTOMER360_DB
    ).strip()

    missing = []
    if not arango_url:
        missing.append("ARANGO_URL / ARANGO_ENDPOINT")
    if not user:
        missing.append("ARANGO_USER / ARANGO_USERNAME")
    if not password:
        missing.append("ARANGO_PASSWORD")
    if missing:
        print(f"[FAIL] missing required env vars: {', '.join(missing)}", file=sys.stderr)
        return 2

    openai_api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not openai_api_key:
        print(
            "[FAIL] OPENAI_API_KEY not set — required for AutoGraph embedding service",
            file=sys.stderr,
        )
        return 2
    print("[OK] OpenAI API key present")
    print(f"[OK] arango_url={arango_url}  user={user}  db_name={db_name}")

    # Step 2: instantiate ACPClient
    acp = ACPClient(url=arango_url, user=user, password=password)

    # Step 3: ensure the database exists (idempotent — 409 = already there)
    if db_name == "_system":
        print("[OK] using _system database (always present)")
    else:
        print(f"[..] ensuring database {db_name!r} exists ...")
        try:
            created = acp.create_database(db_name)
            if created:
                print(f"[OK] database {db_name!r} created")
            else:
                print(f"[OK] database {db_name!r} already exists (idempotent)")
        except ACPError as exc:
            # 409 is handled inside create_database; any other error surfaces here
            print(f"[FAIL] create_database({db_name!r}) failed: {exc}", file=sys.stderr)
            return 1

    # Step 4: idempotent project creation
    print(f"[..] checking project {db_name!r}/{GENAI_PROJECT_NAME!r} ...")
    try:
        existing_project = acp.get_project(db_name, GENAI_PROJECT_NAME)
    except ACPError as exc:
        print(f"[FAIL] get_project failed: {exc}", file=sys.stderr)
        return 1

    if existing_project:
        print(f"[OK] project {db_name}/{GENAI_PROJECT_NAME} already exists — skipping create")
    else:
        print(f"[..] creating project {db_name}/{GENAI_PROJECT_NAME} ...")
        try:
            acp.create_project(
                db_name,
                GENAI_PROJECT_NAME,
                description="Customer 360 demo (customer360)",
                project_type="autograph",
            )
            print(f"[OK] project {db_name}/{GENAI_PROJECT_NAME} created")
        except ACPError as exc:
            print(f"[FAIL] create_project failed: {exc}", file=sys.stderr)
            return 1

    # Step 5: idempotency guard — check existing service
    discovery = _read_discovery()
    existing_service_id = discovery.get("customer360_autograph_service_id")
    if existing_service_id:
        print(f"[..] checking existing service {existing_service_id} ...")
        try:
            status_resp = acp.get_service_status(existing_service_id)
            info = status_resp.get("serviceInfo") if isinstance(status_resp, dict) else {}
            if not isinstance(info, dict):
                info = {}
            status_val = str(
                info.get("status")
                or status_resp.get("status")
                or status_resp.get("state")
                or ""
            ).upper()
            if status_val == "DEPLOYED":
                existing_url = discovery.get("customer360_autograph_url", "")
                print(
                    f"[OK] customer360 AutoGraph service already DEPLOYED: "
                    f"{existing_service_id}"
                )
                if existing_url:
                    print(f"[OK] customer360_autograph_url already set: {existing_url}")
                    # Verify health before returning early
                    print("[..] verifying /v1/health on existing service ...")
                    try:
                        health_client = AutographClient(
                            existing_url, arango_url, user, password, tls_verify=True
                        )
                        health_resp, _ = health_client.health()
                        print(f"[OK] /v1/health: {health_resp}")
                        return 0
                    except Exception as e:
                        print(f"[WARN] /v1/health failed on existing URL: {e} — re-probing")
                print("[..] customer360_autograph_url missing or unhealthy — re-probing URL ...")
                # Fall through to probe step with the existing service_id
                service_id = existing_service_id
                # Jump directly to URL probing
                autograph_url = _probe_autograph_url_or_fail(
                    arango_url, user, password, service_id
                )
                if autograph_url is None:
                    return 1
                _persist_and_finish(service_id, autograph_url, db_name, arango_url, user, password)
                return 0
            else:
                print(
                    f"[WARN] existing service {existing_service_id} status={status_val!r} "
                    "— re-provisioning"
                )
                existing_service_id = None
        except ACPError:
            print(
                f"[WARN] could not check status of {existing_service_id} — "
                "deploying fresh service"
            )
            existing_service_id = None

    service_id = existing_service_id

    if not service_id:
        # Step 6: deploy NEW AutoGraph service — one attempt only (per STOP CONDITIONS)
        print("[..] deploying new customer360-scoped AutoGraph service ...")
        print(f"     embedding_dim={EMBEDDING_DIM} (LOCKED — Phase 2 near-miss guard)")
        env = {
            "db_name": db_name,
            # ACP /autograph reads the project from genai_project_name (verified
            # against the live server — project_name alone yields "Project not found")
            "genai_project_name": GENAI_PROJECT_NAME,
            "project_name": PROJECT_NAME,
            "chat_api_provider": "openai",
            "chat_api_url": "https://api.openai.com/v1",
            "embedding_api_provider": "openai",
            "embedding_api_url": "https://api.openai.com/v1",
            "chat_model": CHAT_MODEL,
            "embedding_model": EMBEDDING_MODEL,
            "chat_api_key": openai_api_key,
            "embedding_api_key": openai_api_key,
            "embedding_dim": EMBEDDING_DIM,  # LOCKED — never change (Phase 2)
        }
        try:
            deploy_resp = acp.deploy_autograph(env, labels=LABELS)
        except ACPError as exc:
            print(f"[FAIL] deploy_autograph failed: {exc}", file=sys.stderr)
            return 1

        service_id = (
            deploy_resp.get("serviceId")
            or deploy_resp.get("service_id")
            or normalize_service_id(deploy_resp)
            or (deploy_resp.get("serviceInfo") or {}).get("serviceId")
        )
        if not service_id:
            print(
                f"[FAIL] deploy_autograph response missing serviceId: {deploy_resp!r}",
                file=sys.stderr,
            )
            return 1

        print(f"[OK] deployment requested: {service_id}")

        # Step 7: wait for DEPLOYED (300 s cap)
        print(f"[..] waiting for {service_id} to be DEPLOYED (cap 300s) ...")
        try:
            acp.wait_for_service_ready(service_id, timeout_s=300)
            print(f"[OK] service {service_id} is DEPLOYED")
        except ACPError as exc:
            print(f"[FAIL] wait_for_service_ready: {exc}", file=sys.stderr)
            # Persist the service_id so a re-run can pick it up
            _update_discovery("customer360_autograph_service_id", service_id)
            return 1

        # Persist service_id immediately — URL-probe crash is recoverable
        _update_discovery("customer360_autograph_service_id", service_id)

    # Step 8: probe AutoGraph URL (180 s cap)
    print(f"[..] probing AutoGraph URL for {service_id} (cap 180s) ...")
    try:
        autograph_url = _probe_autograph_url(
            arango_url, user, password, service_id, deadline_s=180.0
        )
    except RuntimeError as exc:
        print(f"[FAIL] URL probe failed: {exc}", file=sys.stderr)
        return 1

    print(f"[OK] AutoGraph URL resolved: {autograph_url}")
    _persist_and_finish(service_id, autograph_url, db_name, arango_url, user, password)
    return 0


def _probe_autograph_url_or_fail(
    arango_url: str, user: str, password: str, service_id: str
) -> str | None:
    try:
        url = _probe_autograph_url(arango_url, user, password, service_id, deadline_s=180.0)
        print(f"[OK] AutoGraph URL resolved: {url}")
        return url
    except RuntimeError as exc:
        print(f"[FAIL] URL probe failed: {exc}", file=sys.stderr)
        return None


def _persist_and_finish(
    service_id: str,
    autograph_url: str,
    db_name: str,
    arango_url: str,
    user: str,
    password: str,
) -> None:
    _update_discovery("customer360_autograph_service_id", service_id)
    _update_discovery("customer360_autograph_url", autograph_url)
    _update_discovery("customer360_autograph_db", db_name)

    # Step 9: verify /v1/health
    print("[..] verifying /v1/health ...")
    try:
        health_client = AutographClient(
            autograph_url, arango_url, user, password, tls_verify=True
        )
        health_resp, _ = health_client.health()
        print(f"[OK] /v1/health: {health_resp}")
    except Exception as exc:
        print(f"[WARN] /v1/health check failed: {exc}")

    print(
        f"\n[DONE] customer360 AutoGraph service: {service_id}\n"
        f"       URL: {autograph_url}\n"
        f"       DB:  {db_name}"
    )


if __name__ == "__main__":
    raise SystemExit(main())
