"""Security primitives for the isolated public-source intelligence app."""
from __future__ import annotations
import hmac
import ipaddress
import os
import socket
from urllib.parse import urlparse

from fastapi import Header, HTTPException


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("ADMIN_API_KEY", "")
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail="Admin access is disabled until ADMIN_API_KEY is set to a random secret of at least 32 characters.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="Invalid admin key.")


def validate_allowlisted_url(url: str, allowed_hosts: set[str]) -> str:
    """Allow HTTPS only, exact host allowlist, no credentials or nonstandard ports."""
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname or p.username or p.password:
        raise ValueError("Only credential-free HTTPS URLs are permitted.")
    host = p.hostname.lower().rstrip(".")
    if host not in allowed_hosts:
        raise ValueError("URL host is not on the official-source allowlist.")
    if p.port not in (None, 443):
        raise ValueError("Non-standard ports are not permitted.")
    # Reject IP literals entirely; the configured registry uses DNS names.
    try:
        ipaddress.ip_address(host)
        raise ValueError("IP-literal URLs are not permitted.")
    except ValueError as exc:
        if str(exc) == "IP-literal URLs are not permitted.":
            raise
    return url


def resolve_public_host(host: str) -> None:
    """Best-effort SSRF guard; the fetcher also disables redirects."""
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("Source hostname could not be resolved.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("Source resolved to a non-public IP address.")
