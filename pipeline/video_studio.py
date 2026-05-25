"""
Video Studio — génération de vidéos Seedance 2.0 via Higgsfield CLI.

Flow :
1. Génère N variations de prompts (template substitution depuis video_prompts.py)
2. Lance chaque prompt sur Seedance 2.0 via Higgsfield CLI
3. Émet des événements JSON sur stdout (même protocole que pipeline.studio)

Modes :
- random_full    : scénario + variables totalement aléatoires
- random_select  : variables aléatoires dans les pools (scénario peut être fixé)
- batch_config   : variables explicitement définies via --selections
"""

import argparse
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

from pipeline.video_prompts import generate_batch

MAX_CONCURRENT = 1  # Seedance 2.0 : 1 seul job vidéo à la fois (concurrent_jobs_limit)

_semaphore: asyncio.Semaphore | None = None


def get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    return _semaphore


# ─── Higgsfield video generation ──────────────────────────────────────────────

async def generate_video(
    prompt_json: str,
    element_id: str,
    user_token: str,
    aspect_ratio: str = "9:16",
    resolution: str = "1080p",
    duration: int = 5,
    shortcode: str = "",
    timeout: int = 900,
) -> dict:
    """Lance une génération Seedance 2.0 et retourne {"url": "..."} ou {"error": "..."}."""
    from pipeline.generator import run_higgsfield_for_user

    # Le tag <<<element_id>>> préfixe le prompt JSON (même pattern que seedream/nanobanana)
    full_prompt = f"<<<{element_id}>>> {prompt_json}"

    cmd = [
        "higgsfield", "generate", "create", "seedance_2_0",
        "--prompt", full_prompt,
        "--aspect_ratio", aspect_ratio,
        "--resolution", resolution,
        "--duration", str(duration),
        "--mode", "std",
        "--wait",
        "--wait-timeout", "15m",
    ]

    sem = get_semaphore()
    async with sem:
        for attempt in range(3):  # 3 tentatives max
            try:
                result_url = await run_higgsfield_for_user(user_token, cmd, timeout=timeout)
                if result_url:
                    return {"url": result_url.strip()}
                return {"url": None, "error": "EMPTY_RESULT"}

            except asyncio.TimeoutError:
                return {"url": None, "error": "TIMEOUT"}

            except Exception as e:
                err = str(e)

                if "concurrent_jobs_limit" in err:
                    # Attendre que le job en cours se termine avant de réessayer
                    wait_time = 60 * (attempt + 1)  # 60s, 120s, 180s
                    print(json.dumps({
                        "type": "warn",
                        "msg": f"concurrent_jobs_limit [{shortcode}] — attente {wait_time}s avant retry {attempt + 1}/3"
                    }), flush=True)
                    await asyncio.sleep(wait_time)
                    continue  # retry

                print(json.dumps({
                    "type": "warn",
                    "msg": f"Seedance error [{shortcode}]: {err[:200]}"
                }), flush=True)
                return {"url": None, "error": err[:300]}

        return {"url": None, "error": "concurrent_jobs_limit — max retries reached"}


# ─── Run video studio ─────────────────────────────────────────────────────────

async def run_video_studio(
    run_id: str,
    count: int,
    mode: str,
    selections: dict,
    niche: str,
    element_id: str,
    user_token: str,
    aspect_ratio: str,
    resolution: str,
    duration: int,
    bank_prompts: list[dict] | None = None,
) -> None:
    """Orchestre la génération batch de vidéos."""
    from pipeline.drive_uploader import init_drive_uploader_from_env
    drive = init_drive_uploader_from_env()

    # Phase 1 : génération des prompts (synchrone, instantané)
    try:
        batch = generate_batch(
            count=count,
            mode=mode,
            selections=selections,
            niche=niche,
            bank_prompts=bank_prompts or [],
        )
    except Exception as e:
        print(json.dumps({"type": "error", "message": f"Prompt generation failed: {e}"}), flush=True)
        sys.exit(1)

    actual_count = len(batch)
    print(json.dumps({"type": "generation_start", "total": actual_count}), flush=True)

    completed = 0
    failed = 0

    async def generate_one(i: int, item: dict):
        nonlocal completed, failed

        shortcode = f"video_{i + 1}"
        scenario = item["scenario"]
        variables = item["variables"]
        prompt_json = item["prompt_json"]

        print(json.dumps({
            "type": "generation",
            "shortcode": shortcode,
            "status": "started",
            "rank": i,
            "model": "seedance_2_0",
        }), flush=True)

        result = await generate_video(
            prompt_json=prompt_json,
            element_id=element_id,
            user_token=user_token,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration=duration,
            shortcode=shortcode,
        )

        if result.get("url"):
            completed += 1
            print(json.dumps({
                "type": "generation",
                "shortcode": shortcode,
                "status": "complete",
                "url": result["url"],
                "model": "seedance_2_0",
                "fallback": False,
                "prompt": prompt_json,
                "scene": f"{niche.title()} · {scenario.replace(f'{niche}_', '').replace('_', ' ').title()}",
                "scenario": scenario,
                "variables": variables,
                "likes": 0,
                "comments": 0,
                "caption": "",
                "post_url": "",
                "rank": i,
                "slide_index": 0,
                "local_image_path": None,
            }), flush=True)

            # Upload vers Google Drive en arrière-plan (non bloquant)
            if drive:
                asyncio.create_task(
                    drive.upload_video(run_id, niche, shortcode, result["url"])
                )
        else:
            failed += 1
            print(json.dumps({
                "type": "generation",
                "shortcode": shortcode,
                "status": "failed",
                "error": result.get("error", "UNKNOWN"),
                "rank": i,
            }), flush=True)

    tasks = [generate_one(i, item) for i, item in enumerate(batch)]
    await asyncio.gather(*tasks)

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": actual_count,
        "completed": completed,
        "failed": failed,
        "fallbacks": 0,
    }), flush=True)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Video Studio — Seedance 2.0 batch generation")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--mode", required=True, choices=["random_full", "random_select", "batch_config"])
    parser.add_argument("--selections", default="{}", help="JSON des sélections")
    parser.add_argument("--niche", default="conference")
    parser.add_argument("--element-id", required=True)
    parser.add_argument("--aspect-ratio", default="9:16")
    parser.add_argument("--resolution", default="1080p")
    parser.add_argument("--duration", type=int, default=5)
    parser.add_argument("--bank-prompts-file", default="", help="Chemin vers le JSON des bank prompts")
    args = parser.parse_args()

    higgsfield_token = os.environ.get("HIGGSFIELD_TOKEN")
    if not higgsfield_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    try:
        selections = json.loads(args.selections)
    except json.JSONDecodeError as e:
        print(json.dumps({"type": "error", "message": f"Selections JSON invalide: {e}"}), flush=True)
        sys.exit(1)

    # Charger les bank prompts si fournis
    bank_prompts: list[dict] = []
    if args.bank_prompts_file and Path(args.bank_prompts_file).exists():
        try:
            with open(args.bank_prompts_file) as f:
                bank_prompts = json.load(f)
            # Nettoyer le fichier temp
            Path(args.bank_prompts_file).unlink(missing_ok=True)
        except Exception as e:
            print(json.dumps({"type": "warn", "msg": f"Bank prompts load error: {e}"}), flush=True)

    asyncio.run(run_video_studio(
        run_id=args.run_id,
        count=args.count,
        mode=args.mode,
        selections=selections,
        niche=args.niche,
        element_id=args.element_id,
        user_token=higgsfield_token,
        aspect_ratio=args.aspect_ratio,
        resolution=args.resolution,
        duration=args.duration,
        bank_prompts=bank_prompts,
    ))


if __name__ == "__main__":
    main()
