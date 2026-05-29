"""
Motion Control — génération batch de 4 vidéos Kling 3.0 Motion Control.

Flow par outfit (4 en parallèle) :
1. Seedream v4.5 img2img : change UNIQUEMENT l'outfit sur l'image concept uploadée
   (pose, angle, fond, éclairage, visage, corps restent identiques)
2. Kling 3.0 Motion Control (API officielle) : applique la motion de la vidéo de référence
3. Upload Drive → Motion Control/<run_id>/mc_<i+1>.mp4

Events JSON stdout (même protocole que video_studio.py / studio.py).
"""

import argparse
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

import httpx
from PIL import Image as PILImage

from pipeline.generator import run_higgsfield_for_user

# Résolution max acceptée par Kling Motion Control (côté le plus long)
# Seedream 9:16 à 2048px → 2048×3641 → dans les limites Kling
KLING_MAX_PX = 2048

# ─── Outfit styles ─────────────────────────────────────────────────────────────

# Labels d'affichage uniquement — le prompt est générique pour laisser Seedream varier librement.
OUTFIT_STYLES = [
    {"key": "look_1", "label": "Look 1", "emoji": "✨"},
    {"key": "look_2", "label": "Look 2", "emoji": "🔥"},
    {"key": "look_3", "label": "Look 3", "emoji": "💎"},
    {"key": "look_4", "label": "Look 4", "emoji": "⚡"},
]


MAX_CONCURRENT = 4  # 4 outfits en parallèle (Seedream)

# Verrou global : une seule soumission Kling à la fois.
# Les retry loops de plusieurs outfits ne se chevauchent donc jamais → plus de 429 en cascade.
# Le polling se fait en parallèle une fois le task_id obtenu (verrou relâché).
_KLING_SUBMIT_LOCK: asyncio.Lock | None = None

def _get_kling_lock() -> asyncio.Lock:
    """Retourne (ou crée) le verrou global de soumission Kling."""
    global _KLING_SUBMIT_LOCK
    if _KLING_SUBMIT_LOCK is None:
        _KLING_SUBMIT_LOCK = asyncio.Lock()
    return _KLING_SUBMIT_LOCK


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def download_image(url: str, suffix: str = ".png") -> str:
    """Télécharge une URL image vers un fichier temp local. Retourne le chemin.

    Utilise httpx (async, gère les certificats SSL correctement sur macOS).
    """
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False, prefix="hf_mc_")
    tmp_path = tmp.name
    tmp.close()
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        Path(tmp_path).write_bytes(resp.content)
    return tmp_path


async def resize_image_for_kling(url: str, user_token: str, shortcode: str) -> str:
    """Télécharge l'image Seedream, la redimensionne à max 1280px, ré-uploade vers CDN.

    Kling Motion Control rejette les images trop grandes (>1280px sur le grand côté).
    Retourne une URL CDN de l'image redimensionnée.
    """
    from pipeline.kling_api import upload_video_for_kling

    # Téléchargement
    tmp_orig = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False, prefix="hf_orig_")
    tmp_orig.close()
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        Path(tmp_orig.name).write_bytes(resp.content)

    # Redimensionnement
    tmp_small = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False, prefix="hf_small_")
    tmp_small.close()
    try:
        img = PILImage.open(tmp_orig.name).convert("RGB")
        w, h = img.size
        if max(w, h) > KLING_MAX_PX:
            scale = KLING_MAX_PX / max(w, h)
            new_w, new_h = int(w * scale), int(h * scale)
            img = img.resize((new_w, new_h), PILImage.LANCZOS)
            print(json.dumps({
                "type": "warn",
                "msg": f"[{shortcode}] Image redimensionnée {w}×{h} → {new_w}×{new_h} pour Kling"
            }), flush=True)
        img.save(tmp_small.name, "JPEG", quality=88)
    finally:
        Path(tmp_orig.name).unlink(missing_ok=True)

    # Upload CDN
    try:
        cdn_url = await upload_video_for_kling(user_token, tmp_small.name)
        return cdn_url
    finally:
        Path(tmp_small.name).unlink(missing_ok=True)


# ─── Core generation helpers ───────────────────────────────────────────────────

# Prompt unique — général pour que les 4 générations soient naturellement différentes.
# Pas d'outfit spécifique : Seedream choisit librement parmi sporty/casual/trendy/party.
SEEDREAM_OUTFIT_PROMPT = (
    "Using the reference image provided, give this person a completely new outfit. "
    "The outfit must be sexy and stylish — always show maximum skin: deep neckline, "
    "midriff, short hemline, or form-fitting silhouette. "
    "Style can be anything: sporty, casual streetwear, trendy, party, chic — "
    "choose freely to make this generation unique. "
    "Preserve strictly identical: the person's face, facial features, skin tone, hair, "
    "body shape, body proportions, exact pose, hand and arm positions, leg position, "
    "background scene, background details, lighting direction, shadows, "
    "camera angle, framing, and photo composition. "
    "This is an outfit change only — nothing else should change in the image."
)


async def generate_outfit_image(
    user_token: str,
    concept_image: str,
    shortcode: str,
    timeout: int = 600,
) -> dict:
    """Phase 1 : Seedream v4.5 img2img — génère un outfit sexy sur l'image concept uploadée.

    Le même prompt général est utilisé pour les 4 appels : chaque génération
    produit naturellement un outfit différent grâce à la variété intrinsèque de Seedream.
    Pas d'outfit imposé — le modèle choisit librement (sport/casual/trendy/party).
    """
    cmd = [
        "higgsfield", "generate", "create", "seedream_v4_5",
        "--image", concept_image,
        "--prompt", SEEDREAM_OUTFIT_PROMPT,
        "--aspect_ratio", "9:16",
        "--quality", "high",
        "--wait",
        "--wait-timeout", "10m",
    ]

    try:
        result_url = await run_higgsfield_for_user(user_token, cmd, timeout=timeout)
        if result_url:
            return {"url": result_url.strip()}
        return {"url": None, "error": "EMPTY_RESULT"}
    except asyncio.TimeoutError:
        return {"url": None, "error": "TIMEOUT_SEEDREAM"}
    except Exception as e:
        return {"url": None, "error": str(e)[:300]}


async def _resolve_image_url(user_token: str, image_source: str, shortcode: str) -> str:
    """Retourne une URL publique pour l'image.

    - Si c'est déjà une URL (http/https) : retourne directement — Kling la fetch lui-même.
    - Si c'est un chemin local : uploade via Higgsfield CDN → URL publique.
    Évite totalement le Base64 qui fait exploser la taille du payload.
    """
    if image_source.startswith("http://") or image_source.startswith("https://"):
        return image_source

    # Fichier local → upload pour obtenir une URL CDN
    from pipeline.kling_api import upload_video_for_kling
    print(json.dumps({
        "type": "warn",
        "msg": f"[{shortcode}] Upload image concept vers Higgsfield CDN…"
    }), flush=True)
    return await upload_video_for_kling(user_token, image_source)


async def generate_motion_video(
    user_token: str,
    image_source: str,           # URL Seedream OU chemin local concept image (fallback)
    concept_video_path: str,
    shortcode: str,
    kling_access_key: str,
    kling_secret_key: str,
    timeout: int = 900,
    prompt: str | None = None,
) -> dict:
    """Phase 2 : Kling 3.0 Motion Control (API officielle).

    Les soumissions Kling sont sérialisées via _KLING_SUBMIT_LOCK — une à la fois.
    Le polling se fait en parallèle une fois le task_id obtenu.
    """
    from pipeline.kling_api import upload_video_for_kling, create_motion_control_task, poll_motion_control_task

    try:
        # Upload vidéo de référence + résolution image (parallèle, pas de lock nécessaire)
        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Upload vidéo de référence vers Higgsfield CDN…"
        }), flush=True)
        video_url, image_url = await asyncio.gather(
            upload_video_for_kling(user_token, concept_video_path),
            _resolve_image_url(user_token, image_source, shortcode),
        )
        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Vidéo référence uploadée ✅ → {video_url[:80]}…"
        }), flush=True)

        # ── Soumission sérialisée (un seul appel Kling à la fois) ─────────────
        task_id: str | None = None
        lock = _get_kling_lock()

        async with lock:
            print(json.dumps({
                "type": "warn",
                "msg": f"[{shortcode}] Attente du verrou Kling (soumissions sérialisées)…"
            }), flush=True)

            for attempt in range(8):
                try:
                    print(json.dumps({
                        "type": "warn",
                        "msg": f"[{shortcode}] Soumission Kling (tentative {attempt + 1})…"
                    }), flush=True)
                    task_id = await create_motion_control_task(
                        access_key=kling_access_key,
                        secret_key=kling_secret_key,
                        image_source=image_url,
                        video_url=video_url,
                        mode="std",
                        prompt=prompt,
                    )
                    print(json.dumps({
                        "type": "warn",
                        "msg": f"[{shortcode}] Kling task_id={task_id} ✅ — verrou relâché, polling en cours…"
                    }), flush=True)
                    # Pause courte après succès avant de relâcher le verrou
                    await asyncio.sleep(10)
                    break
                except Exception as e:
                    err = str(e) or repr(e)
                    print(json.dumps({
                        "type": "warn",
                        "msg": f"[{shortcode}] Erreur Kling (tentative {attempt + 1}): {err[:200]}"
                    }), flush=True)
                    # Erreurs non-retriables : solde insuffisant, auth, compte invalide
                    NO_RETRY_CODES = ("1102", "1101", "401", "403")
                    if any(code in err for code in NO_RETRY_CODES):
                        print(json.dumps({
                            "type": "warn",
                            "msg": f"[{shortcode}] Erreur Kling non-retriable (solde/auth) — abandon."
                        }), flush=True)
                        return {"url": None, "error": f"Kling: {err}"[:300]}
                    # Rate limit transitoire → retry avec backoff
                    if "429" in err or "1302" in err or "1303" in err or "rate" in err.lower():
                        wait = 45 * (attempt + 1)
                        print(json.dumps({
                            "type": "warn",
                            "msg": f"[{shortcode}] Rate limit Kling — retry dans {wait}s…"
                        }), flush=True)
                        await asyncio.sleep(wait)
                        continue
                    # Autre erreur inconnue → sortir immédiatement
                    return {"url": None, "error": f"{type(e).__name__}: {err}"[:300]}

        if not task_id:
            return {"url": None, "error": "Kling rate limit — max retries (8) atteint"}

        # ── Polling en parallèle (verrou déjà relâché) ─────────────────────────
        result_url = await poll_motion_control_task(
            access_key=kling_access_key,
            secret_key=kling_secret_key,
            task_id=task_id,
            timeout=timeout,
        )
        return {"url": result_url}

    except asyncio.TimeoutError:
        return {"url": None, "error": "TIMEOUT_KLING_MC"}
    except Exception as e:
        return {"url": None, "error": f"{type(e).__name__}: {str(e) or repr(e)}"[:300]}


# ─── Orchestration ─────────────────────────────────────────────────────────────

async def process_one_outfit(
    i: int,
    style: dict,
    run_id: str,
    user_token: str,
    concept_image: str,
    concept_video: str,
    kling_access_key: str,
    kling_secret_key: str,
    drive,
) -> None:
    """Traite un outfit de bout en bout : Seedream → Kling MC → Drive.

    Si Seedream échoue, on passe directement l'image concept à Kling MC
    avec un prompt d'outfit en fallback.
    """
    shortcode = f"mc_{i + 1}"
    scene = f"Motion Control · {style['label']}"

    print(json.dumps({
        "type": "generation",
        "shortcode": shortcode,
        "status": "started",
        "rank": i,
        "model": "kling_motion_control",
        "scene": scene,
    }), flush=True)

    # Phase 1 : Seedream v4.5 img2img — outfit swap (fallback sur concept_image)
    print(json.dumps({
        "type": "warn",
        "msg": f"[{shortcode}] Phase 1/2 — Seedream outfit ({style['label']})…"
    }), flush=True)

    seedream_result = await generate_outfit_image(
        user_token=user_token,
        concept_image=concept_image,
        shortcode=shortcode,
    )

    seedream_ok = bool(seedream_result.get("url"))
    kling_prompt = None
    fallback_used = False

    if seedream_ok:
        # Resize l'image Seedream avant de la passer à Kling (max 1280px)
        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Seedream OK — resize image pour Kling (max {KLING_MAX_PX}px)…"
        }), flush=True)
        try:
            image_source = await resize_image_for_kling(
                seedream_result["url"], user_token, shortcode
            )
        except Exception as e:
            # Fallback : passer l'URL directement si le resize échoue
            print(json.dumps({
                "type": "warn",
                "msg": f"[{shortcode}] Resize échoué ({e!r}) — URL brute transmise à Kling"
            }), flush=True)
            image_source = seedream_result["url"]
    else:
        # Fallback : concept image locale
        seedream_err = seedream_result.get("error", "UNKNOWN")
        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Fallback → concept image ({seedream_err})"
        }), flush=True)
        image_source = concept_image
        kling_prompt = (
            "Apply motion from reference video exactly. "
            "Keep same person, same face, same background."
        )
        fallback_used = True

    print(json.dumps({
        "type": "warn",
        "msg": f"[{shortcode}] Phase 2/2 — Kling 3.0 Motion Control (API officielle)…"
    }), flush=True)

    # Phase 2 : Kling 3.0 Motion Control via API officielle
    # Pas de submit_delay — la sérialisation via _KLING_SUBMIT_LOCK gère l'ordre
    kling_result = await generate_motion_video(
        user_token=user_token,
        image_source=image_source,
        concept_video_path=concept_video,
        shortcode=shortcode,
        kling_access_key=kling_access_key,
        kling_secret_key=kling_secret_key,
        prompt=kling_prompt,
    )

    if not kling_result.get("url"):
        print(json.dumps({
            "type": "generation",
            "shortcode": shortcode,
            "status": "failed",
            "error": f"Kling MC failed: {kling_result.get('error', 'UNKNOWN')}",
            "rank": i,
        }), flush=True)
        return

    video_url = kling_result["url"]

    print(json.dumps({
        "type": "generation",
        "shortcode": shortcode,
        "status": "complete",
        "url": video_url,
        "model": "kling_motion_control",
        "fallback": fallback_used,
        "prompt": kling_prompt or "",
        "scene": scene,
        "scenario": style["key"],
        "variables": {"outfit_style": style["label"]},
        "likes": 0,
        "comments": 0,
        "caption": "",
        "post_url": "",
        "rank": i,
        "slide_index": 0,
        "local_image_path": None,
    }), flush=True)

    # Drive upload — awaité directement (asyncio.create_task serait annulé à la fin de asyncio.run)
    if drive:
        await drive.upload_motion_control_video(run_id, shortcode, video_url)


async def run_motion_control(
    run_id: str,
    user_token: str,
    concept_image: str,
    concept_video: str,
    kling_access_key: str,
    kling_secret_key: str,
) -> None:
    """Orchestre la génération de 4 vidéos Motion Control en parallèle.

    Seedream tourne en parallèle (4 simultanés).
    Kling est sérialisé via un semaphore (1 à la fois) pour éviter le 429.
    """
    from pipeline.drive_uploader import init_drive_uploader_from_env
    drive = init_drive_uploader_from_env()

    total = len(OUTFIT_STYLES)
    print(json.dumps({"type": "generation_start", "total": total}), flush=True)

    tasks = [
        process_one_outfit(
            i=i,
            style=style,
            run_id=run_id,
            user_token=user_token,
            concept_image=concept_image,
            concept_video=concept_video,
            kling_access_key=kling_access_key,
            kling_secret_key=kling_secret_key,
            drive=drive,
        )
        for i, style in enumerate(OUTFIT_STYLES)
    ]

    await asyncio.gather(*tasks)

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": total,
    }), flush=True)


# ─── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Motion Control — Flux Kontext + Kling 3.0 batch")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--concept-image", required=True, help="Chemin local vers l'image concept")
    parser.add_argument("--concept-video", required=True, help="Chemin local vers la vidéo de référence")
    args = parser.parse_args()

    user_token = os.environ.get("HIGGSFIELD_TOKEN")
    if not user_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    kling_access_key = os.environ.get("KLING_ACCESS_KEY")
    kling_secret_key = os.environ.get("KLING_SECRET_KEY")
    if not kling_access_key or not kling_secret_key:
        print(json.dumps({"type": "error", "message": "KLING_ACCESS_KEY et KLING_SECRET_KEY requis pour Kling Motion Control."}), flush=True)
        sys.exit(1)

    if not Path(args.concept_image).exists():
        print(json.dumps({"type": "error", "message": f"Image concept introuvable: {args.concept_image}"}), flush=True)
        sys.exit(1)

    if not Path(args.concept_video).exists():
        print(json.dumps({"type": "error", "message": f"Vidéo concept introuvable: {args.concept_video}"}), flush=True)
        sys.exit(1)

    asyncio.run(run_motion_control(
        run_id=args.run_id,
        user_token=user_token,
        concept_image=args.concept_image,
        concept_video=args.concept_video,
        kling_access_key=kling_access_key,
        kling_secret_key=kling_secret_key,
    ))


if __name__ == "__main__":
    main()
