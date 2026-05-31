"""
Bulk Edit i2i — Seedream 4.5 sur un lot d'images.

Pour chaque image dans images_dir :
  higgsfield generate create seedream_v4_5
    --prompt "<<<element_id>>> {prompt}"
    --image <local_path>
    --quality high
    --wait --wait-timeout 10m

Emit JSON events sur stdout (même protocole que video_studio.py).
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from pipeline.generator import run_higgsfield_for_user
from pipeline.drive_uploader import init_drive_uploader_from_env

SUPPORTED_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP'}


async def run_bulk_edit(
    run_id: str,
    images_dir: str,
    prompt: str,
    element_id: str,
    quality: str,
    user_token: str,
    concurrency: int = 1,
) -> None:
    drive = init_drive_uploader_from_env()

    images = sorted(
        p for p in Path(images_dir).iterdir()
        if p.suffix in SUPPORTED_EXT
    )

    if not images:
        print(json.dumps({"type": "error", "message": f"Aucune image trouvée dans {images_dir}"}), flush=True)
        sys.exit(1)

    total = len(images)
    print(json.dumps({"type": "generation_start", "total": total}), flush=True)

    completed = 0
    failed = 0

    # Prompt avec ou sans préfixe personnage
    prompt_full = f"<<<{element_id}>>> {prompt}" if element_id else prompt

    # Semaphore : 1 en standard, N en unlimited (ex: 8)
    sem = asyncio.Semaphore(concurrency)

    async def generate_one(i: int, img_path: Path):
        nonlocal completed, failed
        shortcode = f"edit_{i + 1}"

        print(json.dumps({
            "type": "generation",
            "shortcode": shortcode,
            "status": "started",
            "rank": i,
            "model": "seedream_v4_5",
            "scene": img_path.name,
        }), flush=True)

        cmd = [
            "higgsfield", "generate", "create", "seedream_v4_5",
            "--prompt", prompt_full,
            "--image", str(img_path),
            "--quality", quality,
            "--wait",
            "--wait-timeout", "10m",
        ]

        async with sem:
            try:
                url = await run_higgsfield_for_user(user_token, cmd, timeout=660)
                url = url.strip()
                completed += 1

                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "complete",
                    "url": url,
                    "model": "seedream_v4_5",
                    "fallback": False,
                    "prompt": prompt_full,
                    "scene": img_path.name,
                    "rank": i,
                    "slide_index": 0,
                    "local_image_path": str(img_path),
                    "likes": 0,
                    "comments": 0,
                    "caption": "",
                    "post_url": "",
                }), flush=True)

                if drive:
                    asyncio.create_task(
                        drive.upload_generation(
                            run_id=run_id,
                            shortcode=shortcode,
                            local_image_path=str(img_path),
                            generated_image_url=url,
                            rank=i,
                        )
                    )

            except asyncio.TimeoutError:
                failed += 1
                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "failed",
                    "error": "TIMEOUT",
                    "rank": i,
                }), flush=True)

            except Exception as e:
                failed += 1
                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "failed",
                    "error": str(e)[:300],
                    "rank": i,
                }), flush=True)

    # Lancer toutes les tâches (séquentiel si sem=1, parallèle si sem>1)
    await asyncio.gather(*[generate_one(i, img) for i, img in enumerate(images)])

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": total,
        "completed": completed,
        "failed": failed,
        "fallbacks": 0,
    }), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Bulk Edit i2i — Seedream 4.5")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--images-dir", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--element-id", default="", help="Soul cinematic element ID (optionnel)")
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high"])
    parser.add_argument("--concurrency", type=int, default=1,
                        help="Nombre de générations simultanées (1=standard, 8=unlimited plan)")
    args = parser.parse_args()

    token = os.environ.get("HIGGSFIELD_TOKEN")
    if not token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    asyncio.run(run_bulk_edit(
        run_id=args.run_id,
        images_dir=args.images_dir,
        prompt=args.prompt,
        element_id=args.element_id,
        quality=args.quality,
        user_token=token,
        concurrency=max(1, min(args.concurrency, 24)),  # clamp 1-24
    ))


if __name__ == "__main__":
    main()
