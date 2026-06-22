"""Tiny on-disk JWT cache shared by AutographClient and ACPClient.

Both clients hit the same ``ARANGO_URL/_open/auth`` endpoint with the same
credentials, and the resulting bearer token is good for ~1h. Without this
cache, every CLI invocation (``status``, ``provision``, ``ingest``, ...)
re-authenticates from scratch, and the URL-probe loop in
:mod:`provision` re-authenticates per probe candidate. With it, the first
client writes the token and every subsequent client (in this process or the
next one) reuses it until ``exp - 60s`` passes.

Records are keyed by ``(arango_url, user)`` so swapping ``ARANGO_USER`` in
``.env`` does not silently reuse the wrong credential — the lookup just
misses and we re-auth.

Security note: the token is written in plaintext, chmod 0600, next to the
script and gitignored. Same threat model as the password in ``.env``.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

EXP_SKEW_S = 60
"""Refuse to hand out a token that expires in <= 60s; avoids in-flight expiry."""


def _key(arango_url: str, user: str) -> str:
    return f"{arango_url.rstrip('/')}::{user}"


def _decode_exp(token: str) -> int | None:
    """Return the ``exp`` claim (unix seconds) or ``None`` if unparseable."""
    try:
        segments = token.split(".")
        if len(segments) < 2:
            return None
        payload_b64 = segments[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        if not isinstance(payload, dict):
            return None
        exp = payload.get("exp")
        if isinstance(exp, (int, float)):
            return int(exp)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    return None


def _read_all(cache_path: Path) -> dict[str, Any]:
    if not cache_path.exists():
        return {}
    try:
        with cache_path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            return data
    except (OSError, json.JSONDecodeError) as e:
        log.debug("JWT cache at %s unreadable (%s); ignoring", cache_path, e)
    return {}


def _write_all(cache_path: Path, data: dict[str, Any]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=cache_path.name + ".", dir=str(cache_path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
        os.replace(tmp_path, cache_path)
        try:
            os.chmod(cache_path, 0o600)
        except OSError:
            pass
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def read_jwt(arango_url: str, user: str, cache_path: Path | None) -> str | None:
    """Return a still-valid cached JWT, or ``None``.

    A token is "still valid" if the ``exp`` claim is more than
    :data:`EXP_SKEW_S` seconds in the future. Anything else (expired,
    missing ``exp``, parse error, missing record, missing file) returns
    ``None`` and the caller should re-authenticate.
    """
    if cache_path is None:
        return None
    data = _read_all(cache_path)
    record = data.get(_key(arango_url, user))
    if not isinstance(record, dict):
        return None
    token = record.get("jwt")
    exp = record.get("exp")
    if not isinstance(token, str) or not isinstance(exp, (int, float)):
        return None
    if int(exp) - EXP_SKEW_S <= int(time.time()):
        log.debug(
            "Cached JWT for %s as %s expired (exp=%s, now=%s)",
            arango_url, user, exp, int(time.time()),
        )
        return None
    return token


def write_jwt(
    arango_url: str, user: str, token: str, cache_path: Path | None
) -> None:
    """Persist ``token`` to ``cache_path``. No-op if path is ``None``.

    Decodes ``exp`` from the token itself; if the token has no parseable
    ``exp`` we still write it but with ``exp=0`` so the next read treats
    it as expired and forces a re-auth.
    """
    if cache_path is None:
        return
    exp = _decode_exp(token) or 0
    data = _read_all(cache_path)
    data[_key(arango_url, user)] = {
        "jwt": token,
        "exp": exp,
        "obtained_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        _write_all(cache_path, data)
    except OSError as e:
        log.debug("Failed to write JWT cache to %s: %s", cache_path, e)


def clear_jwt(arango_url: str, user: str, cache_path: Path | None) -> None:
    """Drop the cached entry for ``(arango_url, user)``. No-op if missing."""
    if cache_path is None or not cache_path.exists():
        return
    data = _read_all(cache_path)
    if data.pop(_key(arango_url, user), None) is None:
        return
    try:
        if data:
            _write_all(cache_path, data)
        else:
            cache_path.unlink()
    except OSError as e:
        log.debug("Failed to clear JWT cache entry in %s: %s", cache_path, e)
