"""
Smoke test pour pipeline/spoofer.py — Spoofer 2.0.

Usage :
  venv/bin/python -m pipeline.test_spoofer_smoke

Vérifie sans dépendance réseau STRICTE :
  - spoof_image_bytes() pour les 3 niveaux (light/medium/aggressive)
      - aggressive : tente de charger ClipAdversary (Tier 3, télécharge les poids
        ViT-B-32 ~350MB au premier lancement). Si indisponible (pas d'internet,
        torch/open_clip absents) → dégradation gracieuse testée (Tier 1+2), pas
        un échec du smoke test.
  - spoof_video_bytes() pour les 3 niveaux, AVEC et SANS piste audio
  - Imprime "ALL SMOKE TESTS PASSED" si tout est ok (exit code 0).
"""

import io
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

from pipeline.spoofer import (
    ClipAdversary,
    spoof_image_bytes,
    spoof_video_bytes,
    _find_ffmpeg,
    _probe,
)


def make_synthetic_image(w: int = 512, h: int = 512, seed: int = 0) -> bytes:
    rng = np.random.RandomState(seed)
    arr = rng.randint(0, 255, size=(h, w, 3), dtype=np.uint8)
    # Ajoute un peu de structure (gradient) pour que les diffs perceptuelles aient un sens
    for i in range(h):
        arr[i, :, 0] = np.clip(arr[i, :, 0].astype(int) + i // 4, 0, 255)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def make_synthetic_video(ffmpeg: str, path: str, with_audio: bool,
                          duration: int = 3, w: int = 320, h: int = 240) -> None:
    cmd = [ffmpeg, "-y", "-f", "lavfi", "-i", f"testsrc=duration={duration}:size={w}x{h}:rate=25"]
    if with_audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
                "-c:v", "libx264", "-c:a", "aac", "-shortest"]
    else:
        cmd += ["-c:v", "libx264", "-an"]
    cmd += ["-pix_fmt", "yuv420p", path]
    subprocess.run(cmd, capture_output=True, check=True, timeout=60)


def check(label: str, cond: bool) -> None:
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    if not cond:
        raise AssertionError(label)


def main() -> int:
    print("=== Spoofer 2.0 — smoke test ===\n")

    tmp_root = tempfile.mkdtemp(prefix="spoofer_smoke_")
    try:
        # ── Images ──────────────────────────────────────────────────────────
        print("Images")
        orig_bytes = make_synthetic_image()
        orig_img = Image.open(io.BytesIO(orig_bytes))
        orig_w, orig_h = orig_img.size

        clip_adversary = None
        for level in ["light", "medium", "aggressive"]:
            print(f" level={level}")
            adversary_for_level = None
            if level == "aggressive":
                try:
                    if clip_adversary is None:
                        clip_adversary = ClipAdversary()
                    adversary_for_level = clip_adversary
                    print(f"   CLIP chargé (device={clip_adversary.device})")
                except Exception as e:
                    print(f"   CLIP indisponible ({str(e)[:150]}) — test de dégradation gracieuse")

            out_bytes, tiers = spoof_image_bytes(orig_bytes, seed=42, level=level, clip_adversary=adversary_for_level)
            check(f"{level}: bytes différents de l'original", out_bytes != orig_bytes)

            out_img = Image.open(io.BytesIO(out_bytes))
            check(f"{level}: image décodable ({out_img.format})", out_img.format == "JPEG")
            check(
                f"{level}: dimensions proches de l'original ({out_img.size} vs {(orig_w, orig_h)})",
                abs(out_img.size[0] - orig_w) <= 8 and abs(out_img.size[1] - orig_h) <= 8,
            )
            check(f"{level}: tiers appliqués = {tiers}", "tier1" in tiers and "metadata" in tiers)
            if level == "aggressive" and adversary_for_level is not None:
                check(f"{level}: tier3 appliqué", "tier3" in tiers)

        print()

        # ── Vidéos ──────────────────────────────────────────────────────────
        print("Vidéos")
        ffmpeg = _find_ffmpeg()
        check("ffmpeg disponible", ffmpeg is not None)
        assert ffmpeg is not None

        for with_audio in (True, False):
            label = "avec audio" if with_audio else "sans audio"
            src_path = os.path.join(tmp_root, f"src_{'a' if with_audio else 'na'}.mp4")
            make_synthetic_video(ffmpeg, src_path, with_audio=with_audio)
            with open(src_path, "rb") as f:
                src_bytes = f.read()
            check(f"vidéo synthétique générée ({label}), {len(src_bytes)} bytes", len(src_bytes) > 0)

            info = _probe(ffmpeg, src_path)
            check(
                f"probe OK ({label}): duration={info['duration']:.2f}s has_audio={info['has_audio']}",
                info["duration"] > 0 and info["has_audio"] == with_audio,
            )

            for level in ["light", "medium", "aggressive"]:
                print(f" level={level} ({label})")
                vtmp = os.path.join(tmp_root, f"vtmp_{level}_{with_audio}")
                out_bytes, tiers = spoof_video_bytes(src_bytes, seed=123, level=level, tmp_dir=vtmp)
                check(f"{level} {label}: bytes différents de l'original", out_bytes != src_bytes)
                check(f"{level} {label}: tiers appliqués = {tiers}", "metadata" in tiers)

                out_path = os.path.join(tmp_root, f"out_{level}_{with_audio}.mp4")
                with open(out_path, "wb") as f:
                    f.write(out_bytes)
                out_info = _probe(ffmpeg, out_path)
                check(
                    f"{level} {label}: sortie probable par ffmpeg (duration={out_info['duration']:.2f}s)",
                    out_info["duration"] > 0,
                )

        print("\nALL SMOKE TESTS PASSED")
        return 0
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
