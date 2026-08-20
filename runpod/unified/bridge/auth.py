"""Authentication helpers for the public ComfyUI bridge routes."""

from __future__ import annotations

import secrets


def authorization_error(authorization: str, token: str) -> tuple[int, str] | None:
    """Return an HTTP error when a bridge request is not authorized."""

    expected_token = token.strip()
    if not expected_token:
        return 503, "AI VTuber bridge token is not configured."

    supplied = authorization.strip()
    if not supplied:
        return 401, "Authorization header is required."

    expected = f"Bearer {expected_token}"
    if not secrets.compare_digest(supplied, expected):
        return 403, "Authorization token is invalid."
    return None


def bearer_header(token: str) -> str:
    """Build the trusted Authorization header sent to private sidecars."""

    return f"Bearer {token.strip()}"
