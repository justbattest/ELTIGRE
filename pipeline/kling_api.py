"""
Kling AI Motion Control — connecteur API officiel (Kuaishou).

Flow :
  1. JWT signé (HMAC-SHA256) depuis access_key + secret_key
  2. POST /v1/videos/motion-control → task_id
  3. Poll GET /v1/videos/motion-control/{task_id} jusqu'à succeed/failed
  4. Retourne l'URL de la vidéo générée

Upload vidéo concept :
  higgsfield upload create <path> → UUID → URL CDN Higgsfield
  (la vidéo concept est un fichier local qu'on doit exposer en URL publique)

Référence : https://app.klingai.com/dev/document-api/apiReference/model/motionControl
"""

import asyncio
import base64
import json
import time
from pathlib import Path

import httpx
import jwt as pyjwt

# ─── Config ────────────────────────────────────────────────────────────────────

KLING_API_BASE = "https://api-singapore.klingai.com"
KLING_MODEL    = "kling-v3"   # Kling 3.0 Motion Control
POLL_INTERVAL  = 8            # secondes entre chaque poll
JWT_EXPIRES    = 1800         # 30 min (largement suffisant)


# ─── JWT ───────────────────────────────────────────────────────────────────────

def generate_kling_jwt(access_key: str, secret_key: str) -> str:
    """Génère un JWT HMAC-SHA256 pour l'API Kling."""
    now = int(time.time())
    payload = {
        "iss": access_key,
        "exp": now + JWT_EXPIRES,
        "nbf": now - 5,
    }
    return pyjwt.encode(payload, secret_key, algorithm="HS256")


# ─── Upload vidéo concept ───────────────────────────────────────────────────────

async def upload_video_for_kling(user_token: str, video_path: str, refresh_token: str = "") -> str:
    """Upload la vidéo concept via Higgsfield CLI et retourne une URL publique.

    Higgsfield CDN est accessible publiquement → l'URL peut être passée
    directement à l'API Kling en tant que video_url.
    refresh_token permet au CLI d'auto-rafraîchir le Clerk JWT si expiré.
    """
    from pipeline.generator import run_higgsfield_for_user

    result = await run_higgsfield_for_user(
        user_token,
        ["higgsfield", "upload", "create", video_path, "--json"],
        timeout=120,
        refresh_token=refresh_token,
    )

    raw = result.strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # La CLI peut retourner juste l'UUID en mode non-JSON
        raw = raw.strip('"').strip()
        if len(raw) > 8:
            return f"https://d8j0ntlcm91z4.cloudfront.net/{raw}"
        raise Exception(f"Upload: réponse non parseable: {raw[:200]}")

    if isinstance(data, dict):
        # Cherche une URL directe
        for key in ("url", "cdn_url", "download_url", "public_url"):
            if data.get(key):
                return data[key]
        # Sinon construit depuis l'UUID
        for key in ("id", "upload_id", "media_id"):
            if data.get(key):
                return f"https://d8j0ntlcm91z4.cloudfront.net/{data[key]}"

    raise Exception(f"Upload: impossible d'extraire l'URL depuis: {raw[:300]}")


# ─── Image en Base64 (optionnel) ───────────────────────────────────────────────

def image_to_base64(image_path: str) -> str:
    """Encode une image locale en Base64 brut (sans prefix data:...).

    Kling accepte Base64 pour image_url.
    Note : raw Base64 SANS préfixe 'data:image/...'
    """
    return base64.b64encode(Path(image_path).read_bytes()).decode()


# ─── API calls ─────────────────────────────────────────────────────────────────

async def create_motion_control_task(
    access_key: str,
    secret_key: str,
    image_source: str,          # URL publique OU Base64 brut
    video_url: str,             # URL publique (obligatoire)
    mode: str = "std",
    character_orientation: str = "video",
    prompt: str | None = None,
) -> str:
    """Soumet une tâche Motion Control. Retourne le task_id."""
    token = generate_kling_jwt(access_key, secret_key)

    payload: dict = {
        "model_name": KLING_MODEL,
        "image_url": image_source,
        "video_url": video_url,
        "mode": mode,
        "character_orientation": character_orientation,
        "keep_original_sound": "yes",
    }
    if prompt:
        payload["prompt"] = prompt[:2500]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{KLING_API_BASE}/v1/videos/motion-control",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=utf-8",
            },
            json=payload,
        )

        # Log the raw response for debugging before raising
        if resp.status_code != 200:
            body_text = resp.text[:500]
            raise Exception(
                f"HTTP {resp.status_code} from Kling API: {body_text}"
            )

        data = resp.json()

    if data.get("code") != 0:
        raise Exception(
            f"Kling API error code={data.get('code')}: {data.get('message', 'unknown')} "
            f"| request_id={data.get('request_id', '?')}"
        )

    return data["data"]["task_id"]


async def poll_motion_control_task(
    access_key: str,
    secret_key: str,
    task_id: str,
    timeout: int = 900,
) -> str:
    """Poll jusqu'à succeed/failed. Retourne l'URL de la vidéo."""
    deadline = time.time() + timeout

    while time.time() < deadline:
        token = generate_kling_jwt(access_key, secret_key)

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{KLING_API_BASE}/v1/videos/motion-control/{task_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            data = resp.json()

        if data.get("code") != 0:
            raise Exception(
                f"Kling poll error {data.get('code')}: {data.get('message', 'unknown')}"
            )

        task = data["data"]
        status = task.get("task_status", "")

        if status == "succeed":
            videos = task.get("task_result", {}).get("videos", [])
            if videos:
                return videos[0]["url"]
            raise Exception("Task succeeded but no video in response")

        if status == "failed":
            raise Exception(
                f"Kling task failed: {task.get('task_status_msg', 'unknown reason')}"
            )

        # submitted | processing → continue
        await asyncio.sleep(POLL_INTERVAL)

    raise asyncio.TimeoutError(f"Kling task {task_id} timed out after {timeout}s")


# ─── Entry point ───────────────────────────────────────────────────────────────

async def run_kling_motion_control(
    access_key: str,
    secret_key: str,
    image_source: str,          # URL Seedream (CloudFront) ou Base64
    video_url: str,             # URL vidéo concept uploadée
    mode: str = "std",
    prompt: str | None = None,
    timeout: int = 900,
) -> dict:
    """Flow complet Kling Motion Control. Retourne {"url": ...} ou {"error": ...}."""
    try:
        task_id = await create_motion_control_task(
            access_key=access_key,
            secret_key=secret_key,
            image_source=image_source,
            video_url=video_url,
            mode=mode,
            prompt=prompt,
        )

        result_url = await poll_motion_control_task(
            access_key=access_key,
            secret_key=secret_key,
            task_id=task_id,
            timeout=timeout,
        )

        return {"url": result_url}

    except asyncio.TimeoutError:
        return {"url": None, "error": "TIMEOUT_KLING_MC"}
    except Exception as e:
        return {"url": None, "error": str(e)[:400]}
