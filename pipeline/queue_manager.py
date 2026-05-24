"""
Queue manager — orchestre scraping + analyse + génération pour un run complet.
Communique via stdout JSON lines (lu par Next.js API route → DB → SSE).
"""

import asyncio
import json
from pathlib import Path
from datetime import datetime

from pipeline.scraper import scrape_and_download_all
from pipeline.analyzer import analyze_all_carousels
from pipeline.generator import generate_with_fallback


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
) -> None:
    """Pipeline complet pour un run.
    Toute la progression est émise sur stdout comme JSON lines.

    Protocole stdout :
    {"type": "phase", "phase": "scraping|downloading", "pct": 0-100, ...}
    {"type": "analysis", "processed": N, "total": N, "shortcode": "...", ...}
    {"type": "analysis_error", ...}
    {"type": "generation", "shortcode": "...", "status": "started|complete|failed", ...}
    {"type": "generation_retry", "shortcode": "...", "model": "...", "reason": "..."}
    {"type": "done", "total": N, "completed": N, "failed": N, "fallbacks": N}
    {"type": "error", "message": "..."}
    """
    Path(work_dir).mkdir(parents=True, exist_ok=True)

    try:
        # ── Phase 1 : Scraping + Download ──────────────────────────────────
        all_carousel_data = []
        for profile_url in profiles:
            data = await scrape_and_download_all(
                profile_url=profile_url,
                max_posts=max_posts,
                apify_key=apify_key,
                run_dir=work_dir,
            )
            all_carousel_data.extend(data)

        if not all_carousel_data:
            print(json.dumps({"type": "error", "message": "Aucun carousel trouvé"}), flush=True)
            return

        # ── Phase 2 : Analyse Claude ────────────────────────────────────────
        analyzed = await analyze_all_carousels(all_carousel_data, anthropic_key)

        # ── Phase 3 : Génération Higgsfield (parallèle, max 8 jobs) ─────────
        total = len(analyzed)
        completed = 0
        failed = 0
        fallbacks = 0

        async def generate_one(item: dict, rank: int):
            nonlocal completed, failed, fallbacks

            post = item["post"]
            shortcode = post.get("shortCode", f"post_{rank}")

            # Saut si analyse échouée
            if "analysis_error" in item:
                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "skipped",
                    "reason": "analysis_failed"
                }), flush=True)
                failed += 1
                return

            analysis = item["analysis"]
            prompt = analysis["prompt"]

            # Utilise le modèle recommandé par Claude si model_setting == "auto"
            effective_model = model_setting
            if model_setting == "auto":
                effective_model = "auto"  # laisse generate_with_fallback gérer

            print(json.dumps({
                "type": "generation",
                "shortcode": shortcode,
                "status": "started",
                "rank": rank,
                "model": analysis.get("recommended_model")
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

                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "complete",
                    "url": result["url"],
                    "model": result["model"],
                    "fallback": result.get("fallback", False),
                    "prompt": prompt,
                    "slide_index": analysis.get("best_slide_index", 0),
                    "scene": analysis.get("scene_description", ""),
                    "likes": post.get("likesCount", 0),
                    "comments": post.get("commentsCount", 0),
                    "caption": (post.get("caption") or "")[:500],
                    "post_url": post.get("url", ""),
                    "rank": rank,
                    "generated_at": datetime.utcnow().isoformat()
                }), flush=True)
            else:
                failed += 1
                print(json.dumps({
                    "type": "generation",
                    "shortcode": shortcode,
                    "status": "failed",
                    "error": result.get("error", "UNKNOWN"),
                    "rank": rank
                }), flush=True)

        # Lancer toutes les générations en parallèle
        # Le sémaphore dans generator.py limite à MAX_CONCURRENT jobs
        tasks = [
            generate_one(item, rank + 1)
            for rank, item in enumerate(analyzed)
        ]
        await asyncio.gather(*tasks)

        # ── Final ────────────────────────────────────────────────────────────
        print(json.dumps({
            "type": "done",
            "run_id": run_id,
            "total": total,
            "completed": completed,
            "failed": failed,
            "fallbacks": fallbacks,
            "finished_at": datetime.utcnow().isoformat()
        }), flush=True)

    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e),
            "run_id": run_id
        }), flush=True)
        raise
