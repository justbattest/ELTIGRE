#!/usr/bin/env python3
"""
model_refset.py — Génère le SET DE RÉFÉRENCE d'une modèle IA depuis une ANCRE.

Reproduit en pipeline Modelify la recette validée sur Miraya (cf vault OFM-IA
"SOP - Set de référence modèle") = les deux skills mélangés :
  - moteur de génération : Nano Banana 2 / Gemini 3.1 Flash Image (image-to-image)
  - méthodo de prompt    : i2i-avatar-creator-base (prompts construits côté webapp via Claude)

Ce module ne fait QUE l'étape moteur : il reçoit une ancre + une liste de prompts de
scène (déjà construits par Claude côté Next.js) et génère une image par prompt en i2i
depuis l'ancre (→ identité préservée, comme le "character @" de Higgsfield).

Subcommand :
    generate --run-id ID --anchor-path A.png --prompts-json P.json --output-dir DIR
             [--resolution 2K] [--aspect-ratio 9:16]

Events (une ligne JSON par event sur stdout, consommés en SSE côté Next.js) :
    {"type":"start","total":N}
    {"type":"image","index":i,"total":N,"id":..,"label":..,"name":"ref-XX.png","ok":true}
    {"type":"image", ... ,"ok":false,"error":".."}
    {"type":"done","dir":..,"ok":N,"fail":M}
    {"type":"error","msg":..}

Clé API : GEMINI_API_KEY (env). Passée par la route Next.js depuis l'env système.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from pipeline import storage

_emit_lock = threading.Lock()

# Erreurs transitoires sur lesquelles on retry (rate-limit / surcharge / timeout)
_RETRYABLE = ("429", "RESOURCE_EXHAUSTED", "quota", "rate", "503", "UNAVAILABLE", "deadline", "timeout", "500", "INTERNAL")


def emit(event: dict) -> None:
    with _emit_lock:
        print(json.dumps(event), flush=True)


def slugify(text: str, fallback: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:40] or fallback


def generate(args: argparse.Namespace) -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        emit({"type": "error", "msg": "GEMINI_API_KEY manquant dans l'environnement"})
        sys.exit(1)

    anchor_path = Path(args.anchor_path)
    if not anchor_path.is_file():
        emit({"type": "error", "msg": f"Ancre introuvable : {anchor_path}"})
        sys.exit(1)

    try:
        prompts = json.loads(Path(args.prompts_json).read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "msg": f"prompts-json illisible : {exc!s}"})
        sys.exit(1)

    if not isinstance(prompts, list) or not prompts:
        emit({"type": "error", "msg": "Aucun prompt de scène fourni"})
        sys.exit(1)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Imports lourds seulement après les checks
    try:
        from google import genai
        from google.genai import types
        from PIL import Image as PILImage
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "msg": f"Dépendances manquantes (google-genai/pillow) : {exc!s}"})
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    anchor_img = PILImage.open(anchor_path)
    anchor_img.load()  # charge les pixels en mémoire → partage sûr entre threads (lecture seule)

    total = len(prompts)
    emit({"type": "start", "total": total})

    image_config_kwargs = {"image_size": args.resolution}
    if args.aspect_ratio:
        image_config_kwargs["aspect_ratio"] = args.aspect_ratio

    def gen_one(i: int, item) -> dict:
        if isinstance(item, str):
            pid, label, prompt = str(i + 1), "", item
        else:
            pid = str(item.get("id") or (i + 1))
            label = str(item.get("label") or "")
            prompt = str(item.get("prompt") or "")

        base = {"type": "image", "index": i, "total": total, "id": pid, "label": label}
        if not prompt.strip():
            return {**base, "ok": False, "error": "prompt vide"}

        name = f"ref-{slugify(pid + '-' + label, pid)}.png"
        dest = out_dir / name

        last_err = "Aucune image renvoyée (refus API probable — reformuler la scène)"
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model="gemini-3.1-flash-image-preview",
                    contents=[anchor_img, prompt],
                    config=types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"],
                        image_config=types.ImageConfig(**image_config_kwargs),
                    ),
                )
                for part in response.parts:
                    if getattr(part, "inline_data", None) is not None:
                        data = part.inline_data.data
                        if isinstance(data, str):
                            import base64
                            data = base64.b64decode(data)
                        img = PILImage.open(BytesIO(data))
                        if img.mode == "RGBA":
                            bg = PILImage.new("RGB", img.size, (255, 255, 255))
                            bg.paste(img, mask=img.split()[3])
                            bg.save(str(dest), "PNG")
                        elif img.mode == "RGB":
                            img.save(str(dest), "PNG")
                        else:
                            img.convert("RGB").save(str(dest), "PNG")
                        ev = {**base, "name": name, "ok": True}
                        if args.storage_prefix:
                            ev["stored"] = storage.upload_png(f"{args.storage_prefix}/{name}", dest.read_bytes())
                        return ev
                # Pas d'image dans la réponse = refus → inutile de retry
                return {**base, "ok": False, "error": last_err}
            except Exception as exc:  # noqa: BLE001
                last_err = str(exc)[:300]
                if attempt < 2 and any(k.lower() in last_err.lower() for k in _RETRYABLE):
                    time.sleep(2 * (attempt + 1))
                    continue
                break
        return {**base, "ok": False, "error": last_err}

    ok_count = 0
    fail_count = 0
    workers = max(1, min(args.concurrency, total))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(gen_one, i, item) for i, item in enumerate(prompts)]
        for fut in as_completed(futures):
            ev = fut.result()
            if ev.get("ok"):
                ok_count += 1
            else:
                fail_count += 1
            emit(ev)

    emit({"type": "done", "dir": str(out_dir.resolve()), "ok": ok_count, "fail": fail_count})


def main() -> None:
    parser = argparse.ArgumentParser(description="Modelify — génération du set de référence d'une modèle")
    sub = parser.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="Générer le set depuis une ancre + des prompts")
    g.add_argument("--run-id", required=True)
    g.add_argument("--anchor-path", required=True)
    g.add_argument("--prompts-json", required=True)
    g.add_argument("--output-dir", required=True)
    g.add_argument("--resolution", default="2K", choices=["0.5K", "1K", "2K", "4K"])
    g.add_argument("--aspect-ratio", default="9:16")
    g.add_argument("--concurrency", type=int, default=10, help="générations en parallèle (défaut 10)")
    g.add_argument("--storage-prefix", default="", help="préfixe Supabase Storage (ex. {userId}/refset/{runId})")

    args = parser.parse_args()
    if args.cmd == "generate":
        generate(args)


if __name__ == "__main__":
    main()
