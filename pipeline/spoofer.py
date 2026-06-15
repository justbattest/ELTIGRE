"""
Spoofer 2.0 — Anti-détection Instagram (4 tiers, images + vidéos)

Génère N variations d'une image ou d'une vidéo, visuellement quasi-identiques mais
techniquement différentes, pour échapper aux couches de détection de duplicatas
d'Instagram :

  Tier 1 — géométrie (crop/zoom, flip horizontal, micro-rotation)
           casse les hash perceptuels (pHash/dHash)
  Tier 2 — fréquence/couleur (perspective warp, color grading, vignette, grain)
           casse l'empreinte fréquentielle type PhotoDNA (DCT)
  Tier 3 — adversarial CLIP (images uniquement, niveau Agressif)
           casse les embeddings neuronaux (CLIP/SimCLR + FAISS)
  Tier 4 — vidéo-spécifique (vitesse non-uniforme par segments, pitch audio,
           watermark inaudible, GOP/CRF/preset randomisés)
           pour les vidéos en niveau Agressif (remplace le Tier 3, trop lent par frame)

Passe finale (tous niveaux, image + vidéo) : `optimize_image_bytes` /
`optimize_video_bytes` (pipeline/metadata_optimizer.py) — EXIF/QuickTime iPhone 17 Pro,
qtables Apple, micro-crop/bruit, remux métadonnées.

Niveaux → tiers :
  light      : Tier 1 (images + vidéos)
  medium     : Tier 1 + 2 (images + vidéos)
  aggressive : Tier 1 + 2 + 3 (images)  /  Tier 1 + 2 + 4 (vidéos)

Dégradation gracieuse : si torch/open_clip/rembg/ffmpeg indisponibles, le niveau
Agressif retombe silencieusement sur Tier 1+2 (images) — jamais de crash.

Protocole stdout JSON-lines (1 par ligne, flush=True) :
  {"type": "start", "run_id": "...", "total_files": N, "total_variations": N*K, "level": "..."}
  {"type": "progress", "current": i, "total": T, "file": "...", "variation": k}
  {"type": "variation_done", "file": "...", "variation": k, "output_path": "...", "tiers_applied": [...]}
  {"type": "info", "msg": "..."}
  {"type": "error", "message": "...", "file": "..."}
  {"type": "done", "run_id": "...", "total_outputs": N, "finished_at": "..."}

CLI :
  venv/bin/python -m pipeline.spoofer --run-id <id> --files-dir <dir>
      --level {light,medium,aggressive} --variations N [--output-dir <dir>]
"""

import asyncio
import hashlib
import io
import json
import math
import random
import re
import subprocess
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

from pipeline.metadata_optimizer import (
    _find_ffmpeg,
    optimize_image_bytes,
    optimize_video_bytes,
)


# ── Niveaux → tiers ────────────────────────────────────────────────────────────

LEVEL_TIERS = {
    "light":      {"tier1": True, "tier2": False, "tier3": False, "tier4": False},
    "medium":     {"tier1": True, "tier2": True,  "tier3": False, "tier4": False},
    "aggressive": {"tier1": True, "tier2": True,  "tier3": True,  "tier4": True},
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm"}

CLIP_INPUT_SIZE = 224


# ── Tier 1 — transformations géométriques (images) ──────────────────────────────

def apply_random_crop_zoom(img: Image.Image, rng: random.Random,
                            min_pct: float = 1.0, max_pct: float = 8.0) -> Image.Image:
    """Crop offset aléatoire (pas centré) puis resize LANCZOS vers la taille d'origine."""
    w, h = img.size
    pct = rng.uniform(min_pct, max_pct) / 100.0
    crop_w = max(2, int(round(w * (1 - pct))))
    crop_h = max(2, int(round(h * (1 - pct))))
    max_x = max(0, w - crop_w)
    max_y = max(0, h - crop_h)
    x = rng.randint(0, max_x) if max_x > 0 else 0
    y = rng.randint(0, max_y) if max_y > 0 else 0
    cropped = img.crop((x, y, x + crop_w, y + crop_h))
    return cropped.resize((w, h), Image.LANCZOS)


def apply_horizontal_flip(img: Image.Image, rng: random.Random, prob: float = 0.5) -> Image.Image:
    if rng.random() < prob:
        return img.transpose(Image.FLIP_LEFT_RIGHT)
    return img


def apply_micro_rotation(img: Image.Image, rng: random.Random,
                          min_deg: float = 0.3, max_deg: float = 0.8) -> Image.Image:
    """Rotation BICUBIC d'un angle minuscule, puis recrop (marge dynamique selon l'angle)
    pour éliminer les bords noirs introduits par la rotation, puis resize vers la taille
    d'origine."""
    angle = rng.uniform(min_deg, max_deg)
    if rng.random() < 0.5:
        angle = -angle
    w, h = img.size
    rotated = img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(0, 0, 0))
    # Marge proportionnelle à sin(angle), avec un facteur de sécurité.
    margin_frac = abs(math.sin(math.radians(angle))) * 1.6 + 0.003
    margin_x = max(1, int(w * margin_frac))
    margin_y = max(1, int(h * margin_frac))
    cropped = rotated.crop((margin_x, margin_y, w - margin_x, h - margin_y))
    return cropped.resize((w, h), Image.LANCZOS)


# ── Tier 2 — fréquence / couleur (images) ────────────────────────────────────────

def apply_perspective_warp(img: Image.Image, rng: random.Random, max_pct: float = 1.5) -> Image.Image:
    """Warp perspective subtil : un quadrilatère légèrement resserré vers l'intérieur
    est étiré pour remplir tout le cadre — pas de bordures noires."""
    import cv2

    arr = np.asarray(img)
    h, w = arr.shape[:2]
    max_dx = w * max_pct / 100.0
    max_dy = h * max_pct / 100.0

    src = np.float32([
        [rng.uniform(0, max_dx),         rng.uniform(0, max_dy)],
        [w - 1 - rng.uniform(0, max_dx), rng.uniform(0, max_dy)],
        [w - 1 - rng.uniform(0, max_dx), h - 1 - rng.uniform(0, max_dy)],
        [rng.uniform(0, max_dx),         h - 1 - rng.uniform(0, max_dy)],
    ])
    dst = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])

    matrix = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(
        arr, matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT
    )
    return Image.fromarray(warped)


def apply_color_grade(img: Image.Image, rng: random.Random) -> Image.Image:
    """Gamma/gain/lift par canal (numpy) + contraste/saturation léger (PIL)."""
    arr = np.asarray(img).astype(np.float32) / 255.0
    out = np.empty_like(arr)
    for c in range(3):
        gamma = rng.uniform(0.92, 1.08)
        gain = rng.uniform(0.97, 1.03)
        lift = rng.uniform(-0.02, 0.02)
        channel = np.clip(arr[..., c], 0, 1) ** gamma
        channel = channel * gain + lift
        out[..., c] = np.clip(channel, 0, 1)
    img2 = Image.fromarray((out * 255).astype(np.uint8))
    img2 = ImageEnhance.Contrast(img2).enhance(rng.uniform(0.97, 1.03))
    img2 = ImageEnhance.Color(img2).enhance(rng.uniform(0.95, 1.05))
    return img2


def apply_vignette(img: Image.Image, rng: random.Random) -> Image.Image:
    """Masque radial numpy — assombrit légèrement les coins/bords."""
    w, h = img.size
    arr = np.asarray(img).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    max_dist = math.sqrt(cx ** 2 + cy ** 2)
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max_dist  # 0 centre → ~1 coins
    radius = rng.uniform(0.7, 1.1)
    intensity = rng.uniform(0.05, 0.18)
    falloff = np.clip(dist / radius, 0, 1) ** 2
    mask = 1.0 - intensity * falloff
    out = arr * mask[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def apply_film_grain(img: Image.Image, rng: random.Random) -> Image.Image:
    """Bruit gaussien numpy mélangé à faible opacité — change la signature DCT."""
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    sigma = rng.uniform(1.5, 3.0)
    opacity = rng.uniform(0.02, 0.04)
    np_rng = np.random.RandomState(rng.randint(0, 2 ** 31 - 1))
    noise = np_rng.normal(0, sigma * 25.0, size=(h, w, 1)).astype(np.float32)
    blended = arr + noise * opacity
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))


# ── Tier 3 — adversarial CLIP (images, niveau Agressif) ──────────────────────────

def get_background_mask(img: Image.Image):
    """Retourne un masque PIL 'L' (255=sujet, 0=fond) via rembg, ou None si indisponible
    (dégradation gracieuse — jamais fatal)."""
    try:
        import rembg
    except ImportError:
        return None
    try:
        mask = rembg.remove(img, only_mask=True)
        return mask.convert("L")
    except Exception as e:
        print(json.dumps({
            "type": "info",
            "msg": f"rembg erreur (ignorée, Tier 3 sans masque sujet/fond) : {str(e)[:150]}",
        }), flush=True)
        return None


class ClipAdversary:
    """Perturbation adversariale PGD sur l'embedding CLIP — maximise la distance
    cosinus avec l'embedding original tout en restant imperceptible (epsilon L_inf).

    Le modèle est chargé une seule fois par run et partagé entre toutes les images.
    """

    def __init__(self, device: str | None = None, model_name: str = "ViT-B-32",
                 pretrained: str = "openai"):
        import open_clip
        import torch

        self.torch = torch
        self.device = device or ("mps" if torch.backends.mps.is_available() else "cpu")
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            model_name, pretrained=pretrained
        )
        self.model = self.model.to(self.device).eval()
        for p in self.model.parameters():
            p.requires_grad_(False)

        self.mean = torch.tensor(
            [0.48145466, 0.4578275, 0.40821073], device=self.device
        ).view(3, 1, 1)
        self.std = torch.tensor(
            [0.26862954, 0.26130258, 0.27577711], device=self.device
        ).view(3, 1, 1)

    def perturb(self, img: Image.Image, rng: random.Random,
                 epsilon: float = 3 / 255, steps: int = 4, mask=None) -> Image.Image:
        torch = self.torch
        import torch.nn.functional as F

        orig_w, orig_h = img.size

        # Travailler à résolution CLIP (224x224) pour la perturbation — beaucoup plus
        # rapide, puis upsample du delta vers la résolution d'origine.
        small = img.resize((CLIP_INPUT_SIZE, CLIP_INPUT_SIZE), Image.BILINEAR)
        arr_small = np.asarray(small).astype(np.float32) / 255.0
        resized = torch.from_numpy(arr_small).permute(2, 0, 1).unsqueeze(0).to(self.device)

        with torch.no_grad():
            normed = (resized - self.mean) / self.std
            orig_embed = self.model.encode_image(normed)
            orig_embed = orig_embed / orig_embed.norm(dim=-1, keepdim=True)

        delta = torch.zeros_like(resized, requires_grad=True)
        step_size = (epsilon / steps) * 1.5

        for _ in range(steps):
            adv = torch.clamp(resized + delta, 0, 1)
            normed_adv = (adv - self.mean) / self.std
            embed = self.model.encode_image(normed_adv)
            embed = embed / embed.norm(dim=-1, keepdim=True)
            cos_sim = (embed * orig_embed).sum()

            grad = torch.autograd.grad(cos_sim, delta)[0]
            # Descente de gradient sur cos_sim → éloigne l'embedding de l'original
            new_delta = (delta - step_size * grad.sign()).clamp(-epsilon, epsilon)
            delta = new_delta.detach().requires_grad_(True)

        delta_full = F.interpolate(
            delta.detach(), size=(orig_h, orig_w), mode="bilinear", align_corners=False
        )
        delta_full = delta_full.squeeze(0).permute(1, 2, 0).cpu().numpy()

        if mask is not None:
            try:
                mask_arr = np.asarray(mask.resize((orig_w, orig_h))).astype(np.float32) / 255.0
                # 30% de la perturbation sur le sujet, 100% sur le fond
                weight = 1.0 - 0.7 * mask_arr
                delta_full = delta_full * weight[..., None]
            except Exception:
                pass

        orig_arr = np.asarray(img).astype(np.float32) / 255.0
        out_arr = np.clip(orig_arr + delta_full, 0, 1)
        return Image.fromarray((out_arr * 255).astype(np.uint8))


# ── Passe finale image (Tier 1/2/3 + métadonnées) ────────────────────────────────

def spoof_image_bytes(data: bytes, seed: int, level: str, clip_adversary=None):
    """Applique les tiers selon `level`, puis la passe métadonnées finale.

    Retourne (bytes_jpeg, tiers_applied).
    """
    rng = random.Random(seed)
    img = Image.open(io.BytesIO(data)).convert("RGB")
    tiers = LEVEL_TIERS[level]
    tiers_applied: list[str] = []

    if tiers["tier1"]:
        img = apply_random_crop_zoom(img, rng)
        img = apply_horizontal_flip(img, rng)
        img = apply_micro_rotation(img, rng)
        tiers_applied.append("tier1")

    if tiers["tier2"]:
        img = apply_perspective_warp(img, rng)
        img = apply_color_grade(img, rng)
        img = apply_vignette(img, rng)
        img = apply_film_grain(img, rng)
        tiers_applied.append("tier2")

    if tiers["tier3"] and clip_adversary is not None:
        mask = get_background_mask(img)
        img = clip_adversary.perturb(img, rng, mask=mask)
        tiers_applied.append("tier3")

    # PNG lossless intermédiaire — l'encodage JPEG final (qtables Apple) est géré
    # par optimize_image_bytes(), pas de double-compression.
    buf = io.BytesIO()
    img.save(buf, "PNG")
    out = optimize_image_bytes(buf.getvalue(), seed)
    tiers_applied.append("metadata")
    return out, tiers_applied


# ── Vidéo — probing ffmpeg (pas de ffprobe dans le bundle imageio-ffmpeg) ────────

def _probe(ffmpeg: str, path) -> dict:
    """Parse le stderr de `ffmpeg -i <path>` pour extraire durée/dimensions/audio."""
    proc = subprocess.run(
        [ffmpeg, "-i", str(path)], capture_output=True, text=True, timeout=30
    )
    stderr = proc.stderr
    info = {"duration": 0.0, "width": 0, "height": 0, "has_audio": False, "sample_rate": None}

    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", stderr)
    if m:
        hh, mm, ss = m.groups()
        info["duration"] = int(hh) * 3600 + int(mm) * 60 + float(ss)

    m = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", stderr)
    if m:
        info["width"], info["height"] = int(m.group(1)), int(m.group(2))

    m = re.search(r"Audio:.*?(\d+)\s*Hz", stderr)
    if m:
        info["has_audio"] = True
        info["sample_rate"] = int(m.group(1))
    elif re.search(r"Stream #\d+:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?:\s*Audio:", stderr):
        info["has_audio"] = True

    return info


# ── Tier 1/2 vidéo — chaîne -vf simple (light / medium, et fallback aggressive) ──

def _build_simple_vf(seed: int, level: str, w: int, h: int):
    rng = random.Random(seed)
    tiers = LEVEL_TIERS[level]
    parts: list[str] = []
    tiers_applied: list[str] = []

    if tiers["tier1"]:
        if rng.random() < 0.5:
            parts.append("hflip")
        angle = rng.uniform(0.3, 0.8) * (1 if rng.random() < 0.5 else -1)
        parts.append(f"rotate={math.radians(angle):.6f}:c=black")
        crop_pct = rng.uniform(1.0, 8.0) / 100.0
        cw = f"iw*{1 - crop_pct:.4f}"
        ch = f"ih*{1 - crop_pct:.4f}"
        cx = f"(iw-({cw}))*{rng.random():.4f}"
        cy = f"(ih-({ch}))*{rng.random():.4f}"
        parts.append(f"crop={cw}:{ch}:{cx}:{cy}")
        parts.append(f"scale={w}:{h}")
        parts.append("setsar=1")
        tiers_applied.append("tier1")

    if tiers["tier2"]:
        gamma = rng.uniform(0.95, 1.05)
        contrast = rng.uniform(0.97, 1.03)
        saturation = rng.uniform(0.95, 1.05)
        parts.append(f"eq=gamma={gamma:.3f}:contrast={contrast:.3f}:saturation={saturation:.3f}")
        noise_strength = rng.randint(4, 10)
        parts.append(f"noise=alls={noise_strength}:allf=t+u")
        parts.append(f"unsharp=5:5:{rng.uniform(0.2, 0.5):.2f}")
        parts.append(f"vignette=PI/{rng.uniform(4, 6):.2f}")
        tiers_applied.append("tier2")

    parts.append("format=yuv420p")
    return ",".join(parts), tiers_applied


# ── Tier 4 vidéo — filter_complex (aggressive) ──────────────────────────────────

def _build_aggressive_filter_complex(seed: int, w: int, h: int, duration: float,
                                      has_audio: bool, sample_rate: int):
    """Construit un filter_complex : Tier1+2 sur [0:v] → segments de vitesse
    (Tier4 vidéo) → [vout]. Si has_audio, segments audio assortis + pitch shift +
    watermark inaudible 18kHz → [aout]."""
    rng = random.Random(seed)
    tiers_applied: list[str] = []

    # Tier 1
    vf_parts: list[str] = []
    if rng.random() < 0.5:
        vf_parts.append("hflip")
    angle = rng.uniform(0.3, 0.8) * (1 if rng.random() < 0.5 else -1)
    vf_parts.append(f"rotate={math.radians(angle):.6f}:c=black")
    crop_pct = rng.uniform(1.0, 8.0) / 100.0
    cw = f"iw*{1 - crop_pct:.4f}"
    ch = f"ih*{1 - crop_pct:.4f}"
    cx = f"(iw-({cw}))*{rng.random():.4f}"
    cy = f"(ih-({ch}))*{rng.random():.4f}"
    vf_parts.append(f"crop={cw}:{ch}:{cx}:{cy}")
    vf_parts.append(f"scale={w}:{h}")
    vf_parts.append("setsar=1")
    tiers_applied.append("tier1")

    # Tier 2
    gamma = rng.uniform(0.95, 1.05)
    contrast = rng.uniform(0.97, 1.03)
    saturation = rng.uniform(0.95, 1.05)
    vf_parts.append(f"eq=gamma={gamma:.3f}:contrast={contrast:.3f}:saturation={saturation:.3f}")
    noise_strength = rng.randint(4, 10)
    vf_parts.append(f"noise=alls={noise_strength}:allf=t+u")
    vf_parts.append(f"unsharp=5:5:{rng.uniform(0.2, 0.5):.2f}")
    vf_parts.append(f"vignette=PI/{rng.uniform(4, 6):.2f}")
    vf_parts.append("format=yuv420p")
    tiers_applied.append("tier2")

    vbase_chain = ",".join(vf_parts)
    filter_parts = [f"[0:v]{vbase_chain}[vbase]"]

    # Tier 4 — segmentation vitesse (vidéo)
    speeds = [rng.uniform(0.97, 1.03) for _ in range(3)]
    if duration >= 1.5:
        bounds = [0.0, duration / 3, 2 * duration / 3, duration]
        seg_labels = []
        for i in range(3):
            start, end = bounds[i], bounds[i + 1]
            label = f"vseg{i}"
            filter_parts.append(
                f"[vbase]trim=start={start:.3f}:end={end:.3f},"
                f"setpts=(PTS-STARTPTS)/{speeds[i]:.4f}[{label}]"
            )
            seg_labels.append(f"[{label}]")
        filter_parts.append("".join(seg_labels) + "concat=n=3:v=1:a=0[vout]")
    else:
        filter_parts.append(f"[vbase]setpts=(PTS-STARTPTS)/{speeds[0]:.4f}[vout]")
    tiers_applied.append("tier4")

    extra_inputs: list[str] = []
    audio_map = None

    if has_audio:
        sr = sample_rate or 44100

        if duration >= 1.5:
            bounds = [0.0, duration / 3, 2 * duration / 3, duration]
            aseg_labels = []
            for i in range(3):
                start, end = bounds[i], bounds[i + 1]
                speed = max(0.5, min(2.0, speeds[i]))
                label = f"aseg{i}"
                filter_parts.append(
                    f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS,"
                    f"atempo={speed:.4f}[{label}]"
                )
                aseg_labels.append(f"[{label}]")
            filter_parts.append("".join(aseg_labels) + "concat=n=3:v=0:a=1[acat]")
        else:
            speed = max(0.5, min(2.0, speeds[0]))
            filter_parts.append(f"[0:a]atempo={speed:.4f}[acat]")

        # Pitch shift ±0.5-1.5 demi-tons via asetrate + atempo de correction
        semitones = rng.uniform(0.5, 1.5) * (1 if rng.random() < 0.5 else -1)
        ratio = 2 ** (semitones / 12.0)
        new_rate = max(8000, int(sr * ratio))
        atempo_correct = max(0.5, min(2.0, 1.0 / ratio))
        filter_parts.append(
            f"[acat]asetrate={new_rate},atempo={atempo_correct:.5f},aresample={sr}[apitch]"
        )

        # Watermark inaudible 18kHz, mixé à très faible volume
        watermark_dur = duration if duration > 0 else 10.0
        extra_inputs = [
            "-f", "lavfi", "-i",
            f"sine=frequency=18000:sample_rate={sr}:duration={watermark_dur:.3f}",
        ]
        filter_parts.append(f"[apitch][1:a]amix=inputs=2:duration=first:weights='1 0.02'[aout]")
        audio_map = "[aout]"

    filter_complex = ";".join(filter_parts)
    return filter_complex, extra_inputs, audio_map, tiers_applied


# ── Passe finale vidéo ────────────────────────────────────────────────────────

def spoof_video_bytes(data: bytes, seed: int, level: str, tmp_dir) -> tuple[bytes, list]:
    """Applique les tiers vidéo selon `level`, puis la passe métadonnées finale.

    Repli en cascade pour garantir la stabilité :
      Tier4 (filter_complex segmenté) → Tier1/2 simple (-vf) → bytes inchangés (metadata only)
    """
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        print(json.dumps({
            "type": "info",
            "msg": "ffmpeg introuvable — vidéo non modifiée (metadata uniquement). "
                   "pip install imageio-ffmpeg pour activer le traitement vidéo.",
        }), flush=True)
        return optimize_video_bytes(data, seed), ["metadata"]

    tiers = LEVEL_TIERS[level]
    tmp_dir_path = Path(tmp_dir)
    tmp_dir_path.mkdir(parents=True, exist_ok=True)
    in_path = tmp_dir_path / f"in_{seed}.mp4"
    out_path = tmp_dir_path / f"out_{seed}.mp4"
    in_path.write_bytes(data)

    try:
        info = _probe(ffmpeg, in_path)
        w, h = info["width"], info["height"]
        if w <= 0 or h <= 0:
            w, h = 1080, 1920
        w -= w % 2
        h -= h % 2
        duration = info["duration"] or 5.0
        has_audio = info["has_audio"]
        sample_rate = info.get("sample_rate") or 44100

        tiers_applied: list[str] = []
        cmd = None

        if tiers["tier4"]:
            try:
                filter_complex, extra_inputs, audio_map, t_applied = _build_aggressive_filter_complex(
                    seed, w, h, duration, has_audio, sample_rate
                )
                rng2 = random.Random(seed + 999_999)
                gop = rng2.randint(24, 60)
                crf = max(18, 23 + rng2.randint(-3, 3))
                preset = rng2.choice(["fast", "medium", "slow"])

                cmd = [ffmpeg, "-y", "-i", str(in_path)] + extra_inputs + [
                    "-filter_complex", filter_complex,
                    "-map", "[vout]",
                ]
                if audio_map:
                    cmd += ["-map", audio_map]
                cmd += [
                    "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-g", str(gop),
                    "-pix_fmt", "yuv420p",
                ]
                if has_audio:
                    cmd += ["-c:a", "aac", "-b:a", "128k"]
                cmd += [str(out_path)]

                result = subprocess.run(cmd, capture_output=True, timeout=300)
                if result.returncode != 0:
                    raise RuntimeError(result.stderr.decode(errors="ignore")[-500:])
                tiers_applied = t_applied
            except Exception as e:
                print(json.dumps({
                    "type": "info",
                    "msg": f"Tier 4 vidéo échoué ({str(e)[:200]}) — repli sur Tier 1+2",
                }), flush=True)
                cmd = None

        if cmd is None:
            vf, t_applied = _build_simple_vf(seed, level, w, h)
            cmd = [
                ffmpeg, "-y", "-i", str(in_path), "-vf", vf,
                "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
            ]
            if has_audio:
                cmd += ["-c:a", "aac", "-b:a", "128k"]
            else:
                cmd += ["-an"]
            cmd += [str(out_path)]

            result = subprocess.run(cmd, capture_output=True, timeout=300)
            if result.returncode != 0:
                raise RuntimeError(result.stderr.decode(errors="ignore")[-500:])
            tiers_applied = t_applied

        out_bytes = out_path.read_bytes()
        out_bytes = optimize_video_bytes(out_bytes, seed)
        tiers_applied.append("metadata")
        return out_bytes, tiers_applied
    finally:
        for p in (in_path, out_path):
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass


# ── Orchestration / CLI ──────────────────────────────────────────────────────────

def _make_seed(run_id: str, filename: str, variation: int) -> int:
    h = hashlib.sha256(f"{run_id}:{filename}:{variation}".encode()).hexdigest()
    return int(h[:8], 16) & 0x7FFFFFFF


async def run_spoofer(run_id: str, files_dir: str, level: str, variations: int,
                       output_dir: str | None = None) -> None:
    files_dir_path = Path(files_dir)
    output_dir_path = Path(output_dir) if output_dir else files_dir_path.parent / f"output_{run_id}"
    output_dir_path.mkdir(parents=True, exist_ok=True)

    all_files = sorted([p for p in files_dir_path.iterdir() if p.is_file()])
    image_files = [p for p in all_files if p.suffix.lower() in IMAGE_EXTS]
    video_files = [p for p in all_files if p.suffix.lower() in VIDEO_EXTS]

    if not image_files and not video_files:
        print(json.dumps({"type": "error", "message": "Aucun fichier image/vidéo trouvé"}), flush=True)
        return

    total_files = len(image_files) + len(video_files)
    total_variations = total_files * variations

    print(json.dumps({
        "type": "start", "run_id": run_id, "total_files": total_files,
        "total_variations": total_variations, "level": level,
    }), flush=True)

    tiers = LEVEL_TIERS[level]

    # ── Tier 3 : charger CLIP une seule fois (dégradation gracieuse) ──
    clip_adversary = None
    if tiers["tier3"] and image_files:
        try:
            clip_adversary = ClipAdversary()
            print(json.dumps({
                "type": "info",
                "msg": f"CLIP chargé (Tier 3 actif, device={clip_adversary.device})",
            }), flush=True)
            try:
                import rembg  # noqa: F401
            except ImportError:
                print(json.dumps({
                    "type": "info",
                    "msg": "rembg non installé — Tier 3 appliqué uniformément "
                           "(sans pondération sujet/fond). pip install rembg pour l'activer.",
                }), flush=True)
        except Exception as e:
            print(json.dumps({
                "type": "info",
                "msg": f"CLIP indisponible ({str(e)[:200]}) — Tier 3 ignoré, "
                       "niveau Agressif = Tier 1+2 pour les images",
            }), flush=True)
            clip_adversary = None

    counter = {"done": 0}
    progress_lock = asyncio.Lock()

    async def report_progress(filename: str, variation: int) -> None:
        async with progress_lock:
            counter["done"] += 1
            print(json.dumps({
                "type": "progress", "current": counter["done"], "total": total_variations,
                "file": filename, "variation": variation,
            }), flush=True)

    loop = asyncio.get_event_loop()

    # ── Images ──
    image_concurrency = 1 if (tiers["tier3"] and clip_adversary is not None) else 4
    img_sem = asyncio.Semaphore(image_concurrency)

    async def process_image(img_path: Path) -> None:
        for k in range(1, variations + 1):
            async with img_sem:
                seed = _make_seed(run_id, img_path.name, k)
                try:
                    data = img_path.read_bytes()
                    out_bytes, tiers_applied = await loop.run_in_executor(
                        None, spoof_image_bytes, data, seed, level, clip_adversary
                    )
                    out_name = f"{img_path.stem}_v{k}.jpg"
                    out_path = output_dir_path / out_name
                    out_path.write_bytes(out_bytes)
                    print(json.dumps({
                        "type": "variation_done", "file": img_path.name, "variation": k,
                        "output_path": str(out_path), "tiers_applied": tiers_applied,
                    }), flush=True)
                except Exception as e:
                    print(json.dumps({
                        "type": "error", "message": str(e)[:300], "file": img_path.name,
                    }), flush=True)
            await report_progress(img_path.name, k)

    # ── Vidéos ──
    video_sem = asyncio.Semaphore(2)

    async def process_video(vid_path: Path) -> None:
        for k in range(1, variations + 1):
            async with video_sem:
                seed = _make_seed(run_id, vid_path.name, k)
                tmp_dir = output_dir_path / f"_tmp_{vid_path.stem}_{k}"
                try:
                    data = vid_path.read_bytes()
                    out_bytes, tiers_applied = await loop.run_in_executor(
                        None, spoof_video_bytes, data, seed, level, str(tmp_dir)
                    )
                    out_name = f"{vid_path.stem}_v{k}.mp4"
                    out_path = output_dir_path / out_name
                    out_path.write_bytes(out_bytes)
                    print(json.dumps({
                        "type": "variation_done", "file": vid_path.name, "variation": k,
                        "output_path": str(out_path), "tiers_applied": tiers_applied,
                    }), flush=True)
                except Exception as e:
                    print(json.dumps({
                        "type": "error", "message": str(e)[:300], "file": vid_path.name,
                    }), flush=True)
                finally:
                    try:
                        import shutil
                        shutil.rmtree(tmp_dir, ignore_errors=True)
                    except Exception:
                        pass
            await report_progress(vid_path.name, k)

    tasks = [process_image(p) for p in image_files] + [process_video(p) for p in video_files]
    await asyncio.gather(*tasks)

    print(json.dumps({
        "type": "done", "run_id": run_id, "total_outputs": counter["done"],
        "finished_at": datetime.utcnow().isoformat(),
    }), flush=True)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Spoofer 2.0 — anti-détection Instagram (4 tiers)")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--files-dir", required=True)
    parser.add_argument("--level", choices=["light", "medium", "aggressive"], default="medium")
    parser.add_argument("--variations", type=int, default=5)
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()

    variations = max(1, min(20, args.variations))

    asyncio.run(run_spoofer(
        run_id=args.run_id,
        files_dir=args.files_dir,
        level=args.level,
        variations=variations,
        output_dir=args.output_dir,
    ))


if __name__ == "__main__":
    main()
