"""
Motion Control — génération batch de 4 vidéos Kling 3.0 Motion Control.

Flow par outfit (4 en parallèle) :
1. Seedream v4.5 img2img : change l'outfit sur l'image concept → outfit_url
2. Kling 3.0 Motion Control : applique la motion de la vidéo de référence → video_url
3. Upload Drive → Motion Control/<run_id>/mc_<i+1>.mp4

Events JSON stdout (même protocole que video_studio.py / studio.py).
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from pipeline.generator import run_higgsfield_for_user

# ─── Outfit styles ─────────────────────────────────────────────────────────────

OUTFIT_STYLES = [
    {
        "key": "casual",
        "label": "Casual Streetwear",
        "emoji": "🧢",
        "outfit": (
            "casual street style — crop top or fitted tee, fitted jeans or shorts, "
            "trendy sneakers, relaxed confident look"
        ),
    },
    {
        "key": "sport",
        "label": "Athletic Sportswear",
        "emoji": "🏃",
        "outfit": (
            "athletic activewear — fitted sports bra, high-waist leggings, "
            "training sneakers, sport brand aesthetic"
        ),
    },
    {
        "key": "party",
        "label": "Evening Party",
        "emoji": "💃",
        "outfit": (
            "sexy evening party — tight bodycon or cocktail dress, high heels, "
            "glamorous and confident"
        ),
    },
    {
        "key": "chic",
        "label": "Smart Chic",
        "emoji": "👔",
        "outfit": (
            "smart casual chic — fitted blazer or stylish top, tailored mini skirt or pants, "
            "heels, polished look"
        ),
    },
]


MAX_CONCURRENT = 4  # 4 outfits en parallèle


# ─── Core generation helpers ───────────────────────────────────────────────────

async def generate_outfit_image(
    user_token: str,
    concept_image: str,
    outfit_description: str,
    element_id: str,
    shortcode: str,
    timeout: int = 600,
) -> dict:
    """Phase 1 : Seedream v4.5 img2img — change l'outfit sur l'image concept.

    Le tag <<<element_id>>> est obligatoire pour que Seedream reconnaisse le personnage.
    """
    prompt = (
        f"<<<{element_id}>>> "
        f"Change outfit only to: {outfit_description}. "
        f"Keep identical: same person's face, same body, same pose, same background and lighting. "
        f"No bikini, no swimwear."
    )
    cmd = [
        "higgsfield", "generate", "create", "seedream_v4_5",
        "--image", concept_image,
        "--prompt", prompt,
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


async def generate_motion_video(
    user_token: str,
    outfit_image_url: str,
    concept_video: str,
    shortcode: str,
    timeout: int = 900,
    prompt: str | None = None,
) -> dict:
    """Phase 2 : Kling 3.0 Motion Control — applique la motion de la vidéo de référence.

    `prompt` est optionnel : si fourni (fallback Seedream), guide Kling sur l'outfit.
    """
    cmd = [
        "higgsfield", "generate", "create", "kling3_0",
        "--image", outfit_image_url,
        "--video", concept_video,
        "--wait",
        "--wait-timeout", "15m",
    ]
    if prompt:
        cmd += ["--prompt", prompt]

    for attempt in range(3):
        try:
            result_url = await run_higgsfield_for_user(user_token, cmd, timeout=timeout)
            if result_url:
                return {"url": result_url.strip()}
            return {"url": None, "error": "EMPTY_RESULT"}
        except asyncio.TimeoutError:
            return {"url": None, "error": "TIMEOUT_KLING"}
        except Exception as e:
            err = str(e)
            if "concurrent_jobs_limit" in err:
                wait_time = 60 * (attempt + 1)
                print(json.dumps({
                    "type": "warn",
                    "msg": f"concurrent_jobs_limit [{shortcode}] — attente {wait_time}s avant retry {attempt + 1}/3"
                }), flush=True)
                await asyncio.sleep(wait_time)
                continue
            return {"url": None, "error": err[:300]}

    return {"url": None, "error": "concurrent_jobs_limit — max retries reached"}


# ─── Orchestration ─────────────────────────────────────────────────────────────

async def process_one_outfit(
    i: int,
    style: dict,
    run_id: str,
    user_token: str,
    concept_image: str,
    concept_video: str,
    element_id: str,
    drive,
) -> None:
    """Traite un outfit de bout en bout : Seedream → Kling MC → Drive.

    Si Seedream échoue malgré le element_id, on passe directement
    l'image concept à Kling MC avec un prompt d'outfit en fallback.
    """
    shortcode = f"mc_{i + 1}"
    scene = f"Motion Control · {style['label']}"

    print(json.dumps({
        "type": "generation",
        "shortcode": shortcode,
        "status": "started",
        "rank": i,
        "model": "kling3_0",
        "scene": scene,
    }), flush=True)

    # Phase 1 : Seedream outfit variant (best effort — fallback sur concept_image)
    print(json.dumps({
        "type": "warn",
        "msg": f"[{shortcode}] Phase 1/2 — Seedream outfit ({style['label']})…"
    }), flush=True)

    seedream_result = await generate_outfit_image(
        user_token=user_token,
        concept_image=concept_image,
        outfit_description=style["outfit"],
        element_id=element_id,
        shortcode=shortcode,
    )

    seedream_ok = bool(seedream_result.get("url"))
    if seedream_ok:
        outfit_image = seedream_result["url"]   # URL Higgsfield
        kling_prompt = None                      # image already has the outfit
        fallback_used = False
    else:
        seedream_err = seedream_result.get("error", "UNKNOWN")
        print(json.dumps({
            "type": "warn",
            "msg": (
                f"[{shortcode}] Seedream failed ({seedream_err}), "
                f"fallback → concept image + outfit prompt pour Kling MC"
            ),
        }), flush=True)
        outfit_image = concept_image             # local path — auto-uploadé par CLI
        kling_prompt = (                         # guide Kling MC pour l'outfit
            f"Apply motion from reference video exactly. "
            f"Style the outfit as: {style['outfit']}. "
            f"Keep same person, same face, same background."
        )
        fallback_used = True

    print(json.dumps({
        "type": "warn",
        "msg": f"[{shortcode}] Phase 2/2 — Kling Motion Control…"
    }), flush=True)

    # Phase 2 : Kling Motion Control
    kling_result = await generate_motion_video(
        user_token=user_token,
        outfit_image_url=outfit_image,
        concept_video=concept_video,
        shortcode=shortcode,
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
        "model": "kling3_0",
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

    # Drive upload en arrière-plan
    if drive:
        asyncio.create_task(
            drive.upload_motion_control_video(run_id, shortcode, video_url)
        )


async def run_motion_control(
    run_id: str,
    user_token: str,
    concept_image: str,
    concept_video: str,
    element_id: str,
) -> None:
    """Orchestre la génération de 4 vidéos Motion Control en parallèle."""
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
            element_id=element_id,
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
    parser = argparse.ArgumentParser(description="Motion Control — Seedream + Kling 3.0 batch")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--concept-image", required=True, help="Chemin local vers l'image concept")
    parser.add_argument("--concept-video", required=True, help="Chemin local vers la vidéo de référence")
    parser.add_argument("--element-id", required=True, help="Higgsfield Reference Element ID (pour Seedream)")
    args = parser.parse_args()

    user_token = os.environ.get("HIGGSFIELD_TOKEN")
    if not user_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    if not args.element_id:
        print(json.dumps({"type": "error", "message": "element-id requis pour Seedream"}), flush=True)
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
        element_id=args.element_id,
    ))


if __name__ == "__main__":
    main()
