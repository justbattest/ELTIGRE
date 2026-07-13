#!/usr/bin/env python3
"""
modelark.py — Client BytePlus ModelArk (ByteDance Ark) + feature "Body Morph" i2i.

Stage B du pipeline Modelify : édite les photos de référence d'une modèle via Seedream 4.5 :
  - body_morph : version "bombshell" (poitrine énorme + hanches larges, taille fine verrouillée),
                 identité/tenue/scène/lumière 100% préservées (i2i)
  - back_view  : vue de dos

Spec de référence : note vault "BRIEF AGENT — Pipeline Body Morph i2i" (prouvé manuellement 2026-06-25,
12/17 OK). Endpoint POST {ARK_BASE_URL}/images/generations, modèle seedream-4-5-251128.

Env : ARK_API_KEY, ARK_BASE_URL, MODELIFY_IMAGE_MODEL.
⚠️ Les modèles Seedream doivent être ACTIVÉS dans la Ark Console (sinon ModelNotOpen).
"""
from __future__ import annotations

import base64
import mimetypes
import os
from pathlib import Path
from typing import List, Optional, Tuple, Union

import requests

from pipeline import wavespeed

ARK_BASE_URL = os.environ.get("ARK_BASE_URL", "https://ark.ap-southeast.bytepluses.com/api/v3").rstrip("/")
ARK_API_KEY = os.environ.get("ARK_API_KEY", "")
IMAGE_MODEL = os.environ.get("MODELIFY_IMAGE_MODEL", "seedream-4-5-251128")
VIDEO_MODEL = os.environ.get("MODELIFY_VIDEO_MODEL", "dreamina-seedance-2-0-260128")

# Seedream 4.5 exige une sortie >= 3 686 400 px. On vise ~4.0 MP (2K suffit pour IG/Fanvue).
MIN_PIXELS = 3_686_400
TARGET_PIXELS = 4_000_000

# ── Leviers du prompt "Body Morph" (exposés en sliders UI) ─────────────────────
# index 0 = le plus fort ; les suivants = plus doux (utilisés en escalade anti-modération §5)
BUST_LEVELS = [
    "enormous, extremely large and heavy breasts, massive deep cleavage overflowing and tightly straining her top",
    "huge full breasts with deep cleavage straining her top",
    "very large full breasts with cleavage",
    "noticeably larger fuller breasts",
]
HIPS_LEVELS = {
    "wide": "wide curvy hips and round full glutes",
    "moderate": "moderately wider hips (not overly broad)",
    "subtle": "slightly fuller hips",
}


class ArkError(Exception):
    pass


class ModelNotActivated(ArkError):
    pass


class ContentRefused(ArkError):
    pass


def _headers() -> dict:
    return {"Authorization": f"Bearer {ARK_API_KEY}", "Content-Type": "application/json"}


def _to_data_url(path: Union[str, Path]) -> str:
    p = Path(path)
    mime = mimetypes.guess_type(str(p))[0] or "image/png"
    b64 = base64.b64encode(p.read_bytes()).decode()
    return f"data:{mime};base64,{b64}"


def _as_input(image: str) -> str:
    """Chemin local / data: url / http url → champ image valide pour l'API."""
    if image.startswith("http") or image.startswith("data:"):
        return image
    return _to_data_url(image)


def compute_size(src_path: Union[str, Path], target_px: int = TARGET_PIXELS) -> Tuple[int, int]:
    """
    Calcule (W, H) qui garde le ratio de la source, vise ~target_px, dimensions multiples de 16,
    et garantit >= MIN_PIXELS (sinon Seedream renvoie HTTP 400 InvalidParameter).
    Le format string ('WxH' ModelArk vs 'W*H' WaveSpeed) est appliqué par _dispatch.
    """
    from PIL import Image as PILImage

    with PILImage.open(src_path) as im:
        w, h = im.size
    r = (w / h) if h else 1.0
    H = (target_px / r) ** 0.5
    W = r * H
    W = max(16, (round(W) // 16) * 16)
    H = max(16, (round(H) // 16) * 16)
    # garde-fou : remonter par paliers de 16 si on est sous le minimum
    while W * H < MIN_PIXELS:
        W += 16
        H += 16
    return W, H


def _dispatch(route: str, prompt: str, image, w: int, h: int, seed) -> bytes:
    """Aiguille la génération vers le moteur choisi. route='wavespeed' (défaut, sans modération) ou 'modelark'."""
    if route == "modelark":
        return generate_image(prompt, image, seed=seed, size=f"{w}x{h}")
    return wavespeed.edit(prompt, image, w, h)


def build_body_morph_prompt(bust_idx: int = 0, hips_key: str = "wide", keep_framing: bool = False) -> str:
    bust = BUST_LEVELS[max(0, min(bust_idx, len(BUST_LEVELS) - 1))]
    hips = HIPS_LEVELS.get(hips_key, HIPS_LEVELS["wide"])
    framing = " Keep the exact same framing, crop and outfit as the original, do not zoom out." if keep_framing else ""
    return (
        "Same young woman, keep her face, facial features, skin tone, freckles, hair, jewelry, "
        "her exact outfit, pose, scene and background, lighting and iPhone photo quality 100% identical. "
        f"Reshape her body into a bombshell hourglass figure: give her {bust}, together with {hips}, "
        "while keeping the exact same tiny narrow slim waist for a dramatic contrast. "
        "Keep the proportions believable and photorealistic, natural skin and realistic anatomy, "
        f"seamless edit, no distortion of the face, hands or background.{framing}"
    )


# Back view (§8 du brief) — intensité du fessier ; index 0 = le plus fort (escalade vers + doux en cas de blocage)
BUTT_LEVELS = [
    "a huge round bubble butt",
    "a big round toned lifted butt",
    "a round toned lifted butt",
]


def build_back_view_prompt(butt_idx: int = 1, keep_dress: bool = False) -> str:
    butt = BUTT_LEVELS[max(0, min(butt_idx, len(BUTT_LEVELS) - 1))]
    dress = " Keep it as a dress covering the buttocks." if keep_dress else ""
    return (
        "Same young woman in the same outfit, same scene, same lighting and iPhone photo quality. "
        "Show her standing and viewed from behind, three-quarter back view, glancing back over her "
        f"shoulder so her face stays recognizable. She has an athletic fit-girl figure with {butt} "
        "filling her bottoms, curvy wide hips and the same slim waist. Keep her face, hair, skin tone "
        "and freckles identical to the reference. Tasteful, photorealistic, natural realistic anatomy, "
        f"fully clothed, seamless edit, no distortion of the face, hands or background.{dress}"
    )


def generate_image(
    prompt: str,
    image: Optional[Union[str, List[str]]] = None,
    *,
    seed: Optional[int] = None,
    size: str = "2K",
    model: Optional[str] = None,
) -> bytes:
    """images/generations. `image` string=i2i, list=multi-référence (<=10). Retourne les bytes."""
    if not ARK_API_KEY:
        raise ArkError("ARK_API_KEY manquant dans l'environnement")

    body: dict = {
        "model": model or IMAGE_MODEL,
        "prompt": prompt,
        "size": size,
        "sequential_image_generation": "disabled",
        "response_format": "b64_json",
        "watermark": False,
        "stream": False,
    }
    if image is not None:
        body["image"] = [_as_input(i) for i in image] if isinstance(image, list) else _as_input(image)
    if seed is not None:
        body["seed"] = seed

    r = requests.post(f"{ARK_BASE_URL}/images/generations", headers=_headers(), json=body, timeout=300)
    if r.status_code >= 400:
        try:
            err = (r.json().get("error") or {})
        except Exception:  # noqa: BLE001
            err = {}
        code = str(err.get("code", ""))
        msg = err.get("message") or r.text[:200]
        if code == "ModelNotOpen":
            raise ModelNotActivated(f"Modèle '{body['model']}' non activé dans la Ark Console — {msg}")
        if "ensitive" in code or "ensitive" in str(msg):
            raise ContentRefused(f"{code}: {msg}")
        raise ArkError(f"{r.status_code} {code}: {msg}")

    data = r.json().get("data") or []
    if not data:
        raise ArkError("réponse sans image (refus de modération probable)")
    item = data[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if item.get("url"):
        return requests.get(item["url"], timeout=180).content
    raise ArkError("réponse sans b64_json ni url")


def _build_ref_image(src_path: str, anchor_path: Optional[str]) -> Union[str, List[str]]:
    """Image source + (optionnel) ancre d'identité en multi-référence pour renforcer la constance."""
    refs = [_as_input(src_path)]
    if anchor_path:
        refs.append(_as_input(anchor_path))
    return refs if len(refs) > 1 else refs[0]


def body_morph(
    src_path: str,
    *,
    bust_idx: int = 0,
    hips_key: str = "wide",
    keep_framing: bool = False,
    seed: Optional[int] = None,
    anchor_path: Optional[str] = None,
    route: str = "wavespeed",
    target_px: int = TARGET_PIXELS,
) -> Tuple[bytes, str]:
    """
    Édition "bombshell". route='wavespeed' (défaut, sans modération) ou 'modelark'.
    Sur ModelArk : escalade anti-modération (§5) vers un phrasing plus doux si bloqué (ContentRefused),
    jusqu'à BUST_LEVELS[-1], sinon lève ContentRefused (→ needs_review). Sur WaveSpeed : pas de blocage.
    Retourne (bytes, status) avec status ∈ {'ok','retried'}.
    """
    w, h = compute_size(src_path, target_px)
    image = _build_ref_image(src_path, anchor_path)
    last_exc: Optional[Exception] = None
    for idx in range(max(0, bust_idx), len(BUST_LEVELS)):
        prompt = build_body_morph_prompt(idx, hips_key, keep_framing)
        try:
            data = _dispatch(route, prompt, image, w, h, seed)
            return data, ("ok" if idx == bust_idx else "retried")
        except ContentRefused as exc:
            last_exc = exc
            continue
    raise ContentRefused(f"needs_review (toutes les intensités bloquées) — {last_exc}")


def back_view(
    src_path: str,
    *,
    butt_idx: int = 1,
    keep_dress: bool = False,
    seed: Optional[int] = None,
    anchor_path: Optional[str] = None,
    route: str = "wavespeed",
    target_px: int = TARGET_PIXELS,
) -> Tuple[bytes, str]:
    """
    Vue de dos "fit girl" (§8). route='wavespeed' (défaut, sans modération) ou 'modelark'.
    ⚠️ Sur ModelArk SEULEMENT : la vue de dos est très sensible au filtre — la source doit avoir un bas
    COUVERT (legging/jean/short), sinon bloquée → escalade puis ContentRefused (needs_review).
    Sur WaveSpeed : la culotte/le maillot passent (vérifié 2026-06-25).
    Retourne (bytes, status).
    """
    w, h = compute_size(src_path, target_px)
    image = _build_ref_image(src_path, anchor_path)
    last_exc: Optional[Exception] = None
    for idx in range(max(0, butt_idx), len(BUTT_LEVELS)):
        prompt = build_back_view_prompt(idx, keep_dress)
        try:
            data = _dispatch(route, prompt, image, w, h, seed)
            return data, ("ok" if idx == butt_idx else "retried")
        except ContentRefused as exc:
            last_exc = exc
            continue
    raise ContentRefused(f"needs_review (back view bloqué — source probablement non couverte) — {last_exc}")
