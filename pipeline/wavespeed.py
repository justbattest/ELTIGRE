#!/usr/bin/env python3
"""
wavespeed.py — Client WaveSpeed (Seedream 4.5 edit i2i) — MOTEUR PAR DÉFAUT du Stage B.

Même modèle Seedream 4.5 que ModelArk, même prix (~$0.04/img), mais SANS couche de modération
(décision 2026-06-25, brief Body Morph §2.1). Donc le suggestif/back-view passe sans blocage.

API asynchrone : submit → poll.
  Submit : POST https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit
  Body   : { prompt, images:[data_uri|url], size:"W*H" (séparateur *), enable_base64_output, enable_sync_mode }
  Réponse: data.id + data.urls.get (URL de poll)
  Poll   : GET data.urls.get → data.status (created|processing|completed|failed), data.outputs[0] = URL image

Env : WAVESPEED_API_KEY (passée par la route Next.js).
"""
from __future__ import annotations

import base64
import mimetypes
import os
import time
from pathlib import Path
from typing import List, Union

import requests

WAVESPEED_API_KEY = os.environ.get("WAVESPEED_API_KEY", "")
ENDPOINT = "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit"


class WaveSpeedError(Exception):
    pass


def _as_input(image: str) -> str:
    if image.startswith("http") or image.startswith("data:"):
        return image
    p = Path(image)
    mime = mimetypes.guess_type(str(p))[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"


def _outputs_to_bytes(outs: list) -> bytes:
    o = outs[0]
    if isinstance(o, str) and o.startswith("http"):
        return requests.get(o, timeout=180).content
    if isinstance(o, str) and o.startswith("data:"):
        return base64.b64decode(o.split(",", 1)[1])
    return base64.b64decode(o)


def edit(
    prompt: str,
    image: Union[str, List[str]],
    width: int,
    height: int,
    *,
    timeout: int = 300,
    poll_interval: float = 2.0,
) -> bytes:
    """Édite l'image source via Seedream 4.5 sur WaveSpeed. Retourne les bytes de l'image."""
    if not WAVESPEED_API_KEY:
        raise WaveSpeedError("WAVESPEED_API_KEY manquant dans l'environnement")

    imgs = image if isinstance(image, list) else [image]
    imgs = [_as_input(i) for i in imgs]
    body = {
        "prompt": prompt,
        "images": imgs,
        "size": f"{width}*{height}",          # ⚠️ séparateur '*' (pas 'x') côté WaveSpeed
        "enable_base64_output": False,
        "enable_sync_mode": False,
    }
    headers = {"Authorization": f"Bearer {WAVESPEED_API_KEY}", "Content-Type": "application/json"}

    r = requests.post(ENDPOINT, headers=headers, json=body, timeout=120)
    if r.status_code >= 400:
        raise WaveSpeedError(f"submit {r.status_code}: {r.text[:200]}")
    data = (r.json() or {}).get("data") or {}

    # Certaines réponses contiennent déjà les outputs (mode quasi-sync)
    if data.get("outputs"):
        return _outputs_to_bytes(data["outputs"])

    poll_url = (data.get("urls") or {}).get("get")
    rid = data.get("id")
    if not poll_url and rid:
        poll_url = f"https://api.wavespeed.ai/api/v3/predictions/{rid}/result"
    if not poll_url:
        raise WaveSpeedError(f"pas d'URL de poll dans la réponse: {str(data)[:200]}")

    auth = {"Authorization": f"Bearer {WAVESPEED_API_KEY}"}
    deadline = time.time() + timeout
    while time.time() < deadline:
        pr = requests.get(poll_url, headers=auth, timeout=60).json()
        d = pr.get("data") or pr
        st = d.get("status")
        if st == "completed":
            outs = d.get("outputs") or []
            if not outs:
                raise WaveSpeedError("status completed mais aucun output")
            return _outputs_to_bytes(outs)
        if st in ("failed", "error"):
            raise WaveSpeedError(f"génération échouée: {str(d.get('error') or d)[:200]}")
        time.sleep(poll_interval)
    raise WaveSpeedError("timeout de polling")
