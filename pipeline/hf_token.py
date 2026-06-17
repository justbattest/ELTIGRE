"""
Shared Higgsfield token auto-refresh.

No browser popup needed — uses the refresh_token stored in DB.
The popup (device code flow) is only required for the INITIAL connection.
Subsequent token renewals are fully silent HTTP calls to Higgsfield's refresh endpoint.

Used by: generator.py, motion_control.py, carousel_variations.py
"""

import asyncio
import json
import ssl
import urllib.request

# Process-level token cache (shared across all coroutines in the same subprocess)
_hf_token_cache: dict = {}
_hf_token_lock: asyncio.Lock | None = None


def _get_token_lock() -> asyncio.Lock:
    global _hf_token_lock
    if _hf_token_lock is None:
        _hf_token_lock = asyncio.Lock()
    return _hf_token_lock


async def refresh_hf_access_token(refresh_token: str) -> str:
    """POST https://fnf-device-auth.higgsfield.ai/refresh → new access_token.

    Silent: no browser popup, no user action needed.
    Updates the in-process cache so concurrent coroutines get the new token.
    """
    ctx = ssl.create_default_context()

    def _do() -> dict:
        req = urllib.request.Request(
            "https://fnf-device-auth.higgsfield.ai/refresh",
            data=json.dumps({"refresh_token": refresh_token}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return json.loads(r.read().decode())

    data = await asyncio.get_event_loop().run_in_executor(None, _do)

    tok = data.get("access_token")
    if not tok:
        raise RuntimeError(f"Higgsfield refresh API: pas d'access_token dans la réponse: {data}")

    new_refresh = data.get("refresh_token", refresh_token)
    _hf_token_cache["access_token"] = tok
    _hf_token_cache["refresh_token"] = new_refresh
    return tok


def is_session_expired(err: str) -> bool:
    """Check if a Higgsfield CLI error message indicates an expired session."""
    e = err.lower()
    return (
        "session expired" in e
        or "hint: run" in e
        or "unauthenticated" in e
        or "please login" in e
        or "not logged in" in e
    )
