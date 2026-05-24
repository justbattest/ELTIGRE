"""
Entry point CLI du pipeline — pour tests standalone et launch depuis Next.js.

Usage (test standalone):
    cd ~/Documents/emma-content-pipeline
    source venv/bin/activate

    APIFY_KEY=xxx ANTHROPIC_KEY=xxx HIGGSFIELD_TOKEN=xxx \\
    python -m pipeline.main \\
        --run-id test_001 \\
        --profiles '["https://www.instagram.com/emmavareli1/"]' \\
        --max-posts 5 \\
        --soul-id 34ee058b-14eb-4c13-a0bb-1863ff6a8131 \\
        --element-id 90a1a85f-8c02-40ae-900e-c91f23532cad \\
        --model auto \\
        --aspect-ratio 2:3 \\
        --quality 2k

Launch depuis Next.js (API route) :
    env = {
        "APIFY_KEY": apify_key,
        "ANTHROPIC_KEY": anthropic_key,
        "HIGGSFIELD_TOKEN": higgsfield_token,
        ...os.environ
    }
    subprocess.Popen(["python", "-m", "pipeline.main", ...], env=env, stdout=PIPE)
"""

import asyncio
import argparse
import json
import os
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Emma Content Pipeline")
    parser.add_argument("--run-id", required=True, help="ID unique du run")
    parser.add_argument("--profiles", required=True, help="JSON array d'URLs Instagram")
    parser.add_argument("--max-posts", type=int, default=50)
    parser.add_argument("--soul-id", required=True, help="UUID Soul Character Higgsfield")
    parser.add_argument("--element-id", required=True, help="UUID Reference Element Higgsfield")
    parser.add_argument("--model", default="auto",
                        choices=["auto", "soul_cinematic", "seedream_v4_5", "nano_banana_2"])
    parser.add_argument("--aspect-ratio", default="2:3")
    parser.add_argument("--quality", default="2k")
    parser.add_argument("--work-dir", default=None,
                        help="Répertoire de travail (défaut: ./temp/<run_id>)")
    return parser.parse_args()


async def main():
    args = parse_args()

    # Credentials depuis env vars
    apify_key = os.environ.get("APIFY_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_KEY")
    higgsfield_token = os.environ.get("HIGGSFIELD_TOKEN")

    if not apify_key:
        print(json.dumps({"type": "error", "message": "APIFY_KEY manquant"}), flush=True)
        sys.exit(1)
    if not anthropic_key:
        print(json.dumps({"type": "error", "message": "ANTHROPIC_KEY manquant"}), flush=True)
        sys.exit(1)
    if not higgsfield_token:
        print(json.dumps({"type": "error", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    try:
        profiles = json.loads(args.profiles)
    except json.JSONDecodeError:
        print(json.dumps({"type": "error", "message": "--profiles doit être un JSON array valide"}), flush=True)
        sys.exit(1)

    work_dir = args.work_dir or f"./temp/{args.run_id}"

    # Importer ici pour ne pas crasher si deps manquantes avant les checks
    from pipeline.queue_manager import run_pipeline

    await run_pipeline(
        run_id=args.run_id,
        profiles=profiles,
        max_posts=args.max_posts,
        soul_id=args.soul_id,
        element_id=args.element_id,
        model_setting=args.model,
        aspect_ratio=args.aspect_ratio,
        quality=args.quality,
        apify_key=apify_key,
        anthropic_key=anthropic_key,
        higgsfield_token=higgsfield_token,
        work_dir=work_dir,
    )


if __name__ == "__main__":
    asyncio.run(main())
