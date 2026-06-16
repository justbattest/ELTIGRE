"""
Motion Control — génération batch de 4 vidéos Kling v3.0 Motion Control.

Flow par outfit (4 en parallèle) :
1. Seedream v4.5 img2img : change UNIQUEMENT l'outfit sur l'image concept uploadée
   (pose, angle, fond, éclairage, visage, corps restent identiques)
2. Kling v3.0 Motion Control via CLI Higgsfield (kling3_0 --start-image + --video)
   ← Plus besoin de Clerk JWT ! Le CLI utilise le token hf_xxx standard.
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


async def prepare_image_for_kling(url: str, shortcode: str) -> str:
    """Télécharge l'image Seedream et la redimensionne à max 1280px côté long.

    Kling Motion Control rejette les images trop grandes (>1280px sur le grand côté).
    Retourne le chemin local du fichier temporaire redimensionné.
    Le CALLER est responsable de la suppression du fichier après usage.
    """
    # Téléchargement
    tmp_orig = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False, prefix="hf_orig_")
    tmp_orig.close()
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        Path(tmp_orig.name).write_bytes(resp.content)

    # Redimensionnement → fichier final
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

    return tmp_small.name  # Le caller doit unlink après usage


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


def _extract_uuid_from_cdn_url(url: str) -> str:
    """Extrait l'UUID Higgsfield depuis une URL CDN.
    Ex: https://d2ol7oe51mr4n9.cloudfront.net/user_XXX/UUID.mp4 → UUID
    """
    filename = url.split("/")[-1]
    name = filename.rsplit(".", 1)[0]
    name = name.replace("_resize", "")
    return name


async def _upload_file_for_motion_control(user_token: str, file_path: str, refresh_token: str = "") -> str:
    """Upload un fichier (image ou vidéo) via Higgsfield CLI. Retourne l'URL CDN publique."""
    result = await run_higgsfield_for_user(
        user_token,
        ["higgsfield", "upload", "create", file_path, "--json"],
        timeout=120,
        refresh_token=refresh_token,
    )
    raw = result.strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raw = raw.strip('"').strip()
        if len(raw) > 8:
            return f"https://d8j0ntlcm91z4.cloudfront.net/{raw}"
        raise Exception(f"Upload: réponse non parseable: {raw[:200]}")

    if isinstance(data, dict):
        for key in ("url", "cdn_url", "download_url", "public_url"):
            if data.get(key):
                return data[key]
        for key in ("id", "upload_id", "media_id"):
            if data.get(key):
                return f"https://d8j0ntlcm91z4.cloudfront.net/{data[key]}"

    raise Exception(f"Upload: impossible d'extraire l'URL depuis: {raw[:300]}")


async def _create_motion_control_higgsfield(
    clerk_token: str,
    image_cdn_url: str,
    video_cdn_url: str,
) -> dict:
    """POST /chains/motion-control via Higgsfield (Kling Motion Control).

    Requiert le Clerk JWT (token de session web higgsfield.ai) — pas le token CLI hf_xxx.
    Retourne {job_id, job_set_id}.
    """
    image_uuid = _extract_uuid_from_cdn_url(image_cdn_url)
    video_uuid = _extract_uuid_from_cdn_url(video_cdn_url)

    payload = {
        "params": {
            "mode": "std",
            "medias": [
                {
                    "role": "video",
                    "data": {"id": video_uuid, "type": "video_input", "url": video_cdn_url},
                },
                {
                    "role": "image",
                    "data": {"id": image_uuid, "type": "media_input", "url": image_cdn_url},
                },
            ],
            "height": 1280,
            "width": 720,
            "background_source": "input_video",
            "model_name": "kling-v3",
        },
        "use_unlim": False,
        "use_free_gens": False,
    }

    headers = {
        "Authorization": f"Bearer {clerk_token}",
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Origin": "https://higgsfield.ai",
        "Referer": "https://higgsfield.ai/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    }

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.post(
            "https://fnf.higgsfield.ai/chains/motion-control",
            json=payload,
            headers=headers,
        )
        if resp.status_code == 401:
            raise Exception(
                "Token Higgsfield expiré (401). Va dans Settings → Higgsfield Session Token "
                "et colle un nouveau token depuis F12 sur higgsfield.ai."
            )
        resp.raise_for_status()
        data = resp.json()

    job_sets = data.get("job_sets", [])
    if not job_sets:
        raise Exception(f"No job_sets in response: {data}")
    job_set = job_sets[0]
    jobs = job_set.get("jobs", [])
    if not jobs:
        raise Exception(f"No jobs in job_set: {job_set}")

    return {"job_id": jobs[0]["id"], "job_set_id": job_set["id"]}


async def _poll_motion_control_higgsfield(
    clerk_token: str,
    job_id: str,
    shortcode: str,
    timeout: int = 900,
    interval: int = 12,
) -> str:
    """Poll GET /jobs/{job_id} jusqu'à status=complete. Retourne l'URL vidéo."""
    headers = {
        "Authorization": f"Bearer {clerk_token}",
        "Accept": "*/*",
        "Origin": "https://higgsfield.ai",
        "Referer": "https://higgsfield.ai/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    }

    start = asyncio.get_event_loop().time()
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        while True:
            if asyncio.get_event_loop().time() - start > timeout:
                raise asyncio.TimeoutError(f"Kling Motion Control timeout {timeout}s")

            resp = await client.get(
                f"https://fnf.higgsfield.ai/jobs/{job_id}",
                headers=headers,
            )
            if resp.status_code == 401:
                raise Exception("Token Higgsfield expiré pendant le polling (401).")
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status", "")

            if status == "complete":
                for key in ("result", "results"):
                    val = data.get(key)
                    if isinstance(val, dict):
                        url = val.get("url") or val.get("video_url")
                        if url:
                            return url
                    elif isinstance(val, list) and val:
                        url = val[0].get("url") or val[0].get("video_url")
                        if url:
                            return url
                raise Exception(f"Job complete mais pas d'URL: {data}")
            elif status in ("failed", "error", "cancelled"):
                raise Exception(f"Kling MC job {status}: {data}")

            print(json.dumps({
                "type": "warn",
                "msg": f"[{shortcode}] Kling MC job {job_id[:8]}… status={status}"
            }), flush=True)
            await asyncio.sleep(interval)


async def generate_motion_video(
    user_token: str,
    image_source: str,
    concept_video_path: str,
    shortcode: str,
    timeout: int = 900,
    prompt: str | None = None,
    refresh_token: str = "",
    clerk_token: str = "",
) -> dict:
    """Phase 2 : Kling Motion Control via Higgsfield /chains/motion-control.

    Requiert le Clerk JWT (HIGGSFIELD_CLERK_TOKEN env var) — pas le token CLI hf_xxx.
    Flow : upload image + vidéo via CLI → POST /chains/motion-control → poll jusqu'au résultat.

    image_source : chemin local (déjà préparé par prepare_image_for_kling)
    concept_video_path : chemin local de la vidéo de référence
    clerk_token : Clerk JWT de session higgsfield.ai (obligatoire pour /chains/motion-control)
    """
    if not clerk_token:
        return {
            "url": None,
            "error": (
                "HIGGSFIELD_SESSION_TOKEN manquant. "
                "Va dans Settings → Higgsfield Session Token et colle le token depuis F12."
            )
        }

    try:
        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Upload image + vidéo vers Higgsfield CDN…"
        }), flush=True)

        # Upload image (chemin local → CDN)
        if image_source.startswith("http://") or image_source.startswith("https://"):
            image_cdn_url = image_source
        else:
            image_cdn_url = await _upload_file_for_motion_control(user_token, image_source, refresh_token)

        # Upload vidéo (chemin local → CDN)
        video_cdn_url = await _upload_file_for_motion_control(user_token, concept_video_path, refresh_token)

        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Upload OK — POST /chains/motion-control…"
        }), flush=True)

        chain = await _create_motion_control_higgsfield(
            clerk_token=clerk_token,
            image_cdn_url=image_cdn_url,
            video_cdn_url=video_cdn_url,
        )
        job_id = chain["job_id"]

        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Job Kling MC soumis — job_id={job_id[:8]}… polling…"
        }), flush=True)

        result_url = await _poll_motion_control_higgsfield(
            clerk_token=clerk_token,
            job_id=job_id,
            shortcode=shortcode,
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
    drive,
    refresh_token: str = "",
    clerk_token: str = "",
    pre_generated_image: str | None = None,
) -> None:
    """Traite un outfit de bout en bout : Seedream → Kling v3 MC → Drive.

    Si `pre_generated_image` est fourni (URL CDN), on saute la phase Seedream et
    on utilise directement cette image pour Kling MC (mode "depuis bibliothèque").
    Si Seedream échoue en mode normal, on passe directement l'image concept à Kling MC
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

    kling_prompt = None
    fallback_used = False

    img_tmp_to_clean: str | None = None  # Temp file créé par prepare_image_for_kling

    if pre_generated_image:
        # Mode "depuis bibliothèque" : skip Seedream, utiliser l'image pré-générée
        print(json.dumps({
            "type": "warn",
            "msg": f"[{shortcode}] Image pré-générée fournie — skip Seedream, resize pour Kling…"
        }), flush=True)
        try:
            img_tmp_to_clean = await prepare_image_for_kling(
                pre_generated_image, shortcode
            )
            image_source = img_tmp_to_clean
        except Exception as e:
            print(json.dumps({
                "type": "warn",
                "msg": f"[{shortcode}] Resize échoué ({e!r}) — URL brute transmise à Kling"
            }), flush=True)
            image_source = pre_generated_image
    else:
        # Mode normal : Phase 1 Seedream v4.5 img2img — outfit swap
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

        if seedream_ok:
            # Resize l'image Seedream avant de la passer à Kling (max 1280px)
            print(json.dumps({
                "type": "warn",
                "msg": f"[{shortcode}] Seedream OK — resize image pour Kling (max {KLING_MAX_PX}px)…"
            }), flush=True)
            try:
                img_tmp_to_clean = await prepare_image_for_kling(
                    seedream_result["url"], shortcode
                )
                image_source = img_tmp_to_clean
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
        "msg": f"[{shortcode}] Phase 2/2 — Kling 3.0 Motion Control (CLI kling3_0)…"
    }), flush=True)

    try:
        # Phase 2 : Kling Motion Control via /chains/motion-control (Clerk JWT)
        kling_result = await generate_motion_video(
            user_token=user_token,
            image_source=image_source,
            concept_video_path=concept_video,
            shortcode=shortcode,
            prompt=kling_prompt,
            refresh_token=refresh_token,
            clerk_token=clerk_token,
        )
    finally:
        # Nettoyage du fichier temporaire créé par prepare_image_for_kling
        if img_tmp_to_clean:
            Path(img_tmp_to_clean).unlink(missing_ok=True)

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
    refresh_token: str = "",
    clerk_token: str = "",
    pre_generated_images: list[str] | None = None,
) -> None:
    """Orchestre la génération de 4 vidéos Motion Control en parallèle.

    Seedream (4 simultanés) + Kling Motion Control via /chains/motion-control (Clerk JWT).
    clerk_token : Clerk JWT session higgsfield.ai (HIGGSFIELD_CLERK_TOKEN) — obligatoire.

    Si `pre_generated_images` est fourni (liste de 4 URLs CDN), la phase Seedream
    est sautée pour chaque outfit : on utilise directement ces images dans Kling MC.
    C'est le mode "depuis bibliothèque de concepts".
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
            drive=drive,
            refresh_token=refresh_token,
            clerk_token=clerk_token,
            pre_generated_image=(
                pre_generated_images[i]
                if pre_generated_images and i < len(pre_generated_images)
                else None
            ),
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
    parser.add_argument(
        "--pre-generated-images",
        nargs="+",
        default=None,
        metavar="URL",
        help=(
            "4 URLs CDN d'images d'outfit déjà générées (mode 'depuis bibliothèque'). "
            "Quand fourni, la phase Seedream est sautée et ces images sont utilisées "
            "directement dans Kling MC."
        ),
    )
    args = parser.parse_args()

    user_token = os.environ.get("HIGGSFIELD_TOKEN")
    if not user_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    if not Path(args.concept_image).exists():
        print(json.dumps({"type": "error", "message": f"Image concept introuvable: {args.concept_image}"}), flush=True)
        sys.exit(1)

    if not Path(args.concept_video).exists():
        print(json.dumps({"type": "error", "message": f"Vidéo concept introuvable: {args.concept_video}"}), flush=True)
        sys.exit(1)

    refresh_token = os.environ.get("HIGGSFIELD_REFRESH_TOKEN", "")
    clerk_token = os.environ.get("HIGGSFIELD_CLERK_TOKEN", "")

    if not clerk_token:
        print(json.dumps({
            "type": "warn",
            "msg": (
                "HIGGSFIELD_CLERK_TOKEN manquant — le Motion Control va échouer. "
                "Colle ton Clerk JWT dans Settings → Higgsfield Session Token."
            )
        }), flush=True)

    asyncio.run(run_motion_control(
        run_id=args.run_id,
        user_token=user_token,
        concept_image=args.concept_image,
        concept_video=args.concept_video,
        refresh_token=refresh_token,
        clerk_token=clerk_token,
        pre_generated_images=args.pre_generated_images or None,
    ))


if __name__ == "__main__":
    main()
