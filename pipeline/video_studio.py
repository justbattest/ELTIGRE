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

from pipeline.video_prompts import generate_batch, apply_variation, pick_variation_outfit, pick_variation_phrase  # noqa: F401

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


# ─── Run validated prompts (modes direct / variation) ────────────────────────

async def run_validated_studio(
    run_id: str,
    mode: str,
    prompts_config: dict,
    element_id: str,
    user_token: str,
    aspect_ratio: str,
    resolution: str,
    duration: int,
) -> None:
    """
    Orchestre la génération depuis les prompts validés (modes 'direct' et 'variation').

    prompts_config structure :
      {
        "mode": "direct" | "variation",
        "outfit_override": "...",   # None = aléatoire
        "phrase_override": "...",   # None = aléatoire
        "prompts": [
          { "id": int, "title": "...", "promptJson": "...",
            "outfitText": str|None, "speakerLine": str|None,
            "subNiche": "conference"|"sport", "repeatIndex": int }
        ]
      }
    """
    from pipeline.drive_uploader import init_drive_uploader_from_env
    drive = init_drive_uploader_from_env()

    items = prompts_config.get("prompts", [])
    outfit_override: str | None = prompts_config.get("outfit_override")
    phrase_override: str | None = prompts_config.get("phrase_override")

    actual_count = len(items)
    print(json.dumps({"type": "generation_start", "total": actual_count}), flush=True)

    # Tracker des outfits/phrases déjà utilisés pour éviter les répétitions en mode variation
    used_outfits: list[str] = []
    used_phrases: list[str] = []

    completed = 0
    failed = 0

    async def generate_one(i: int, item: dict):
        nonlocal completed, failed, used_outfits, used_phrases

        shortcode = f"video_{i + 1}"
        prompt_json: str = item["promptJson"]
        sub_niche: str = item.get("subNiche", "conference")
        title: str = item.get("title", f"prompt_{item['id']}")

        # ── Mode variation : appliquer les overrides outfit + phrase ──
        if mode == "variation":
            outfit_text = item.get("outfitText")
            speaker_line = item.get("speakerLine")

            # Outfit : override explicite OU aléatoire dans le pool (sans répétitions)
            new_outfit = outfit_override or pick_variation_outfit(sub_niche, used_outfits)
            used_outfits.append(new_outfit)

            # Phrase : depuis le pool DÉDIÉ à ce prompt (phraseVariations en DB)
            # Override explicite > aléatoire dans le pool du prompt > rien si pas de pool
            new_phrase = None
            phrase_pool: list[str] = item.get("phraseVariations") or []
            if speaker_line and (phrase_override or phrase_pool):
                new_phrase = phrase_override or pick_variation_phrase(phrase_pool, used_phrases)
                if new_phrase:
                    used_phrases.append(new_phrase)

            prompt_json = apply_variation(
                prompt_json=prompt_json,
                outfit_text=outfit_text,
                new_outfit=new_outfit,
                speaker_line=speaker_line,
                new_phrase=new_phrase,
            )

        print(json.dumps({
            "type": "generation",
            "shortcode": shortcode,
            "status": "started",
            "rank": i,
            "model": "seedance_2_0",
            "scene": title,
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
                "scene": title,
                "scenario": f"validated_{item['id']}",
                "variables": {"mode": mode, "sub_niche": sub_niche},
                "likes": 0, "comments": 0, "caption": "", "post_url": "",
                "rank": i,
                "slide_index": 0,
                "local_image_path": None,
            }), flush=True)

            if drive:
                asyncio.create_task(
                    drive.upload_video(run_id, "conference_sport", shortcode, result["url"])
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

    tasks = [generate_one(i, item) for i, item in enumerate(items)]
    await asyncio.gather(*tasks)

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": actual_count,
        "completed": completed,
        "failed": failed,
        "fallbacks": 0,
    }), flush=True)


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
    parser.add_argument("--mode", required=True)
    parser.add_argument("--element-id", required=True)
    parser.add_argument("--aspect-ratio", default="9:16")
    parser.add_argument("--resolution", default="1080p")
    parser.add_argument("--duration", type=int, default=5)
    # Modes legacy
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--selections", default="{}", help="JSON des sélections (modes legacy)")
    parser.add_argument("--niche", default="conference")
    parser.add_argument("--bank-prompts-file", default="", help="Chemin vers le JSON des bank prompts (modes legacy)")
    # Nouveaux modes
    parser.add_argument("--validated-prompts-file", default="", help="Chemin vers le JSON des prompts validés (modes direct/variation)")
    args = parser.parse_args()

    higgsfield_token = os.environ.get("HIGGSFIELD_TOKEN")
    if not higgsfield_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    # ── Nouveaux modes : direct / variation ──────────────────────────────────
    if args.mode in ("direct", "variation"):
        if not args.validated_prompts_file or not Path(args.validated_prompts_file).exists():
            print(json.dumps({"type": "error", "message": "validated-prompts-file manquant"}), flush=True)
            sys.exit(1)
        try:
            with open(args.validated_prompts_file) as f:
                prompts_config = json.load(f)
            Path(args.validated_prompts_file).unlink(missing_ok=True)
        except Exception as e:
            print(json.dumps({"type": "error", "message": f"Erreur lecture prompts validés: {e}"}), flush=True)
            sys.exit(1)

        asyncio.run(run_validated_studio(
            run_id=args.run_id,
            mode=args.mode,
            prompts_config=prompts_config,
            element_id=args.element_id,
            user_token=higgsfield_token,
            aspect_ratio=args.aspect_ratio,
            resolution=args.resolution,
            duration=args.duration,
        ))
        return

    # ── Modes legacy : random_full / random_select / batch_config ────────────
    try:
        selections = json.loads(args.selections)
    except json.JSONDecodeError as e:
        print(json.dumps({"type": "error", "message": f"Selections JSON invalide: {e}"}), flush=True)
        sys.exit(1)

    bank_prompts: list[dict] = []
    if args.bank_prompts_file and Path(args.bank_prompts_file).exists():
        try:
            with open(args.bank_prompts_file) as f:
                bank_prompts = json.load(f)
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
