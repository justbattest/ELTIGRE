"""
Motion Concept Builder — Étape 1 du pipeline Motion Control complet.

Flow :
1. Téléchargement de la vidéo Instagram via yt-dlp
2. Extraction de 7 frames candidates (ffmpeg, timestamps 0–5s)
3. Scoring automatique via OpenCV (sharpness + exposition + face detection) — 0 coût API
4. Person swap : nano_banana_2 Higgsfield — frame + <<<element_id>>> → concept image
5. 4 × Seedream v4.5 img2img (parallèle) → 4 variantes d'outfit
6. Émission d'events JSON-lines vers stdout → webapp route les consomme et crée MotionConcept en DB

Events JSON stdout :
  {"type": "concept_step", "step": "download|frames|swap|outfits", "status": "started|done|error", ...}
  {"type": "concept_outfit", "index": 1-4, "image_url": "https://..."}
  {"type": "concept_done", "run_id": "...", "concept_image_url": "...", "outfit_urls": [...],
   "video_path": "...", "best_frame_t": 1.5, "element_id": "..."}
  {"type": "warn", "msg": "..."}
  {"type": "error", "step": "...", "message": "..."}

CLI :
  venv/bin/python -m pipeline.motion_concept_builder
      --run-id <id>
      --video-url <instagram_url>
      --element-id <higgsfield_element_id>
      --output-dir <path>
      [--swap-model nano_banana_2|soul_cinematic]
      [--concept-name "nom libre"]
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import cv2
import httpx
import numpy as np

from pipeline.generator import run_higgsfield_for_user
from pipeline.metadata_optimizer import _find_ffmpeg

# ─── Prompt person swap ────────────────────────────────────────────────────────

PERSON_SWAP_PROMPT = (
    "Same scene, same background, same environment, same lighting conditions, same camera angle, "
    "same framing, same composition, same color palette. "
    "Replace only the person in the image with the character. "
    "Keep every detail of the background, environment, and scene perfectly identical. "
    "The character should appear naturally in the exact same position and framing as the original person."
)

# Timestamps auxquels extraire les frames candidates (secondes)
FRAME_TIMESTAMPS = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _emit(event: dict) -> None:
    print(json.dumps(event), flush=True)


def _find_best_frame(frame_paths: list[str]) -> tuple[str, float]:
    """Retourne (chemin, timestamp) de la meilleure frame parmi les candidats.

    Critères (OpenCV, 0 coût API) :
    1. Sharpness : variance du Laplacien → image nette > image floue
    2. Exposition : luminosité moyenne → exclure frames trop sombres ou surexposées
    3. Face detection : Haar Cascade + ratio surface/image
       → fort bonus si visage bien visible (pas trop gros plan, pas trop loin)
    4. Fallback HOG : détecteur de personnes si aucun visage Haar détecté
    """
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    best_score = -1.0
    best_path = frame_paths[0]
    best_t = 0.0

    for path in frame_paths:
        img = cv2.imread(path)
        if img is None:
            continue
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape
        img_area = float(h_img * w_img)

        score = 0.0

        # 1. Sharpness (poids 30%)
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        score += min(lap_var / 300.0, 1.0) * 0.30

        # 2. Exposition (poids 20%)
        mean_brightness = float(np.mean(gray))
        if 50.0 < mean_brightness < 200.0:
            score += 0.20
        elif 30.0 < mean_brightness < 215.0:
            score += 0.10

        # 3. Face detection (poids 50%)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
        if len(faces) > 0:
            face_area = float(max(w_ * h_ for _, _, w_, h_ in faces))
            face_ratio = face_area / img_area
            if 0.01 < face_ratio < 0.45:   # bon plan : visage visible mais pas plan serré
                score += 0.50
            elif face_ratio >= 0.45:         # trop gros plan
                score += 0.15
            else:                            # trop petit (loin)
                score += 0.10
        else:
            # Fallback : HOG person detector (full body / half body)
            persons, _ = hog.detectMultiScale(img, winStride=(8, 8), padding=(4, 4), scale=1.05)
            if len(persons) > 0:
                score += 0.25

        if score > best_score:
            best_score = score
            best_path = path
            # Extraire le timestamp depuis le nom de fichier "frame_1.5s.jpg"
            try:
                stem = Path(path).stem  # "frame_1.5s"
                best_t = float(stem.replace("frame_", "").replace("s", ""))
            except ValueError:
                best_t = 0.0

    return best_path, best_t


class _YtdlpStderrLogger:
    """Redirige toutes les sorties yt-dlp vers stderr pour ne pas polluer stdout.

    Le subprocess Python a son stdout capturé par Node.js pour les events JSON.
    Sans ce logger, les lignes "[download] 7.8% of ..." apparaissent sur stdout
    et causent des JSON.parse errors dans le handler Node.js.
    """

    def debug(self, msg: str) -> None:
        if not msg.startswith("[debug]"):
            print(msg, file=sys.stderr, flush=True)

    def info(self, msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)

    def warning(self, msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)

    def error(self, msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)


async def download_video(video_url: str, output_dir: str) -> str:
    """Télécharge la vidéo Instagram via yt-dlp. Retourne le chemin local."""
    import yt_dlp  # import local pour ne pas crasher si absent

    output_template = str(Path(output_dir) / "concept_video.%(ext)s")
    ydl_opts = {
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,          # supprime la barre de progression
        "logger": _YtdlpStderrLogger(),  # redirige TOUT vers stderr
        "format": "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "noplaylist": True,
        "merge_output_format": "mp4",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([video_url])

    # Chercher le fichier téléchargé
    for ext in ("mp4", "mov", "webm", "mkv"):
        p = Path(output_dir) / f"concept_video.{ext}"
        if p.exists() and p.stat().st_size > 0:
            return str(p)

    raise FileNotFoundError(f"Vidéo téléchargée introuvable dans {output_dir}")


async def extract_frame_candidates(video_path: str, output_dir: str) -> list[str]:
    """Extrait les frames aux timestamps FRAME_TIMESTAMPS via ffmpeg."""
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable — install imageio-ffmpeg ou ffmpeg système")

    frames: list[str] = []
    for t in FRAME_TIMESTAMPS:
        frame_path = str(Path(output_dir) / f"frame_{t}s.jpg")
        proc = await asyncio.create_subprocess_exec(
            ffmpeg,
            "-ss", str(t),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            frame_path,
            "-y",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        p = Path(frame_path)
        if p.exists() and p.stat().st_size > 1024:  # au moins 1 KB pour s'assurer d'avoir un vrai JPEG
            frames.append(frame_path)

    return frames


async def download_image_to_file(url: str, dest_path: str) -> None:
    """Télécharge une URL image vers un fichier local."""
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        Path(dest_path).write_bytes(resp.content)


# ─── Génération outfits (réplique allégée de motion_control.generate_outfit_image) ──

SEEDREAM_OUTFIT_PROMPT = (
    "Using the reference image provided, give this person a completely new outfit. "
    "The outfit must be sexy and stylish — always show maximum skin: deep neckline, "
    "midriff, short hemline, or form-fitting silhouette. "
    "Style can be anything: sporty, casual streetwear, trendy, party, chic — "
    "choose freely to make this generation unique. "
    "Preserve strictly identical: the person's face, facial features, skin tone, hair, "
    "body shape, body proportions, exact pose, hand and arm positions, leg position, "
    "background scene, background details, lighting direction, shadows, "
    "camera angle, framing, and photo composition. "
    "This is an outfit change only — nothing else should change in the image."
)


async def _generate_outfit(
    user_token: str,
    concept_image_local: str,
    index: int,
    refresh_token: str = "",
    timeout: int = 600,
) -> dict:
    """Génère une variante d'outfit via Seedream v4.5 img2img."""
    cmd = [
        "higgsfield", "generate", "create", "seedream_v4_5",
        "--image", concept_image_local,
        "--prompt", SEEDREAM_OUTFIT_PROMPT,
        "--aspect_ratio", "9:16",
        "--quality", "high",
        "--wait",
        "--wait-timeout", "10m",
    ]
    try:
        result_url = await run_higgsfield_for_user(
            user_token, cmd, timeout=timeout, refresh_token=refresh_token
        )
        if result_url:
            return {"index": index, "url": result_url.strip()}
        return {"index": index, "url": None, "error": "EMPTY_RESULT"}
    except asyncio.TimeoutError:
        return {"index": index, "url": None, "error": "TIMEOUT_SEEDREAM"}
    except Exception as e:
        return {"index": index, "url": None, "error": str(e)[:300]}


# ─── Orchestration principale ─────────────────────────────────────────────────

async def run_concept_builder(
    run_id: str,
    video_url: str,
    output_dir: str,
    swap_model: str = "soul_cinematic",
    soul_id: str | None = None,
    element_id: str | None = None,
    concept_name: str | None = None,
) -> None:
    """Orchestre la création complète d'un Motion Concept.

    swap_model='soul_cinematic' (défaut) : utilise soul_id (--soul-id).
    swap_model='nano_banana_2'           : utilise element_id (<<<element_id>>> dans prompt).
    """

    user_token = os.environ.get("HIGGSFIELD_TOKEN")
    if not user_token:
        _emit({"type": "error", "step": "init", "message": "HIGGSFIELD_TOKEN manquant"})
        sys.exit(1)
    refresh_token = os.environ.get("HIGGSFIELD_REFRESH_TOKEN", "")

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # ── Étape 1 : Téléchargement vidéo ──────────────────────────────────────
    _emit({"type": "concept_step", "step": "download", "status": "started"})
    try:
        video_path = await download_video(video_url, str(out))
        _emit({"type": "concept_step", "step": "download", "status": "done", "video_path": video_path})
    except Exception as exc:
        _emit({"type": "error", "step": "download", "message": str(exc)[:400]})
        sys.exit(1)

    # ── Étape 2 : Extraction + scoring des frames ────────────────────────────
    _emit({"type": "concept_step", "step": "frames", "status": "started"})
    try:
        frame_candidates = await extract_frame_candidates(video_path, str(out))
        if not frame_candidates:
            raise RuntimeError("Aucune frame extraite (vidéo trop courte ou ffmpeg KO)")
        best_frame, best_t = _find_best_frame(frame_candidates)
        _emit({
            "type": "concept_step", "step": "frames", "status": "done",
            "chosen_frame": best_frame, "chosen_t": best_t,
            "total_candidates": len(frame_candidates),
        })
    except Exception as exc:
        _emit({"type": "error", "step": "frames", "message": str(exc)[:400]})
        sys.exit(1)

    # ── Étape 3 : Person swap ────────────────────────────────────────────────
    _emit({"type": "concept_step", "step": "swap", "status": "started"})
    try:
        if swap_model == "soul_cinematic":
            # soul_id passé en argument ou fallback sur env var
            effective_soul_id = soul_id or os.environ.get("HIGGSFIELD_SOUL_ID", "")
            if not effective_soul_id:
                raise ValueError(
                    "soul_id manquant pour soul_cinematic — passe --soul-id ou HIGGSFIELD_SOUL_ID"
                )
            cmd = [
                "higgsfield", "generate", "create", "soul_cinematic",
                "--soul-id", effective_soul_id,
                "--image", best_frame,
                "--prompt", (
                    "Same background, same scene, same lighting, same camera angle. "
                    "Character in same position and framing as the original person."
                ),
                "--quality", "2k",
                "--wait", "--wait-timeout", "10m",
            ]
        else:  # nano_banana_2
            if not element_id:
                raise ValueError("element_id manquant pour nano_banana_2 swap")
            cmd = [
                "higgsfield", "generate", "create", "nano_banana_2",
                "--image", best_frame,
                "--prompt", f"<<<{element_id}>>> {PERSON_SWAP_PROMPT}",
                "--resolution", "2k",
                "--wait", "--wait-timeout", "10m",
            ]

        concept_image_url = await run_higgsfield_for_user(
            user_token, cmd, timeout=600, refresh_token=refresh_token
        )
        if not concept_image_url:
            raise RuntimeError("Person swap : résultat vide (Higgsfield n'a pas retourné d'URL)")

        concept_image_url = concept_image_url.strip()
        _emit({"type": "concept_step", "step": "swap", "status": "done", "url": concept_image_url})

    except Exception as exc:
        _emit({"type": "error", "step": "swap", "message": str(exc)[:400]})
        sys.exit(1)

    # ── Étape 4 : 4 × outfit Seedream (parallèle) ────────────────────────────
    _emit({"type": "concept_step", "step": "outfits", "status": "started"})

    # Télécharger le concept image localement (Seedream --image accepte un chemin local)
    concept_image_local = str(out / "concept_image.jpg")
    try:
        await download_image_to_file(concept_image_url, concept_image_local)
    except Exception as exc:
        _emit({"type": "warn", "msg": f"Téléchargement concept image échoué: {exc!r} — utilisation URL directe"})
        concept_image_local = concept_image_url  # fallback: passer l'URL directement

    outfit_tasks = [
        _generate_outfit(user_token, concept_image_local, i + 1, refresh_token=refresh_token)
        for i in range(4)
    ]
    outfit_results = await asyncio.gather(*outfit_tasks, return_exceptions=True)

    outfit_urls: list[str] = []
    for result in outfit_results:
        if isinstance(result, Exception):
            _emit({"type": "warn", "msg": f"Outfit généré en fallback (exception): {result!r}"})
            outfit_urls.append(concept_image_url)  # fallback sur l'image de swap
        elif not isinstance(result, dict) or not result.get("url"):
            err = (result or {}).get("error", "UNKNOWN") if isinstance(result, dict) else "EXCEPTION"
            _emit({"type": "warn", "msg": f"Outfit {getattr(result, 'get', lambda k, d=None: d)('index', '?')} KO ({err}) — fallback"})
            outfit_urls.append(concept_image_url)
        else:
            url = result["url"]
            outfit_urls.append(url)
            _emit({"type": "concept_outfit", "index": result["index"], "image_url": url})

    _emit({"type": "concept_step", "step": "outfits", "status": "done"})

    # ── Fin ──────────────────────────────────────────────────────────────────
    _emit({
        "type": "concept_done",
        "run_id": run_id,
        "concept_image_url": concept_image_url,
        "outfit_urls": outfit_urls,
        "video_path": video_path,
        "best_frame_t": best_t,
        "element_id": element_id or "",
        "concept_name": concept_name,
    })


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Motion Concept Builder — download + frame + swap + outfits"
    )
    parser.add_argument("--run-id", required=True, help="Identifiant unique du run")
    parser.add_argument("--video-url", required=True, help="URL du reel Instagram à copier")
    parser.add_argument("--output-dir", required=True, help="Répertoire de sortie local")
    parser.add_argument(
        "--swap-model",
        default="soul_cinematic",
        choices=["nano_banana_2", "soul_cinematic"],
        help="Modèle Higgsfield pour le person swap (défaut: soul_cinematic)",
    )
    parser.add_argument(
        "--soul-id",
        default=None,
        help="Soul character ID pour soul_cinematic (ex: higgsfield soul-id list)",
    )
    parser.add_argument(
        "--element-id",
        default=None,
        help="Reference element ID pour nano_banana_2 (<<<element_id>>> dans le prompt)",
    )
    parser.add_argument("--concept-name", default=None, help="Nom libre pour ce concept")
    args = parser.parse_args()

    if not os.environ.get("HIGGSFIELD_TOKEN"):
        print(json.dumps({"type": "error", "step": "init", "message": "HIGGSFIELD_TOKEN manquant"}), flush=True)
        sys.exit(1)

    asyncio.run(run_concept_builder(
        run_id=args.run_id,
        video_url=args.video_url,
        output_dir=args.output_dir,
        swap_model=args.swap_model,
        soul_id=args.soul_id,
        element_id=args.element_id,
        concept_name=args.concept_name,
    ))


if __name__ == "__main__":
    main()
