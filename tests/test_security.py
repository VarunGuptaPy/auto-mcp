"""Tests for URL validation and SSRF guards."""
from __future__ import annotations

import ipaddress
import socket
from unittest.mock import patch

import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.security import validate_url, _is_blocked_ip


# ---------------------------------------------------------------------------
# _is_blocked_ip unit tests
# ---------------------------------------------------------------------------

class TestIsBlockedIp:
    def test_loopback_v4(self):
        assert _is_blocked_ip("127.0.0.1")

    def test_loopback_v4_alt(self):
        assert _is_blocked_ip("127.255.255.255")

    def test_loopback_v6(self):
        assert _is_blocked_ip("::1")

    def test_private_10(self):
        assert _is_blocked_ip("10.0.0.1")

    def test_private_10_edge(self):
        assert _is_blocked_ip("10.255.255.255")

    def test_private_172(self):
        assert _is_blocked_ip("172.16.0.1")

    def test_private_172_edge(self):
        assert _is_blocked_ip("172.31.255.255")

    def test_private_192_168(self):
        assert _is_blocked_ip("192.168.1.1")

    def test_link_local_metadata(self):
        # AWS / GCP / Azure metadata endpoint
        assert _is_blocked_ip("169.254.169.254")

    def test_link_local_other(self):
        assert _is_blocked_ip("169.254.0.1")

    def test_cgnat(self):
        assert _is_blocked_ip("100.64.0.1")

    def test_public_ip_ok(self):
        assert not _is_blocked_ip("1.1.1.1")

    def test_public_ip_google_ok(self):
        assert not _is_blocked_ip("8.8.8.8")

    def test_invalid_string(self):
        assert _is_blocked_ip("not-an-ip")


# ---------------------------------------------------------------------------
# validate_url integration tests
# ---------------------------------------------------------------------------

class TestValidateUrl:
    def test_empty_string_raises(self):
        with pytest.raises(ValueError, match="required"):
            validate_url("")

    def test_none_equivalent_raises(self):
        with pytest.raises(ValueError):
            validate_url("   ")

    def test_non_http_scheme_raises(self):
        with pytest.raises(ValueError, match="http"):
            validate_url("ftp://example.com")

    def test_file_scheme_raises(self):
        with pytest.raises(ValueError, match="http"):
            validate_url("file:///etc/passwd")

    def test_no_hostname_raises(self):
        with pytest.raises(ValueError):
            validate_url("https://")

    def test_localhost_raises(self):
        with pytest.raises(ValueError):
            validate_url("http://localhost:8080")

    def test_localhost_path_raises(self):
        with pytest.raises(ValueError):
            validate_url("http://localhost/admin")

    def test_127_direct_raises(self):
        # Direct IP that looks like a URL — getaddrinfo still resolves it
        with pytest.raises(ValueError):
            validate_url("http://127.0.0.1:8080")

    def test_ipv6_loopback_raises(self):
        with pytest.raises(ValueError):
            validate_url("http://[::1]/")

    def test_metadata_ip_raises(self):
        with pytest.raises(ValueError):
            validate_url("http://169.254.169.254/latest/meta-data/")

    def test_private_10_raises(self):
        with pytest.raises(ValueError):
            validate_url("http://10.0.0.1/")

    def test_private_192_raises(self):
        with pytest.raises(ValueError):
            validate_url("http://192.168.1.1/")

    def test_dotlocal_raises(self):
        with pytest.raises(ValueError, match="internal"):
            validate_url("http://myapp.local/")

    def test_dotinternal_raises(self):
        with pytest.raises(ValueError, match="internal"):
            validate_url("http://service.internal/api")

    def test_unresolvable_raises(self):
        with pytest.raises(ValueError, match="resolve"):
            validate_url("https://this-domain-definitely-does-not-exist-xyzxyz123.com/")

    def test_domain_resolving_to_private_raises(self):
        """A domain whose A record is a private IP must be rejected."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.1", 0))
            ]
            with pytest.raises(ValueError, match="private"):
                validate_url("https://innocent-looking-domain.com/")

    def test_domain_resolving_to_metadata_raises(self):
        """301 redirect to metadata endpoint — domain resolves to 169.254.169.254."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("169.254.169.254", 0))
            ]
            with pytest.raises(ValueError, match="private"):
                validate_url("https://evil.example.com/")

    def test_public_http_ok(self):
        # Should not raise — uses a real public hostname
        # We mock DNS to avoid actual network calls in tests
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("1.1.1.1", 0))
            ]
            validate_url("https://news.ycombinator.com/")  # should not raise

    def test_public_https_ok(self):
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))
            ]
            validate_url("https://example.com/path?q=1")

    def test_metadata_google_internal_raises(self):
        with pytest.raises(ValueError):
            validate_url("http://metadata.google.internal/computeMetadata/v1/")
