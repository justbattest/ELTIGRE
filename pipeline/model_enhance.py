#!/usr/bin/env python3
"""
model_enhance.py — Stage B Modelify : édite le set de référence via ModelArk (Seedream 4.5).

À partir des images du set (Stage A, déjà sur disque), produit, selon --mode :
  - "boost" : augmentation HOMOGÈNE de la poitrine (même prompt + même seed sur toutes les images)
  - "back"  : vue de dos par image (identité préservée)
  - "both"  : les deux

Events (une ligne JSON par event sur stdout, consommés en SSE côté Next.js) :
    {"type":"start","total":N}
    {"type":"image","index":i,"total":N,"id":..,"label":..,"name":"..png","kind":"boost|back","ok":true}
    {"type":"image", ... ,"ok":false,"error":..}
    {"type":"done","dir":..,"ok":N,"fail":M}
    {"type":"error","msg":..}

Env : ARK_API_KEY, ARK_BASE_URL, MODELIFY_IMAGE_MODEL (passés par la route Next.js).
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from pipeline import modelark, storage  # siblings pipeline/ (lancé via -m pipeline.model_enhance)

_emit_lock = threading.Lock()
_RETRYABLE = ("429", "rate", "quota", "RESOURCE", "503", "UNAVAILABLE", "timeout", "500", "INTERNAL", "ServerOverloaded")


def emit(event: dict) -> None:
    with _emit_lock:
        print(json.dumps(event), flush=True)


def _call_with_retry(fn, attempts: int = 6):
    """
    Retry sur erreurs transitoires. Laisse passer Refus/NonActivé.
    Cas spécial 'concurrency limit' (429 WaveSpeed compte bas tier) : on attend plus longtemps
    que les slots se libèrent (les autres jobs du batch finissent en ~15-20s).
    """
    last = None
    for attempt in range(attempts):
        try:
            return fn()
        except (modelark.ModelNotActivated, modelark.ContentRefused):
            raise
        except Exception as exc:  # noqa: BLE001
            last = exc
            s = str(exc).lower()
            is_concurrency = "concurrency" in s or "429" in s
            is_transient = any(k.lower() in s for k in _RETRYABLE)
            if attempt < attempts - 1 and (is_concurrency or is_transient):
                time.sleep(6 if is_concurrency else 2 * (attempt + 1))
                continue
            raise
    raise last  # pragma: no cover


def generate(args: argparse.Namespace) -> None:
    images = [p for p in args.images.split("|") if p.strip()]
    if not images:
        emit({"type": "error", "msg": "Aucune image en entrée"})
        sys.exit(1)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    anchor = args.anchor_path or None

    do_morph = args.mode in ("morph", "both")
    do_back = args.mode in ("back", "both")
    per_img = (1 if do_morph else 0) + (1 if do_back else 0)
    total = len(images) * per_img
    emit({"type": "start", "total": total})

    idx_lock = threading.Lock()
    idx_ctr = [0]
    cnt_lock = threading.Lock()
    cnt = {"ok": 0, "fail": 0}

    def emit_img(stem: str, kind: str, *, ok: bool, name=None, status=None, error=None) -> None:
        with idx_lock:
            i = idx_ctr[0]
            idx_ctr[0] += 1
        ev = {"type": "image", "index": i, "total": total, "id": stem, "label": stem, "kind": kind, "ok": ok}
        if name:
            ev["name"] = name
        if status:
            ev["status"] = status
        if error:
            ev["error"] = error
        if ok and name and args.storage_prefix:
            ev["stored"] = storage.upload_png(f"{args.storage_prefix}/{name}", (out_dir / name).read_bytes())
        with cnt_lock:
            cnt["ok" if ok else "fail"] += 1
        emit(ev)

    def run_morph(src: str, stem: str) -> str | None:
        name = f"{stem}-morph.png"
        try:
            data, status = _call_with_retry(lambda: modelark.body_morph(
                src, bust_idx=args.bust_idx, hips_key=args.hips,
                keep_framing=args.keep_framing, seed=args.seed, anchor_path=anchor, route=args.route))
            (out_dir / name).write_bytes(data)
            emit_img(stem, "morph", ok=True, name=name, status=status)
            return str(out_dir / name)
        except modelark.ModelNotActivated as exc:
            emit_img(stem, "morph", ok=False, error=f"ModelArk non activé : {exc}")
        except modelark.ContentRefused as exc:
            emit_img(stem, "morph", ok=False, status="needs_review", error=f"Modération : {exc}")
        except Exception as exc:  # noqa: BLE001
            emit_img(stem, "morph", ok=False, error=str(exc)[:300])
        return None

    def run_back(src: str, stem: str) -> None:
        name = f"{stem}-back.png"
        try:
            data, status = _call_with_retry(lambda: modelark.back_view(
                src, butt_idx=args.butt_idx, keep_dress=args.keep_dress, seed=args.seed, anchor_path=anchor, route=args.route))
            (out_dir / name).write_bytes(data)
            emit_img(stem, "back", ok=True, name=name, status=status)
        except modelark.ModelNotActivated as exc:
            emit_img(stem, "back", ok=False, error=f"ModelArk non activé : {exc}")
        except modelark.ContentRefused as exc:
            emit_img(stem, "back", ok=False, status="needs_review", error=f"Modération (source non couverte ?) : {exc}")
        except Exception as exc:  # noqa: BLE001
            emit_img(stem, "back", ok=False, error=str(exc)[:300])

    def process(src: str) -> None:
        stem = Path(src).stem
        if not Path(src).is_file():
            if do_morph:
                emit_img(stem, "morph", ok=False, error="fichier introuvable")
            if do_back:
                emit_img(stem, "back", ok=False, error="fichier introuvable")
            return
        morph_out = run_morph(src, stem) if do_morph else None
        if do_back:
            # §8 : enchaîner le back view sur la sortie morphée si dispo (sinon la source)
            run_back(morph_out or src, stem)

    workers = max(1, min(args.concurrency, len(images)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(as_completed([pool.submit(process, s) for s in images]))

    emit({"type": "done", "dir": str(out_dir.resolve()), "ok": cnt["ok"], "fail": cnt["fail"]})


def main() -> None:
    parser = argparse.ArgumentParser(description="Modelify Stage B — édition du set via ModelArk")
    sub = parser.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate")
    g.add_argument("--run-id", required=True)
    g.add_argument("--images", required=True, help="chemins séparés par |")
    g.add_argument("--output-dir", required=True)
    g.add_argument("--mode", default="morph", choices=["morph", "back", "both"])
    g.add_argument("--route", default="wavespeed", choices=["wavespeed", "modelark"], help="moteur : wavespeed (défaut, sans modération) ou modelark")
    g.add_argument("--bust-idx", type=int, default=0, help="0=max … 3=léger (BUST_LEVELS)")
    g.add_argument("--hips", default="wide", choices=["wide", "moderate", "subtle"])
    g.add_argument("--keep-framing", action="store_true", help="verrouiller cadrage/tenue (ne pas dézoomer)")
    g.add_argument("--butt-idx", type=int, default=1, help="0=huge bubble … 2=toned léger (BUTT_LEVELS, back view)")
    g.add_argument("--keep-dress", action="store_true", help="garder une robe couvrant le fessier (back view)")
    g.add_argument("--anchor-path", default="", help="ancre d'identité en multi-référence (optionnel)")
    g.add_argument("--seed", type=int, default=778899)
    g.add_argument("--concurrency", type=int, default=3, help="éditions en parallèle (défaut 3 ; WaveSpeed free tier ≈ 1 slot → le retry encaisse le 429)")
    g.add_argument("--storage-prefix", default="", help="préfixe Supabase Storage (ex. {userId}/edits/{runId})")

    args = parser.parse_args()
    if args.cmd == "generate":
        generate(args)


if __name__ == "__main__":
    main()
