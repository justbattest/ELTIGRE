"""
Queue manager — orchestre scraping + analyse + génération pour un run complet.
Communique via stdout JSON lines (lu par Next.js API route → DB → SSE).
"""

import asyncio
import json
from pathlib import Path
from datetime import datetime

from pipeline.scraper import scrape_and_download_all
from pipeline.analyzer import analyze_all_posts
from pipeline.generator import generate_with_fallback
from pipeline.drive_uploader import init_drive_uploader, get_uploader


async def run_pipeline(
    run_id: str,
    profiles: list[str],
    max_posts: int,
    soul_id: str,
    element_id: str,
    model_setting: str,
    aspect_ratio: str,
    quality: str,
    apify_key: str,
    anthropic_key: str,
    higgsfield_token: str,
    work_dir: str,
    drive_credentials: str | None = None,
    drive_folder_id: str | None = None,
) -> None:
    """Pipeline complet pour un run.

    Protocole stdout :
    {"type": "phase", "phase": "scraping|downloading", "pct": 0-100, "total_posts": N}
    {"type": "analysis", "processed": N, "total": N, "shortcode": "..."}
    {"type": "analysis_error", "shortcode": "...", "error": "..."}
    {"type": "generation", "shortcode": "...", "status": "started|complete|failed", ...}
    {"type": "done", "total": N, "completed": N, "failed": N, "fallbacks": N}
    {"type": "error", "message": "..."}
    """
    Path(work_dir).mkdir(parents=True, exist_ok=True)

    # Initialiser Drive si configuré
    if drive_credentials and drive_folder_id:
        try:
            init_drive_uploader(drive_credentials, drive_folder_id)
            print(json.dumps({"type": "info", "msg": "Google Drive configuré ✓"}), flush=True)
        except Exception as e:
            print(json.dumps({"type": "warn", "msg": f"Drive init failed: {e}"}), flush=True)

    try:
        # ── Phase 1 : Scraping + Download ──────────────────────────────────
        all_post_data = []
        for profile_url in profiles:
            data = await scrape_and_download_all(
                profile_url=profile_url,
                max_posts=max_posts,
                apify_key=apify_key,
                run_dir=work_dir,
            )
            all_post_data.extend(data)

        if not all_post_data:
            print(json.dumps({"type": "error", "message": "Aucun post trouvé"}), flush=True)
            return

        # ── Phase 2 : Analyse Claude ────────────────────────────────────────
        analyzed = await analyze_all_posts(all_post_data, anthropic_key)

        # Compter les analyses réussies pour le total réel de génération
        to_generate = [item for item in analyzed if "analysis_error" not in item]
        total = len(analyzed)      # total tenté
        gen_total = len(to_generate)  # total qui passera en génération
        completed = 0
        failed = 0
        fallbacks = 0

        # Émettre le total réel avant de commencer la génération
        print(json.dumps({
            "type": "generation_start",
            "total": gen_total,
            "skipped": total - gen_total,
        }), flush=True)

        # ── Phase 3 : Génération Higgsfield (parallèle, max 8 jobs) ─────────
        async def generate_one(item: dict, rank: int):
            nonlocal completed, failed, fallbacks

            post = item["post"]
            shortcode = post.get("shortCode", f"post_{rank}")

            if "analysis_error" in item:
                # Déjà compté dans les skipped ci-dessus
                return

            analysis = item["analysis"]
            prompt = analysis["prompt"]
            best_slide_index = analysis.get("best_slide_index", 0)
            local_images = item.get("local_images", [])

            # Chemin local de la slide utilisée pour la génération
            local_image_path = None
            if local_images and best_slide_index < len(local_images):
                local_image_path = local_images[best_slide_index]
            elif local_images:
                local_image_path = local_images[0]

            effective_model = model_setting

            print(json.dumps({
                "type": "generation",
                "shortcode": shortcode,
                "status": "started",
                "rank": rank,
                "model": analysis.get("recommended_model"),
            }), flush=True)

            result = await generate_with_fallback(
                prompt=prompt,
                soul_id=soul_id,
                element_id=element_id,
                user_token=higgsfield_token,
                aspect_ratio=aspect_ratio,
                quality=quality,
                model_setting=effective_model,
                shortcode=shortcode
            )

            if result.get("url"):
                completed += 1
                if result.get("fallback"):
                    fallbacks += 1

                # Upload Drive si configuré (non-bloquant)
                drive_source_url = None
                drive_generated_url = None
                uploader = get_uploader()
                if uploader:
                    try:
                        drive_result = await uploader.upload_generation(
                            run_id=run_id,
                            shortcode=shortcode,
                            local_image_path=local_image_path,
                            generated_image_url=result["url"],
                        )
                        drive_source_url = drive_result.get("drive_source_url")
                        drive_generated_url = drive_result.get("drive_generated_url")
                        if drive_result.get("drive_error"):
                            print(json.dumps({"type": "warn", "msg": f"Drive upload failed for {shortcode}: {drive_result['drive_error']}"}), flush=True)
                    except Exception as de:
                        print(json.dumps({"type": "warn", "msg": f"Drive upload error: {de}"}), flush=True)

                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "complete",
                    "url": result["url"],
                    "model": result["model"],
                    "fallback": result.get("fallback", False),
                    "prompt": prompt,
                    "slide_index": best_slide_index,
                    "local_image_path": local_image_path,
                    "drive_source_url": drive_source_url,
                    "drive_generated_url": drive_generated_url,
                    "scene": analysis.get("scene_description", ""),
                    "likes": post.get("likesCount", 0),
                    "comments": post.get("commentsCount", 0),
                    "caption": (post.get("caption") or "")[:500],
                    "post_url": post.get("url", ""),
                    "rank": rank,
                    "generated_at": datetime.utcnow().isoformat(),
                }), flush=True)
            else:
                failed += 1
                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "failed",
                    "error": result.get("error", "UNKNOWN"),
                    "rank": rank,
                }), flush=True)

        tasks = [
            generate_one(item, rank + 1)
            for rank, item in enumerate(analyzed)
        ]
        await asyncio.gather(*tasks)

        # ── Final ────────────────────────────────────────────────────────────
        print(json.dumps({
            "type": "done",
            "run_id": run_id,
            "total": gen_total,
            "completed": completed,
            "failed": failed + (total - gen_total),  # inclut les analyses échouées
            "fallbacks": fallbacks,
            "finished_at": datetime.utcnow().isoformat(),
        }), flush=True)

    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e),
            "run_id": run_id,
        }), flush=True)
        raise
