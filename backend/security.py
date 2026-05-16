"""
URL validation and SSRF guards.

Every user-submitted URL passes through validate_url() before touching the engine.
Rejects: non-http(s) schemes, unresolvable hosts, any hostname that resolves
to a private / loopback / link-local / cloud-metadata IP address.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

# All networks we must never reach.
_BLOCKED = [
    # Loopback
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    # Private RFC-1918
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    # Link-local / AWS metadata / GCP metadata
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
    # Unique-local IPv6
    ipaddress.ip_network("fc00::/7"),
    # CGNAT
    ipaddress.ip_network("100.64.0.0/10"),
    # "This" network
    ipaddress.ip_network("0.0.0.0/8"),
    # Reserved
    ipaddress.ip_network("240.0.0.0/4"),
    # Documentation ranges (shouldn't route but block anyway)
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
]

# Hostnames that are always private regardless of DNS
_BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",  # AWS / GCP / Azure metadata as hostname
}


def _is_blocked_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparseable = reject
    return any(addr in net for net in _BLOCKED)


def validate_url(url: str) -> None:
    """
    Raise ValueError with a user-friendly message if the URL is unsafe or invalid.
    Performs DNS resolution and rejects private/internal destinations.
    """
    if not url or not url.strip():
        raise ValueError("URL is required.")

    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must use http:// or https://.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL has no hostname.")

    # Block known bad hostnames before even resolving
    if hostname.lower() in _BLOCKED_HOSTNAMES:
        raise ValueError(
            f"'{hostname}' is a private or reserved hostname and is not allowed."
        )

    # Block .local, .internal, .corp, .lan — common internal TLDs
    lower = hostname.lower()
    for suffix in (".local", ".internal", ".corp", ".lan", ".intranet", ".home"):
        if lower.endswith(suffix):
            raise ValueError(
                f"Hostname '{hostname}' looks like an internal address and is not allowed."
            )

    # Resolve all A/AAAA records and check each one
    try:
        results = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve '{hostname}': {exc}") from exc

    if not results:
        raise ValueError(f"Hostname '{hostname}' did not resolve to any address.")

    resolved_ips = {r[4][0] for r in results}
    for ip in resolved_ips:
        if _is_blocked_ip(ip):
            raise ValueError(
                f"'{hostname}' resolves to {ip}, which is a private or reserved "
                "address. Only publicly reachable URLs are allowed."
            )
