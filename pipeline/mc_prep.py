"""
MC Prep — Motion Control Folder Preparation Pipeline.

Prépare un dossier Drive complet (vidéo + frame sélectionnée + modèle swappé + N variations)
pour que l'utilisateur puisse faire du Kling Motion Control manuellement.

Deux sous-commandes :

1. extract  — Télécharge la vidéo + extrait N frames candidates → JSON stdout
   python -m pipeline.mc_prep extract
       --video-url URL
       --output-dir DIR
       [--num-frames 4]

2. generate — Swap modèle (Nano Banana Pro) + variations Seedream + upload Drive → events JSON-lines stdout
   python -m pipeline.mc_prep generate
       --run-id ID
       --frame-path PATH
       --model-photo-path PATH
       --num-variations N
       --output-dir DIR
       --character-name NAME
       [--video-path PATH]   # chemin local de la vidéo à inclure dans le dossier Drive

Events stdout (sous-commande generate) :
  {"type": "step", "step": "swap",    "status": "started"}
  {"type": "step", "step": "swap",    "status": "done",    "url": "CDN_URL"}
  {"type": "variation", "index": 1,   "total": N,          "url": "CDN_URL"}
  {"type": "step", "step": "upload",  "status": "started"}
  {"type": "done",    "drive_url": "https://drive.google.com/drive/folders/..."}
  {"type": "error",   "msg": "..."}
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import date
from pathlib import Path

import httpx

from pipeline.generator import run_higgsfield_for_user
from pipeline.hf_token import refresh_hf_access_token, is_session_expired
from pipeline.metadata_optimizer import _find_ffmpeg


# ─── Prompts ──────────────────────────────────────────────────────────────────

# Swap modèle — stratégie "face transplant"
# Approche plus chirurgicale que "person swap" : on demande uniquement le remplacement
# du visage et des cheveux, pas de la personne entière. Ça évite que le modèle régénère
# une nouvelle personne IA.
# Image 1 (frame_path)       = scène de base (pose, décor, tenue, lumière)
# Image 2 (model_photo_path) = visage/cheveux de référence UNIQUEMENT
SWAP_PROMPT = (
    "Face transplant. "
    "The first image is the SCENE BASE: preserve everything from it — "
    "the background, environment, all other people, "
    "the exact pose and body position, the action being performed, "
    "the clothing and outfit worn by the person in this first image, "
    "the lighting, shadows, camera angle, and full composition. "
    "The second image is the FACE REFERENCE ONLY: extract the face, hair color, "
    "hairstyle, and skin tone from this second image and apply them to the person "
    "in the first image. The transplanted face must fit naturally onto the existing "
    "body, pose, and clothing of the first image. "
    "Do NOT use the second image for anything else — no outfit, no body shape, "
    "no background, no environment. "
    "Result = first image scene with only the face and hair replaced by those "
    "from the second image. Real photo quality, photorealistic, seamless."
)

# Prompt alternatif — approche "Nina en sujet principal"
# Utilisé dans la tentative 3 où on inverse l'ordre des images :
# Image 1 = photo Nina (identité principale)
# Image 2 = frame (référence scène/pose)
SWAP_PROMPT_ALT = (
    "Identity-first scene placement. "
    "The first image shows the PERSON whose exact appearance must be fully preserved: "
    "keep her real face, facial features, hair, skin tone, and physical appearance exactly. "
    "Place this person into the SCENE from the second image: "
    "reproduce the same background, environment, all other people present, "
    "the same camera angle, framing, and lighting from the second image. "
    "The person must perform the exact same action and be in the exact same body pose "
    "as the person originally in the second image. "
    "Dress her in the same outfit as the person in the second image. "
    "The first image person's face and identity must be recognizable and realistic — "
    "not AI-generated, not a different person. "
    "Photorealistic, real photo quality, seamless."
)

# Variations d'outfit : Seedream 4.5 img2img (pas d'element_id — on travaille sur l'image déjà swappée)
OUTFIT_PROMPT = (
    "Outfit change only. Keep absolutely identical and unchanged: "
    "the person's face, facial features, skin tone, hair color, hairstyle, body shape, "
    "exact pose, hand positions, arm positions, leg position, "
    "background scene, environment, all objects, "
    "lighting direction, shadows, camera angle, framing, and photo composition. "
    "Change ONLY the clothing to a brand new ultra-sexy outfit: "
    "always include a very deep neckline showing maximum décolleté, "
    "form-fitting silhouette or very short hemline, show as much skin as possible. "
    "Style must match the scene's ambiance (sporty, party, casual chic, beach, etc.) "
    "but always provocative, stylish, and high-fashion. "
    "Photorealistic editorial fashion photography."
)

# Timestamps (secondes) pour l'extraction des frames
FRAME_TIMESTAMPS = [0.5, 1.5, 3.0, 5.5]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _emit(event: dict) -> None:
    print(json.dumps(event), flush=True)


async def _heartbeat_loop(interval: int = 20) -> None:
    """Émet un heartbeat périodique pour garder la connexion SSE active (évite le timeout idle)."""
    while True:
        await asyncio.sleep(interval)
        _emit({"type": "heartbeat"})


class _YtdlpStderrLogger:
    """Redirige toutes les sorties yt-dlp vers stderr pour ne pas polluer stdout."""
    def debug(self, msg: str) -> None:
        if not msg.startswith("[debug]"):
            print(msg, file=sys.stderr, flush=True)
    def info(self, msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)
    def warning(self, msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)
    def error(self, msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)


async def _download_video(video_url: str, output_dir: str) -> str:
    """Télécharge la vidéo via yt-dlp. Retourne le chemin local."""
    import yt_dlp  # import local — pas de crash si absent au démarrage

    output_template = str(Path(output_dir) / "mc_video.%(ext)s")
    ydl_opts = {
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _YtdlpStderrLogger(),
        "format": "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "noplaylist": True,
        "merge_output_format": "mp4",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([video_url])

    for ext in ("mp4", "mov", "webm", "mkv"):
        p = Path(output_dir) / f"mc_video.{ext}"
        if p.exists() and p.stat().st_size > 0:
            return str(p)

    raise FileNotFoundError(f"Vidéo introuvable dans {output_dir} après download")


async def _extract_frames(video_path: str, output_dir: str, num_frames: int) -> list[dict]:
    """Extrait num_frames frames via ffmpeg aux timestamps FRAME_TIMESTAMPS.
    Retourne une liste de dicts {index, timestamp, path}.
    """
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable — installer imageio-ffmpeg ou ffmpeg système")

    timestamps = FRAME_TIMESTAMPS[:num_frames]
    frames: list[dict] = []

    for i, t in enumerate(timestamps):
        frame_path = str(Path(output_dir) / f"frame_{i}.jpg")
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
        if p.exists() and p.stat().st_size > 1024:
            frames.append({"index": i, "timestamp": t, "path": frame_path})

    return frames


async def _download_url_to_file(url: str, dest_path: str) -> None:
    """Télécharge une URL vers un fichier local."""
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        Path(dest_path).write_bytes(resp.content)


async def _generate_outfit(
    user_token: str,
    swapped_image_path: str,
    index: int,
    total: int,
    refresh_token: str = "",
    timeout: int = 600,
) -> dict:
    """Génère une variation d'outfit via Seedream 4.5 img2img."""
    cmd = [
        "higgsfield", "generate", "create", "seedream_v4_5",
        "--image", swapped_image_path,
        "--prompt", OUTFIT_PROMPT,
        "--aspect_ratio", "9:16",
        "--quality", "high",
        "--wait", "--wait-timeout", "10m",
    ]
    try:
        result_url = await run_higgsfield_for_user(
            user_token, cmd, timeout=timeout, refresh_token=refresh_token
        )
        return {"index": index, "total": total, "url": result_url.strip() if result_url else None}
    except asyncio.TimeoutError:
        return {"index": index, "total": total, "url": None, "error": "TIMEOUT"}
    except Exception as e:
        return {"index": index, "total": total, "url": None, "error": str(e)[:300]}


# ─── Sub-commande : extract ───────────────────────────────────────────────────

async def cmd_extract(video_url: str, output_dir: str, num_frames: int) -> None:
    """Télécharge la vidéo et extrait les frames. Écrit le résultat JSON sur stdout."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    try:
        video_path = await _download_video(video_url, str(out))
    except Exception as exc:
        print(json.dumps({"error": f"Download failed: {exc!s}"}), flush=True)
        sys.exit(1)

    try:
        frames = await _extract_frames(video_path, str(out), num_frames)
    except Exception as exc:
        print(json.dumps({"error": f"Frame extraction failed: {exc!s}"}), flush=True)
        sys.exit(1)

    if not frames:
        print(json.dumps({"error": "No frames extracted — video too short or ffmpeg error"}), flush=True)
        sys.exit(1)

    # Résultat final sur stdout (une seule ligne JSON)
    print(json.dumps({
        "video_path": video_path,
        "frames": frames,
    }), flush=True)


# ─── Sub-commande : generate ─────────────────────────────────────────────────

async def cmd_generate(
    run_id: str,
    frame_path: str,
    model_photo_path: str,
    num_variations: int,
    output_dir: str,
    character_name: str,
    video_path: str | None,
) -> None:
    """Orchestre : swap → variations → upload Drive."""

    user_token = os.environ.get("HIGGSFIELD_TOKEN", "")
    if not user_token:
        _emit({"type": "error", "msg": "HIGGSFIELD_TOKEN manquant"})
        sys.exit(1)
    refresh_token = os.environ.get("HIGGSFIELD_REFRESH_TOKEN", "")

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Heartbeat toutes les 20s pour éviter le timeout SSE (Railway coupe les connexions idle)
    heartbeat_task = asyncio.create_task(_heartbeat_loop(20))

    # ── Étape 1 : Person swap (nano_banana_2 dual --image) ───────────────────
    # Modèle unique : nano_banana_2 avec deux --image (pas de nano_banana_pro, pas de fallback).
    # Approche identity-first : photo modèle en 1er (sujet principal),
    # frame en 2ème (référence scène/pose). Le modèle traite l'image 1 comme base,
    # ce qui force la préservation de l'identité réelle du modèle.
    _emit({"type": "step", "step": "swap", "status": "started"})

    swapped_url: str | None = None

    cmd_swap = [
        "higgsfield", "generate", "create", "nano_banana_2",
        "--image", model_photo_path,   # image 1 = modèle référence (identité principale)
        "--image", frame_path,         # image 2 = frame (scène / pose / décor)
        "--prompt", SWAP_PROMPT_ALT,
        "--resolution", "2k",
        "--wait", "--wait-timeout", "12m",
    ]

    try:
        result = await run_higgsfield_for_user(
            user_token, cmd_swap, timeout=720, refresh_token=refresh_token
        )
        if result:
            swapped_url = result.strip()
        else:
            _emit({"type": "error", "msg": "Swap nano_banana_2 : résultat vide"})
            sys.exit(1)
    except Exception as exc:
        _emit({"type": "error", "msg": f"Swap failed: {str(exc)[:400]}"})
        sys.exit(1)

    _emit({"type": "step", "step": "swap", "status": "done", "url": swapped_url})

    # Télécharger l'image swappée localement (pour les variations Seedream)
    if swapped_url:
        swapped_local = str(out / "swap_model.jpg")
        try:
            await _download_url_to_file(swapped_url, swapped_local)
        except Exception as exc:
            _emit({"type": "warn", "msg": f"Download swap image failed: {exc!r} — using URL directly"})
            swapped_local = swapped_url  # fallback : Higgsfield accepte les URLs
    else:
        # Pas de swap : on utilise la frame originale comme base des variations
        swapped_local = frame_path

    # ── Étape 2 : N × Seedream outfit variations (parallèle) ─────────────────
    _emit({"type": "step", "step": "variations", "status": "started"})

    outfit_tasks = [
        _generate_outfit(user_token, swapped_local, i + 1, num_variations, refresh_token=refresh_token)
        for i in range(num_variations)
    ]
    outfit_results = await asyncio.gather(*outfit_tasks, return_exceptions=True)

    variation_urls: list[str] = []
    fallback_url = swapped_url or frame_path  # frame locale si pas de swap
    for result in outfit_results:
        if isinstance(result, Exception):
            _emit({"type": "warn", "msg": f"Variation exception: {result!r}"})
            if swapped_url:
                variation_urls.append(swapped_url)
        elif not isinstance(result, dict) or not result.get("url"):
            err = result.get("error", "UNKNOWN") if isinstance(result, dict) else "EXCEPTION"
            _emit({"type": "warn", "msg": f"Variation KO ({err}) — ignorée"})
            # Ne pas ajouter de fallback silencieux — la liste sera juste plus courte
        else:
            url = result["url"]
            variation_urls.append(url)
            _emit({
                "type": "variation",
                "index": result["index"],
                "total": result["total"],
                "url": url,
            })

    _emit({"type": "step", "step": "variations", "status": "done"})

    # ── Étape 3 : Upload Drive ─────────────────────────────────────────────────
    drive_url = await _upload_to_drive(
        run_id=run_id,
        character_name=character_name,
        frame_path=frame_path,
        model_photo_path=model_photo_path,
        swapped_url=swapped_url,
        swapped_local=swapped_local,
        variation_urls=variation_urls,
        video_path=video_path,
        out=out,
    )

    # Arrêter le heartbeat proprement
    heartbeat_task.cancel()
    try:
        await heartbeat_task
    except asyncio.CancelledError:
        pass

    _emit({"type": "done", "drive_url": drive_url})


async def _upload_to_drive(
    run_id: str,
    character_name: str,
    frame_path: str,
    model_photo_path: str,
    swapped_url: str | None,
    swapped_local: str,
    variation_urls: list[str],
    video_path: str | None,
    out: Path,
) -> str:
    """Upload tous les fichiers vers Google Drive. Retourne l'URL du dossier Drive."""
    from pipeline.drive_uploader import DriveUploader

    refresh_token_g = os.environ.get("GOOGLE_REFRESH_TOKEN", "")
    folder_id = os.environ.get("DRIVE_FOLDER_ID", "")
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")

    if not all([refresh_token_g, folder_id, client_id, client_secret]):
        _emit({"type": "warn", "msg": "Google Drive non configuré — upload ignoré"})
        return ""

    _emit({"type": "step", "step": "upload", "status": "started"})

    drive = DriveUploader(
        refresh_token=refresh_token_g,
        folder_id=folder_id,
        client_id=client_id,
        client_secret=client_secret,
        character_folder=character_name,
    )

    try:
        # Créer la structure de dossiers
        char_folder_id = await drive._ensure_character_folder()
        mc_folder_id = await drive._ensure_folder("Motion Control", char_folder_id)
        folder_name = f"MC_Prep_{date.today().strftime('%Y-%m-%d')}_{run_id[:6]}"
        run_folder_id = await drive._ensure_folder(folder_name, mc_folder_id)

        uploaded_files: list[str] = []

        # 1. Vidéo originale (si dispo)
        if video_path and Path(video_path).exists():
            video_bytes = Path(video_path).read_bytes()
            await drive.upload_bytes(video_bytes, "original_video.mp4", run_folder_id, "video/mp4")
            uploaded_files.append("original_video.mp4")

        # 2. Frame sélectionnée
        if Path(frame_path).exists():
            frame_bytes = Path(frame_path).read_bytes()
            await drive.upload_bytes(frame_bytes, "selected_frame.jpg", run_folder_id, "image/jpeg")
            uploaded_files.append("selected_frame.jpg")

        # 3. Photo modèle de référence → PAS uploadée (l'utilisateur la garde en local,
        #    inutile de la dupliquer dans chaque dossier Drive)

        # 4. Image swappée (si le swap a réussi)
        if swapped_url:
            if Path(swapped_local).exists() and swapped_local != frame_path:
                swapped_bytes = Path(swapped_local).read_bytes()
            else:
                # Télécharger depuis CDN
                async with httpx.AsyncClient(timeout=120) as client:
                    resp = await client.get(swapped_url)
                    swapped_bytes = resp.content
            await drive.upload_bytes(swapped_bytes, "swap_model.jpg", run_folder_id, "image/jpeg")
            uploaded_files.append("swap_model.jpg")

        # 5. Variations d'outfit (télécharger depuis CDN et uploader)
        async with httpx.AsyncClient(timeout=120) as client:
            for i, url in enumerate(variation_urls, 1):
                try:
                    # Essayer d'abord si on a un fichier local
                    local_path = out / f"outfit_{i}.jpg"
                    if local_path.exists():
                        img_bytes = local_path.read_bytes()
                    else:
                        resp = await client.get(url, follow_redirects=True)
                        resp.raise_for_status()
                        img_bytes = resp.content
                    await drive.upload_bytes(img_bytes, f"outfit_{i}.jpg", run_folder_id, "image/jpeg")
                    uploaded_files.append(f"outfit_{i}.jpg")
                except Exception as exc:
                    _emit({"type": "warn", "msg": f"Upload outfit {i} failed: {exc!r}"})

        drive_folder_url = f"https://drive.google.com/drive/folders/{run_folder_id}"
        _emit({
            "type": "step", "step": "upload", "status": "done",
            "files": len(uploaded_files),
            "folder": folder_name,
        })

        return drive_folder_url

    except Exception as exc:
        _emit({"type": "warn", "msg": f"Drive upload error: {exc!r} — génération OK mais pas uploadée"})
        return ""
    finally:
        await drive.aclose()


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="MC Prep — Motion Control Folder Preparation")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Sub-commande extract
    extract_parser = subparsers.add_parser("extract", help="Télécharger vidéo + extraire frames")
    extract_parser.add_argument("--video-url", required=True)
    extract_parser.add_argument("--output-dir", required=True)
    extract_parser.add_argument("--num-frames", type=int, default=4)

    # Sub-commande generate
    gen_parser = subparsers.add_parser("generate", help="Swap + variations + upload Drive")
    gen_parser.add_argument("--run-id", required=True)
    gen_parser.add_argument("--frame-path", required=True)
    gen_parser.add_argument("--model-photo-path", required=True)
    gen_parser.add_argument("--num-variations", type=int, default=4)
    gen_parser.add_argument("--output-dir", required=True)
    gen_parser.add_argument("--character-name", default="")
    gen_parser.add_argument("--video-path", default=None)

    args = parser.parse_args()

    if args.command == "extract":
        asyncio.run(cmd_extract(args.video_url, args.output_dir, args.num_frames))

    elif args.command == "generate":
        if not os.environ.get("HIGGSFIELD_TOKEN"):
            print(json.dumps({"type": "error", "msg": "HIGGSFIELD_TOKEN manquant"}), flush=True)
            sys.exit(1)
        asyncio.run(cmd_generate(
            run_id=args.run_id,
            frame_path=args.frame_path,
            model_photo_path=args.model_photo_path,
            num_variations=args.num_variations,
            output_dir=args.output_dir,
            character_name=args.character_name,
            video_path=args.video_path,
        ))


if __name__ == "__main__":
    main()
