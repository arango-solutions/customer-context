"""HTTP client for the Arango Control Plane (ACP) API.

ACP exposes the platform-level resources used during provisioning:

- raw ArangoDB ``/_api/database`` for DB CRUD
- ``/_platform/acp/v1/project`` for project metadata
- ``/_platform/acp/v1/autograph`` for AutoGraph service deployment
- ``/_platform/acp/v1/list_services`` for discovering existing deployments

Auth shares the JWT pattern of :mod:`autograph_client` — a ``POST /_open/auth``
returns a Bearer token that's accepted by every endpoint above.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib3
from pathlib import Path
from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from lib import jwt_cache

log = logging.getLogger(__name__)

ACP_BASE_PATH = "/_platform/acp/v1"


class ACPError(RuntimeError):
    pass


class ACPAuthError(ACPError):
    pass


class ACPClient:
    """Wrap the ACP REST endpoints with a shared JWT.

    The JWT is fetched from ``{url}/_open/auth``. All ACP requests reuse it
    as a Bearer token. On 401 we re-auth once transparently.
    """

    def __init__(
        self,
        url: str,
        user: str,
        password: str,
        *,
        tls_verify: bool = True,
        timeout_s: float = 60.0,
        jwt_cache_path: Path | None = None,
    ) -> None:
        self.url = url.rstrip("/")
        self.user = user
        self.password = password
        self.tls_verify = tls_verify
        self.timeout_s = timeout_s
        self.jwt_cache_path = jwt_cache_path

        self._session = requests.Session()
        self._jwt: str | None = None

        if not tls_verify:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def authenticate(self) -> None:
        auth_url = f"{self.url}/_open/auth"
        log.info("Authenticating to %s", auth_url)
        try:
            response = self._session.post(
                auth_url,
                json={"username": self.user, "password": self.password},
                verify=self.tls_verify,
                timeout=self.timeout_s,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            raise ACPAuthError(f"Auth request failed: {e}") from e

        token = response.json().get("jwt")
        if not token:
            raise ACPAuthError("Auth response missing 'jwt' field")
        self._jwt = token
        log.info("JWT obtained")
        jwt_cache.write_jwt(self.url, self.user, token, self.jwt_cache_path)

    def _ensure_authed(self) -> None:
        if self._jwt is not None:
            return
        cached = jwt_cache.read_jwt(self.url, self.user, self.jwt_cache_path)
        if cached:
            log.debug("Reusing cached JWT for %s as %s", self.url, self.user)
            self._jwt = cached
            return
        self.authenticate()

    def _request(
        self,
        method: str,
        full_url: str,
        *,
        payload: dict | None = None,
        params: dict | None = None,
        timeout_s: float | None = None,
        accept_status: tuple[int, ...] = (),
    ) -> tuple[int, Any]:
        """Send an authed request. Re-auths once on 401.

        Returns ``(status_code, parsed_json_or_text)``. Raises for non-2xx
        unless the status is in ``accept_status``.
        """
        self._ensure_authed()
        headers = {
            "Authorization": f"Bearer {self._jwt}",
            "Content-Type": "application/json",
        }

        attempts = 0
        while True:
            attempts += 1
            response = self._session.request(
                method,
                full_url,
                json=payload,
                params=params,
                headers=headers,
                verify=self.tls_verify,
                timeout=timeout_s if timeout_s is not None else self.timeout_s,
            )

            if response.status_code == 401 and attempts == 1:
                log.warning("Got 401 from %s — re-authenticating", full_url)
                self._jwt = None
                jwt_cache.clear_jwt(self.url, self.user, self.jwt_cache_path)
                self.authenticate()
                headers["Authorization"] = f"Bearer {self._jwt}"
                continue

            if response.status_code in accept_status:
                return response.status_code, _safe_json(response)

            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError as e:
                body = response.text[:2000]
                raise ACPError(
                    f"{method} {full_url} -> {response.status_code}: {body}"
                ) from e

            return response.status_code, _safe_json(response)

    def _acp_url(self, suffix: str) -> str:
        return f"{self.url}{ACP_BASE_PATH}{suffix}"

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def health(self) -> dict:
        """``GET /_platform/acp/v1/health`` — sanity check the ACP itself."""
        _, body = self._request("GET", self._acp_url("/health"))
        return body if isinstance(body, dict) else {"raw": body}

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def list_databases(self) -> list[str]:
        """``GET /_api/database`` — return every DB the user can see."""
        _, body = self._request("GET", f"{self.url}/_api/database")
        if isinstance(body, dict):
            result = body.get("result")
            if isinstance(result, list):
                return [str(name) for name in result]
        return []

    def database_exists(self, name: str) -> bool:
        return name in self.list_databases()

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def create_database(self, name: str) -> bool:
        """``POST /_api/database`` — idempotent: 409 maps to "already exists"."""
        status, body = self._request(
            "POST",
            f"{self.url}/_api/database",
            payload={"name": name},
            accept_status=(409,),
        )
        if status == 409:
            log.info("Database %s already exists.", name)
            return False
        log.info("Database %s created.", name)
        return True

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def delete_database(self, name: str) -> bool:
        """``DELETE /_api/database/<name>`` — 404 maps to "already gone"."""
        status, _ = self._request(
            "DELETE",
            f"{self.url}/_api/database/{urllib.parse.quote(name)}",
            accept_status=(404,),
        )
        if status == 404:
            log.info("Database %s already absent.", name)
            return False
        log.info("Database %s deleted.", name)
        return True

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def get_project(self, db_name: str, project_name: str) -> dict | None:
        """Returns the project dict, or ``None`` if it doesn't exist.

        ACP returns ``400`` (not ``404``) with a message like "Project ...
        does not exist in the projects list" when the project is missing,
        so we accept ``400`` here and translate the "does not exist"
        message to ``None``. Other 400s are re-raised.
        """
        status, body = self._request(
            "GET",
            self._acp_url(
                f"/project_by_name/{urllib.parse.quote(db_name)}/{urllib.parse.quote(project_name)}"
            ),
            accept_status=(400, 404),
        )
        if status == 404:
            return None
        if status == 400:
            msg = ""
            if isinstance(body, dict):
                msg = str(body.get("message") or body.get("_raw_text") or "")
            if "does not exist" in msg.lower():
                return None
            raise ACPError(
                f"GET project_by_name {db_name}/{project_name} -> 400: {body}"
            )
        return body if isinstance(body, dict) else None

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def create_project(
        self,
        db_name: str,
        project_name: str,
        *,
        description: str = "",
        project_type: str = "autograph",
    ) -> dict:
        """``POST /project`` — idempotent: a duplicate-create returns the existing one.

        The server expects camelCase fields ``dbName`` + ``projectName`` +
        ``projectType`` + ``projectDbName``. We send all of them; the
        server's error messages are misleading when fields are missing.
        """
        existing = self.get_project(db_name, project_name)
        if existing:
            log.info("Project %s/%s already exists.", db_name, project_name)
            return existing
        payload = {
            "dbName": db_name,
            "projectDbName": db_name,
            "projectName": project_name,
            "projectType": project_type,
            "description": description or f"{project_name} (created by auto-ingest)",
        }
        _, body = self._request(
            "POST", self._acp_url("/project"), payload=payload, accept_status=(409,)
        )
        log.info("Project %s/%s created.", db_name, project_name)
        if isinstance(body, dict):
            return body
        return {"projectDbName": db_name, "projectName": project_name}

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def delete_project(self, db_name: str, project_name: str) -> bool:
        """``DELETE /project/<db>/<project>`` — 404 maps to "already gone"."""
        status, _ = self._request(
            "DELETE",
            self._acp_url(
                f"/project/{urllib.parse.quote(db_name)}/{urllib.parse.quote(project_name)}"
            ),
            accept_status=(404,),
        )
        if status == 404:
            log.info("Project %s/%s already absent.", db_name, project_name)
            return False
        log.info("Project %s/%s deleted.", db_name, project_name)
        return True

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def deploy_autograph(
        self,
        env: dict,
        *,
        labels: dict | None = None,
    ) -> dict:
        """``POST /autograph`` — start a new AutoGraph service deployment.

        ``env`` is the deployment-time environment for the AutoGraph container
        (db_name, project_name, chat_*, embedding_*). ``labels`` are arbitrary
        key/value tags used by ``list_services`` for discovery.

        The live ACP ``/autograph`` endpoint resolves the target project from
        the ``env.genai_project_name`` field (verified against the live server:
        the project-not-found error echoes whatever ``env.genai_project_name``
        contains, while ``env.project_name`` and every top-level variant are
        ignored). Callers must therefore set ``genai_project_name`` in ``env``.

        Returns ``{serviceId, status, namespace, ...}`` (raw ACP response).
        """
        payload: dict[str, Any] = {"env": env}
        if labels:
            payload["labels"] = labels
        _, body = self._request(
            "POST", self._acp_url("/autograph"), payload=payload, timeout_s=120
        )
        if not isinstance(body, dict):
            raise ACPError(f"Unexpected deploy_autograph response: {body!r}")
        log.info(
            "AutoGraph deployment requested. serviceId=%s status=%s",
            body.get("serviceId") or body.get("service_id"),
            body.get("status"),
        )
        return body

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def deploy_service(
        self,
        kind: str,
        env: dict,
        *,
        labels: dict | None = None,
    ) -> dict:
        """``POST /<kind>`` — generic AI-Suite service deployment.

        Generalizes :meth:`deploy_autograph` for the AI-tier services:

        - ``kind="graphragretriever"`` → GraphRAG Retriever (Deep Search)
        - ``kind="graphrag"``          → AQLizer (NL→AQL)

        ``env`` is the deployment-time environment for the service container
        (``db_name``, ``project_name``, ``chat_*``, ``embedding_*``).
        ``labels`` are arbitrary key/value tags used by ``list_services`` for
        discovery. Posts ``{"env": env}`` (plus ``labels`` if given) to
        ``self._acp_url("/<kind>")`` at a 120s timeout, raising
        :class:`ACPError` on a non-dict body, and returns the raw ACP
        response (``{serviceId, status, ...}``).
        """
        payload: dict[str, Any] = {"env": env}
        if labels:
            payload["labels"] = labels
        _, body = self._request(
            "POST", self._acp_url(f"/{kind}"), payload=payload, timeout_s=120
        )
        if not isinstance(body, dict):
            raise ACPError(f"Unexpected deploy_{kind} response: {body!r}")
        log.info(
            "%s deployment requested. serviceId=%s status=%s",
            kind,
            body.get("serviceId") or body.get("service_id"),
            body.get("status"),
        )
        return body

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def get_service_status(self, service_id: str) -> dict:
        _, body = self._request(
            "GET", self._acp_url(f"/service/{urllib.parse.quote(service_id)}")
        )
        return body if isinstance(body, dict) else {"raw": body}

    def wait_for_service_ready(
        self,
        service_id: str,
        *,
        timeout_s: float = 300.0,
        poll_interval_s: float = 5.0,
    ) -> dict:
        """Poll ``get_service_status`` until ``status==DEPLOYED`` or timeout.

        ACP returns the status nested under ``serviceInfo`` — i.e.
        ``{"serviceInfo": {"status": "DEPLOYED", ...}}`` — so we look in
        both places. This only checks the ACP-side deployment status; the
        AutoGraph service's own ``/v1/health`` is a separate, later step
        (after URL-pattern probing).
        """
        deadline = time.monotonic() + timeout_s
        last_status: dict = {}
        while time.monotonic() < deadline:
            last_status = self.get_service_status(service_id)
            info = last_status.get("serviceInfo") if isinstance(last_status, dict) else {}
            if not isinstance(info, dict):
                info = {}
            status_val = str(
                info.get("status")
                or last_status.get("status")
                or last_status.get("state")
                or ""
            ).upper()
            if status_val == "DEPLOYED":
                log.info("Service %s is DEPLOYED.", service_id)
                return last_status
            if status_val in {"FAILED", "ERROR", "TERMINATED"}:
                raise ACPError(
                    f"Service {service_id} reached terminal failure state {status_val}: "
                    f"{last_status}"
                )
            log.info(
                "Service %s status=%s — waiting %.0fs",
                service_id,
                status_val or "(unknown)",
                poll_interval_s,
            )
            time.sleep(poll_interval_s)
        raise ACPError(
            f"Timed out after {timeout_s:.0f}s waiting for service {service_id} to be DEPLOYED. "
            f"Last status: {last_status}"
        )

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def list_services(
        self,
        *,
        labels: dict | None = None,
        service_type: str | None = None,
    ) -> list[dict]:
        """``POST /list_services`` — discover existing deployments."""
        payload: dict[str, Any] = {}
        if labels:
            payload["labels"] = labels
        if service_type:
            payload["service_type"] = service_type

        _, body = self._request(
            "POST", self._acp_url("/list_services"), payload=payload
        )

        if isinstance(body, list):
            return [s for s in body if isinstance(s, dict)]
        if isinstance(body, dict):
            for key in ("services", "items", "result", "data"):
                value = body.get(key)
                if isinstance(value, list):
                    return [s for s in value if isinstance(s, dict)]
        return []

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def delete_service(self, service_id: str) -> bool:
        status, _ = self._request(
            "DELETE",
            self._acp_url(f"/service/{urllib.parse.quote(service_id)}"),
            accept_status=(404,),
            timeout_s=120,
        )
        if status == 404:
            log.info("Service %s already absent.", service_id)
            return False
        log.info("Service %s delete requested.", service_id)
        return True


def _safe_json(response: requests.Response) -> Any:
    """Return the parsed JSON if possible, else the raw text."""
    if not response.content:
        return {}
    try:
        return response.json()
    except (json.JSONDecodeError, ValueError):
        return {"_raw_text": response.text[:4000]}


def normalize_service_id(raw: dict) -> str | None:
    """Service-list responses use either ``serviceId`` or ``service_id``."""
    for key in ("serviceId", "service_id", "id", "name"):
        value = raw.get(key)
        if isinstance(value, str) and value:
            return value
    return None
