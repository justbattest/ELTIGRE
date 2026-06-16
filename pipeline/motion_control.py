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


async def _run_kling3_motion_control(
    user_token: str,
    image_path: str,
    video_path: str,
    shortcode: str,
    prompt: str,
    timeout: int = 900,
    refresh_token: str = "",
) -> str:
    """Lance kling3_0 via le CLI Higgsfield (--start-image + --video).

    Utilise le token hf_xxx standard — pas besoin de Clerk JWT.
    Le CLI gère automatiquement l'upload des fichiers locaux et le polling.
    Retourne l'URL de la vidéo générée.
    """
    cmd = [
        "higgsfield", "generate", "create", "kling3_0",
        "--start-image", image_path,
        "--video", video_path,
        "--prompt", prompt,
        "--aspect_ratio", "9:16",
        "--mode", "pro",
        "--sound", "off",
        "--wait",
        "--wait-timeout", "15m",
    ]

    print(json.dumps({
        "type": "warn",
        "msg": f"[{shortcode}] CLI kling3_0 motion control — upload + soumission…"
    }), flush=True)

    result = await run_higgsfield_for_user(
        user_token, cmd, timeout=timeout, refresh_token=refresh_token
    )
    url = result.strip()
    if not url:
        raise Exception("kling3_0 : résultat vide (pas d'URL retournée par le CLI)")
    return url


async def generate_motion_video(
    user_token: str,
    image_source: str,
    concept_video_path: str,
    shortcode: str,
    timeout: int = 900,
    prompt: str | None = None,
    refresh_token: str = "",
) -> dict:
    """Phase 2 : Kling v3.0 Motion Control via CLI Higgsfield (kling3_0).

    Utilise le token hf_xxx standard via le CLI — pas de Clerk JWT nécessaire.
    Le CLI auto-upload les fichiers locaux et retourne l'URL de la vidéo
    après polling interne (--wait --wait-timeout 15m).

    image_source : chemin local (déjà préparé par prepare_image_for_kling)
                   OU URL CDN (sera téléchargée si nécessaire)
    concept_video_path : chemin local de la vidéo de référence
    """
    img_tmp_created: str | None = None

    try:
        # Si l'image est une URL, on la télécharge en local
        if image_source.startswith("http://") or image_source.startswith("https://"):
            img_tmp_created = await download_image(image_source, suffix=".jpg")
            img_path = img_tmp_created
        else:
            img_path = image_source

        motion_prompt = prompt or (
            "Apply the exact movements from the reference video to the person in the image. "
            "Keep the same person, face, outfit, and background perfectly unchanged."
        )

        result_url = await _run_kling3_motion_control(
            user_token=user_token,
            image_path=img_path,
            video_path=concept_video_path,
            shortcode=shortcode,
            prompt=motion_prompt,
            timeout=timeout,
            refresh_token=refresh_token,
        )
        return {"url": result_url}

    except asyncio.TimeoutError:
        return {"url": None, "error": "TIMEOUT_KLING3_MC"}
    except Exception as e:
        return {"url": None, "error": f"{type(e).__name__}: {str(e) or repr(e)}"[:300]}
    finally:
        if img_tmp_created:
            Path(img_tmp_created).unlink(missing_ok=True)


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
        # Phase 2 : Kling 3.0 Motion Control via CLI kling3_0
        kling_result = await generate_motion_video(
            user_token=user_token,
            image_source=image_source,
            concept_video_path=concept_video,
            shortcode=shortcode,
            prompt=kling_prompt,
            refresh_token=refresh_token,
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
    pre_generated_images: list[str] | None = None,
) -> None:
    """Orchestre la génération de 4 vidéos Motion Control en parallèle.

    Seedream (4 simultanés) + Kling v3 via CLI kling3_0 (--start-image + --video).
    Pas de Clerk JWT requis — le CLI utilise le token hf_xxx standard.

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

    asyncio.run(run_motion_control(
        run_id=args.run_id,
        user_token=user_token,
        concept_image=args.concept_image,
        concept_video=args.concept_video,
        refresh_token=refresh_token,
        pre_generated_images=args.pre_generated_images or None,
    ))


if __name__ == "__main__":
    main()
