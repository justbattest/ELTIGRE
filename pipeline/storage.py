#!/usr/bin/env python3
"""
storage.py — Persistance Supabase Storage des assets de modèle (set Stage A + edits Stage B).

Upload des PNG vers le bucket privé `model-assets`, préfixés PAR USER connecté :
    {userId}/refset/{runId}/ref-XX.png      (Stage A)
    {userId}/edits/{runId}/<stem>-morph.png (Stage B)

Env (passés par la route Next.js) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MODELIFY_STORAGE_BUCKET.
Si absent → no-op (la génération continue, juste pas de copie durable).
"""
from __future__ import annotations

import os

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = os.environ.get("MODELIFY_STORAGE_BUCKET", "model-assets")


def enabled() -> bool:
    return bool(SUPABASE_URL and SERVICE_ROLE)


def upload_png(dest_path: str, data: bytes) -> bool:
    """Upload (upsert) `data` PNG vers {bucket}/{dest_path}. True si OK, False sinon (jamais d'exception)."""
    if not enabled():
        return False
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{dest_path.lstrip('/')}"
    try:
        r = requests.post(
            url,
            headers={
                "apikey": SERVICE_ROLE,
                "Authorization": f"Bearer {SERVICE_ROLE}",
                "Content-Type": "image/png",
                "x-upsert": "true",
            },
            data=data,
            timeout=120,
        )
        return r.status_code < 300
    except Exception:  # noqa: BLE001
        return False
