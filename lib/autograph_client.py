"""HTTP client for an AutoGraph service deployment (port-8080 endpoints).

The 5 ingestion endpoints we time:

- ``POST /v1/import-multiple`` — upload pre-converted Markdown files.
- ``POST /v1/corpus/builds`` and ``GET /v1/corpus/builds/{id}`` — kick off
  the corpus build (chunking, embedding, similarity edges, clustering)
  and poll until completion.
- ``POST /v1/rag-strategizer/analyze`` and ``GET /v1/rag-strategizer/strategy``
  — kick off the RAG strategy assignment and poll until stable.
- ``POST /v1/orchestrate`` — kick off the importer-worker orchestration
  that materializes the actual graph.

Auth is JWT-bearer, with the JWT obtained from the ArangoDB engine at
``ARANGO_URL/_open/auth``. The AutoGraph service is reached through the
proxy at ``AUTOGRAPH_API_URL``. Re-auth on 401 mirrors :class:`ArangoClient`.
"""

from __future__ import annotations

import base64
import json
import logging
import time
import urllib.parse
import urllib3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from lib import jwt_cache

log = logging.getLogger(__name__)


class AutographError(RuntimeError):
    pass


class AutographAuthError(AutographError):
    pass


@dataclass
class FileSpec:
    name: str
    md_bytes: bytes

    @classmethod
    def from_path(cls, path: Path) -> "FileSpec":
        return cls(name=path.name, md_bytes=path.read_bytes())


@dataclass
class ImportResult:
    response: dict
    latency_ms: float
    n_files: int
    total_bytes: int
    batches: list[dict]


class AutographClient:
    """Minimal HTTP wrapper for the AutoGraph service ingestion API.

    JWT auth is delegated to ``arango_url`` (``_open/auth`` lives on the
    ArangoDB engine); requests go to ``api_url`` (the deployed AutoGraph
    service URL). Re-auth on 401, retries on transient connection errors.
    """

    DEFAULT_IMPORT_BATCH_BYTES = 50 * 1024 * 1024
    DEFAULT_TIMEOUT_S = 60.0
    UPLOAD_TIMEOUT_S = 300.0

    def __init__(
        self,
        api_url: str,
        arango_url: str,
        user: str,
        password: str,
        *,
        tls_verify: bool = True,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        upload_timeout_s: float = UPLOAD_TIMEOUT_S,
        jwt_cache_path: Path | None = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.arango_url = arango_url.rstrip("/")
        self.user = user
        self.password = password
        self.tls_verify = tls_verify
        self.timeout_s = timeout_s
        self.upload_timeout_s = upload_timeout_s
        self.jwt_cache_path = jwt_cache_path

        self._session = requests.Session()
        self._jwt: str | None = None

        if not tls_verify:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def authenticate(self) -> None:
        auth_url = f"{self.arango_url}/_open/auth"
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
            raise AutographAuthError(f"Auth request failed: {e}") from e

        token = response.json().get("jwt")
        if not token:
            raise AutographAuthError("Auth response missing 'jwt' field")
        self._jwt = token
        log.info("JWT obtained")
        jwt_cache.write_jwt(self.arango_url, self.user, token, self.jwt_cache_path)

    def _ensure_authed(self) -> None:
        if self._jwt is not None:
            return
        cached = jwt_cache.read_jwt(
            self.arango_url, self.user, self.jwt_cache_path
        )
        if cached:
            log.debug("Reusing cached JWT for %s as %s", self.arango_url, self.user)
            self._jwt = cached
            return
        self.authenticate()

    def _request(
        self,
        method: str,
        suffix: str,
        *,
        payload: Any | None = None,
        params: dict | None = None,
        timeout_s: float | None = None,
    ) -> tuple[dict, float]:
        """Send an authed request to ``api_url + suffix``. Re-auths on 401.

        Returns ``(parsed_json_or_text_dict, latency_ms)``.
        """
        self._ensure_authed()
        full_url = f"{self.api_url}{suffix}"
        headers = {
            "Authorization": f"Bearer {self._jwt}",
            "Content-Type": "application/json",
        }

        attempts = 0
        while True:
            attempts += 1
            t0 = time.perf_counter()
            response = self._session.request(
                method,
                full_url,
                json=payload,
                params=params,
                headers=headers,
                verify=self.tls_verify,
                timeout=timeout_s if timeout_s is not None else self.timeout_s,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            if response.status_code == 401 and attempts == 1:
                log.warning("Got 401 from %s — re-authenticating", full_url)
                self._jwt = None
                jwt_cache.clear_jwt(
                    self.arango_url, self.user, self.jwt_cache_path
                )
                self.authenticate()
                headers["Authorization"] = f"Bearer {self._jwt}"
                continue

            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError as e:
                body = response.text[:2000]
                raise AutographError(
                    f"{method} {full_url} -> {response.status_code}: {body}"
                ) from e

            try:
                body = response.json()
            except (json.JSONDecodeError, ValueError):
                body = {"_raw_text": response.text[:4000]}

            if not isinstance(body, dict):
                body = {"_raw_value": body}
            return body, elapsed_ms

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def health(self) -> tuple[dict, float]:
        return self._request("GET", "/v1/health")

    def import_multiple(
        self,
        files: list[FileSpec],
        *,
        module: str,
        max_batch_bytes: int | None = None,
    ) -> ImportResult:
        """``POST /v1/import-multiple``.

        Auto-batches if total payload exceeds ``max_batch_bytes`` (default
        50 MB) so we never bust JSON size limits. Returns aggregate
        metadata plus per-batch breakdown.
        """
        max_bytes = max_batch_bytes or self.DEFAULT_IMPORT_BATCH_BYTES
        if not files:
            raise ValueError("import_multiple: no files supplied")

        batches: list[list[FileSpec]] = []
        current: list[FileSpec] = []
        current_size = 0
        for fs in files:
            est_size = len(fs.md_bytes) * 4 // 3 + 1024
            if current and current_size + est_size > max_bytes:
                batches.append(current)
                current = []
                current_size = 0
            current.append(fs)
            current_size += est_size
        if current:
            batches.append(current)

        log.info(
            "import_multiple: %d files (%d bytes total) split into %d batch(es)",
            len(files),
            sum(len(f.md_bytes) for f in files),
            len(batches),
        )

        batch_records: list[dict] = []
        combined_response: dict = {"responses": []}
        total_latency_ms = 0.0

        for batch_idx, batch in enumerate(batches):
            payload = {
                "module": module,
                "files": [
                    {
                        "doc_name": f.name,
                        "content": base64.b64encode(f.md_bytes).decode("ascii"),
                    }
                    for f in batch
                ],
            }
            response, latency_ms = self._post_with_retry(
                "/v1/import-multiple",
                payload,
                timeout_s=self.upload_timeout_s,
            )
            total_latency_ms += latency_ms
            batch_records.append(
                {
                    "batch": batch_idx,
                    "n_files": len(batch),
                    "bytes": sum(len(f.md_bytes) for f in batch),
                    "latency_ms": latency_ms,
                    "response": response,
                }
            )
            combined_response["responses"].append(response)

        return ImportResult(
            response=combined_response,
            latency_ms=total_latency_ms,
            n_files=len(files),
            total_bytes=sum(len(f.md_bytes) for f in files),
            batches=batch_records,
        )

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def _post_with_retry(
        self,
        suffix: str,
        payload: Any,
        *,
        timeout_s: float | None = None,
    ) -> tuple[dict, float]:
        return self._request("POST", suffix, payload=payload, timeout_s=timeout_s)

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def create_corpus_build(
        self,
        *,
        modules: list[str] | None = None,
        file_ids: list[str] | None = None,
        incremental: bool = False,
        embedding_strategy: str = "first_chunk",
        top_k: int = 7,
        cluster_threshold: int = 2,
    ) -> tuple[dict, float]:
        """``POST /v1/corpus/builds`` — kick off the corpus build.

        Per the AutoGraph reference docs, ``top_k`` and ``cluster_threshold``
        are nested under a ``strategy`` object (not top-level).

        Two ingestion paths (docs "Corpus Build", Options A/B):
          - ``file_ids``  → File Manager Integration. The service downloads
            these durable File-Manager files for the build. THIS IS THE
            RELIABLE PATH on this cluster.
          - omit ``file_ids`` → builds files previously staged via
            ``import-multiple``. That staging is ephemeral/per-pod and was a
            silent no-op on this deployment (see ``upload_rag_input``).

        Returns ``(response, kickoff_latency_ms)``. Caller extracts the
        build id from the response and feeds it to ``poll_corpus_build``.
        """
        payload: dict[str, Any] = {
            "embedding_strategy": embedding_strategy,
            "strategy": {
                "top_k": top_k,
                "cluster_threshold": cluster_threshold,
            },
            "incremental": incremental,
        }
        if modules:
            payload["modules"] = modules
        if file_ids:
            payload["file_ids"] = file_ids
        response, latency_ms = self._request(
            "POST", "/v1/corpus/builds", payload=payload
        )
        return response, latency_ms

    def upload_rag_input(self, database: str, name: str, content: bytes) -> str:
        """Upload one file to the platform File Manager; return its ``file_id``.

        ``POST {arango_url}/_platform/filemanager/_db/{database}/rag-input``
        (multipart ``name`` + ``file``). Unlike the AutoGraph service's
        ``import-multiple`` staging (ephemeral, per-pod, observed to silently
        persist nothing on this cluster), the File Manager is durable platform
        storage; the returned id is passed to ``create_corpus_build(file_ids=…)``.
        Re-uploading the same name in the same database creates a new version.
        """
        self._ensure_authed()
        url = f"{self.arango_url}/_platform/filemanager/_db/{database}/rag-input"
        for attempt in (1, 2):
            resp = self._session.post(
                url,
                headers={"Authorization": f"Bearer {self._jwt}"},
                data={"name": name},
                files={"file": (name, content, "text/plain")},
                verify=self.tls_verify,
                timeout=self.upload_timeout_s,
            )
            if resp.status_code == 401 and attempt == 1:
                self._jwt = None
                jwt_cache.clear_jwt(self.arango_url, self.user, self.jwt_cache_path)
                self.authenticate()
                continue
            try:
                resp.raise_for_status()
            except requests.exceptions.HTTPError as e:
                raise AutographError(
                    f"file-manager upload {name} -> {resp.status_code}: {resp.text[:500]}"
                ) from e
            body = resp.json()
            file_id = body.get("id") or body.get("file_id") or body.get("fileId")
            if not file_id:
                raise AutographError(f"file-manager upload {name}: response missing id: {body!r}")
            return file_id
        raise AutographError(f"file-manager upload {name}: unreachable")

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def get_corpus_build(self, build_id: str) -> tuple[dict, float]:
        suffix = f"/v1/corpus/builds/{urllib.parse.quote(build_id)}"
        return self._request("GET", suffix)

    def poll_corpus_build(
        self,
        build_id: str,
        *,
        interval_s: float = 10.0,
        timeout_s: float = 14400.0,
    ) -> Iterator[tuple[dict, float]]:
        """Yield each poll response until ``status`` is terminal.

        Terminal statuses: ``completed``, ``failed``, ``error``. Caller is
        responsible for inspecting each yielded response and breaking on
        the terminal one (or for logging every poll, which is the point).
        """
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            body, latency_ms = self.get_corpus_build(build_id)
            yield body, latency_ms
            status = str(body.get("status") or body.get("state") or "").lower()
            if status in {"completed", "failed", "error", "cancelled"}:
                return
            time.sleep(interval_s)
        raise AutographError(
            f"corpus build {build_id} did not finish within {timeout_s:.0f}s"
        )

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def analyze_strategizer(
        self, *, full_graph_rag_strategy: str = "high"
    ) -> tuple[dict, float]:
        payload = {"full_graph_rag_strategy": full_graph_rag_strategy}
        return self._request("POST", "/v1/rag-strategizer/analyze", payload=payload)

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def get_strategy(self) -> tuple[dict, float]:
        return self._request("GET", "/v1/rag-strategizer/strategy")

    def _strategy_signature(self, body: dict) -> str | None:
        """Cheap identity for stabilization checks."""
        if not isinstance(body, dict):
            return None
        strategies = body.get("strategies") or body.get("partitions") or []
        if not isinstance(strategies, list):
            return None
        sig = []
        for s in strategies:
            if not isinstance(s, dict):
                continue
            pid = s.get("partitionId") or s.get("partition_id") or s.get("id")
            strat = s.get("strategy") or s.get("ragStrategy") or s.get("rag_strategy")
            sig.append((str(pid), str(strat)))
        sig.sort()
        return json.dumps(sig)

    def wait_for_strategy_stable(
        self,
        *,
        interval_s: float = 10.0,
        timeout_s: float = 1800.0,
    ) -> tuple[dict, float, list[dict]]:
        """Poll ``get_strategy`` until two consecutive responses match.

        Returns ``(final_body, total_wait_ms, history)``. Aborts if no two
        consecutive identical responses arrive within ``timeout_s`` (30
        min default).
        """
        deadline = time.monotonic() + timeout_s
        prev_sig: str | None = None
        history: list[dict] = []
        wait_start = time.monotonic()
        while time.monotonic() < deadline:
            body, latency_ms = self.get_strategy()
            sig = self._strategy_signature(body)
            history.append(
                {
                    "ts": time.time(),
                    "latency_ms": latency_ms,
                    "signature": sig,
                    "n_strategies": len(body.get("strategies") or []),
                }
            )
            if sig is not None and sig == prev_sig and sig != "[]":
                total_wait_ms = (time.monotonic() - wait_start) * 1000.0
                return body, total_wait_ms, history
            prev_sig = sig
            time.sleep(interval_s)
        raise AutographError(
            f"strategy did not stabilize within {timeout_s:.0f}s "
            f"(history={len(history)} polls)"
        )

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def orchestrate(
        self,
        *,
        replicas: int = 1,
        max_retries: int = 3,
        partition_ids: list[str] | None = None,
    ) -> tuple[dict, float]:
        payload: dict[str, Any] = {
            "replicas": replicas,
            "max_retries": max_retries,
        }
        if partition_ids is not None:
            payload["partition_ids"] = partition_ids
        return self._request("POST", "/v1/orchestrate", payload=payload)

    def orchestrate_with_wait(
        self,
        *,
        replicas: int = 1,
        max_retries: int = 3,
        partition_ids: list[str] | None = None,
        wait_for_prior_s: float = 1800.0,
        retry_interval_s: float = 30.0,
    ) -> tuple[dict, float, float]:
        """Wrap ``orchestrate`` with retry-on-OrchestrationInProgress.

        AutoGraph allows only one active orchestration at a time. If a
        previous scale's orchestration is still running (which can happen
        even after our collection-watch heuristic declares completion),
        the kick-off returns 409 with ``OrchestrationInProgressError``.
        We catch that, sleep, and retry up to ``wait_for_prior_s``.

        Returns ``(response, kickoff_latency_ms, wait_for_prior_ms)``.
        ``kickoff_latency_ms`` is the latency of the *successful* call,
        NOT including the wait for the prior orchestration.
        """
        deadline = time.monotonic() + wait_for_prior_s
        wait_started = time.monotonic()
        while True:
            try:
                response, latency_ms = self.orchestrate(
                    replicas=replicas,
                    max_retries=max_retries,
                    partition_ids=partition_ids,
                )
                wait_ms = (time.monotonic() - wait_started) * 1000.0
                return response, latency_ms, wait_ms
            except AutographError as e:
                msg = str(e)
                if "OrchestrationInProgressError" not in msg and "already in progress" not in msg.lower():
                    raise
                if time.monotonic() >= deadline:
                    raise AutographError(
                        f"Prior orchestration still in progress after waiting "
                        f"{wait_for_prior_s:.0f}s: {msg}"
                    ) from e
                log.info(
                    "Orchestration still in progress; sleeping %.0fs before retry...",
                    retry_interval_s,
                )
                time.sleep(retry_interval_s)
