from __future__ import annotations

import ipaddress
import re
from collections.abc import Callable
from urllib.parse import urlsplit

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, RedirectResponse

from api.core.security import Credential, Scope

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
PUBLIC_REMOTE_PATHS = {"/health", "/pair", "/api/v1/auth/pair"}
_DNS_HOST = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$")


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"detail": message, "error": {"code": code, "message": message}},
    )


def _is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host.lower() == "localhost"


def _host_name(host_header: str) -> str:
    try:
        return urlsplit(f"//{host_header}").hostname or ""
    except ValueError:
        return ""


def _configured_hosts(value: str) -> frozenset[str]:
    """Return explicit DNS names from VOX_TRUSTED_HOSTS.

    Configuration deliberately accepts only exact DNS names—never schemes,
    ports, IP ranges, or wildcards—so an accidental broad allowlist cannot
    turn the local host check into an internet-facing one.
    """
    hosts: set[str] = set()
    for item in value.split(","):
        hostname = item.strip().lower().rstrip(".")
        if _DNS_HOST.fullmatch(hostname):
            hosts.add(hostname)
    return frozenset(hosts)


def normalize_configured_hosts(value: str) -> str:
    entries = [item.strip().lower().rstrip(".") for item in value.split(",") if item.strip()]
    invalid = [entry for entry in entries if not _DNS_HOST.fullmatch(entry)]
    if invalid:
        raise ValueError("trusted hosts must be exact DNS names without ports, schemes, or wildcards")
    return ",".join(dict.fromkeys(entries))


def _trusted_host(host_header: str, configured_hosts: str = "") -> bool:
    hostname = _host_name(host_header)
    if not hostname:
        return False
    normalized = hostname.lower().rstrip(".")
    if normalized in _configured_hosts(configured_hosts):
        return True
    if normalized == "localhost" or normalized.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(normalized)
        return address.is_loopback or address.is_private or address.is_link_local
    except ValueError:
        return False


def _origin_host(origin: str | None) -> str:
    if not origin:
        return ""
    try:
        return urlsplit(origin).netloc.lower()
    except ValueError:
        return ""


def _required_scope(path: str, method: str) -> Scope:
    if path.startswith(("/api/v1/settings", "/api/v1/logs", "/api/v1/backups", "/api/v1/alerts")):
        return Scope.ADMIN
    if path.startswith("/api/v1/auth/") and path != "/api/v1/auth/pair":
        return Scope.ADMIN
    if method not in SAFE_METHODS:
        if path == "/api/v1/tts" or (path.startswith("/api/v1/tts/") and path.endswith("/cancel")):
            return Scope.GENERATE
        return Scope.ADMIN
    if path.startswith("/api/v1/jobs/") and path.endswith("/audio"):
        return Scope.GENERATE
    if path.startswith("/api/v1/voices/") and path.endswith("/audio"):
        return Scope.GENERATE
    return Scope.READ


def _has_scope(credential: Credential, required: Scope) -> bool:
    scopes = credential.scopes
    if Scope.ADMIN in scopes:
        return True
    if required is Scope.READ:
        return bool(scopes & {Scope.READ, Scope.GENERATE})
    return required in scopes


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, lan_enabled: Callable[[], bool], trusted_hosts: Callable[[], str] = lambda: ""):
        super().__init__(app)
        self.lan_enabled = lan_enabled
        self.trusted_hosts = trusted_hosts

    async def dispatch(self, request: Request, call_next):
        host_header = request.headers.get("host", "")
        if not _trusted_host(host_header, self.trusted_hosts()):
            return _error(400, "untrusted_host", "The request Host is not trusted.")

        if request.method not in SAFE_METHODS:
            fetch_site = request.headers.get("sec-fetch-site", "").lower()
            origin = request.headers.get("origin")
            origin_host = _origin_host(origin)
            if fetch_site == "cross-site" or (origin and origin_host != host_header.lower()):
                return _error(403, "cross_site_request", "Cross-site mutations are not allowed.")

        client_host = request.client.host if request.client else ""
        if _is_loopback(client_host):
            request.state.is_loopback = True
            request.state.credential = None
            return await call_next(request)

        request.state.is_loopback = False
        if request.url.path == "/health":
            return JSONResponse({"status": "ok"})
        if not self.lan_enabled():
            return _error(403, "lan_disabled", "Vox LAN access is disabled.")
        if request.url.path in PUBLIC_REMOTE_PATHS:
            return await call_next(request)

        store = request.app.state.security_store
        authorization = request.headers.get("authorization", "")
        bearer = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
        secret = bearer or request.cookies.get("vox_session", "")
        credential = store.authenticate(secret)
        if credential is None:
            if request.url.path.startswith("/api/"):
                return _error(401, "pairing_required", "Pair this device with Vox before continuing.")
            return RedirectResponse("/pair", status_code=307)
        required = _required_scope(request.url.path, request.method)
        if not _has_scope(credential, required):
            return _error(403, "insufficient_scope", f"This action requires the {required.value} scope.")
        request.state.credential = credential
        return await call_next(request)
