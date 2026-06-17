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

# Swap modèle : Nano Banana Pro (dual-image : --image = frame source, --start-image = photo modèle)
SWAP_PROMPT = (
    "Replace the person in the main image with the person shown in the reference/start image. "
    "Preserve exactly and without any alteration: the background, environment, furniture, "
    "objects, lighting direction, shadows, color palette, camera angle, framing, "
    "photo composition, and the exact pose and position of the person. "
    "The replacement person must adopt the identical pose, body orientation, "
    "and position in the frame as the original person. "
    "Keep the outfit of the reference person exactly as it appears. "
    "Change ONLY the identity of the person — everything else stays pixel-perfect. "
    "Photorealistic, high quality, seamless integration."
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

    # ── Étape 1 : Person swap (Nano Banana Pro dual-image) ────────────────────
    _emit({"type": "step", "step": "swap", "status": "started"})

    swap_model = "nano_banana_pro"  # on essaie d'abord le modèle Pro
    swapped_url: str | None = None
    swap_error: str | None = None

    for attempt_model in (swap_model, "nano_banana_2"):
        cmd_swap = [
            "higgsfield", "generate", "create", attempt_model,
            "--image", frame_path,
            "--start-image", model_photo_path,
            "--prompt", SWAP_PROMPT,
            "--resolution", "2k",
            "--wait", "--wait-timeout", "12m",
        ]
        try:
            result = await run_higgsfield_for_user(
                user_token, cmd_swap, timeout=720, refresh_token=refresh_token
            )
            if result:
                swapped_url = result.strip()
                _emit({"type": "info", "msg": f"Swap OK avec modèle {attempt_model}"})
                break
            swap_error = "Résultat vide"
        except Exception as exc:
            err_str = str(exc)
            # Si c'est juste un modèle invalide on tente le suivant, sinon on arrête
            if "invalid" in err_str.lower() or "not found" in err_str.lower() or "unknown" in err_str.lower():
                _emit({"type": "info", "msg": f"Modèle {attempt_model} non disponible, fallback…"})
                swap_error = err_str
                continue
            # Erreur non récupérable (ex: token expiré déjà retry dans run_higgsfield_for_user)
            _emit({"type": "error", "msg": f"Swap failed: {err_str[:400]}"})
            sys.exit(1)

    if not swapped_url:
        _emit({"type": "error", "msg": f"Swap échoué sur tous les modèles: {swap_error}"})
        sys.exit(1)

    _emit({"type": "step", "step": "swap", "status": "done", "url": swapped_url})

    # Télécharger l'image swappée localement (pour les variations Seedream)
    swapped_local = str(out / "swap_model.jpg")
    try:
        await _download_url_to_file(swapped_url, swapped_local)
    except Exception as exc:
        _emit({"type": "warn", "msg": f"Download swap image failed: {exc!r} — using URL directly"})
        swapped_local = swapped_url  # fallback : Higgsfield accepte les URLs

    # ── Étape 2 : N × Seedream outfit variations (parallèle) ─────────────────
    _emit({"type": "step", "step": "variations", "status": "started"})

    outfit_tasks = [
        _generate_outfit(user_token, swapped_local, i + 1, num_variations, refresh_token=refresh_token)
        for i in range(num_variations)
    ]
    outfit_results = await asyncio.gather(*outfit_tasks, return_exceptions=True)

    variation_urls: list[str] = []
    for result in outfit_results:
        if isinstance(result, Exception):
            _emit({"type": "warn", "msg": f"Variation exception: {result!r}"})
            variation_urls.append(swapped_url)  # fallback sur le swap
        elif not isinstance(result, dict) or not result.get("url"):
            err = result.get("error", "UNKNOWN") if isinstance(result, dict) else "EXCEPTION"
            _emit({"type": "warn", "msg": f"Variation KO ({err}) — fallback"})
            variation_urls.append(swapped_url)
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

    _emit({"type": "done", "drive_url": drive_url})


async def _upload_to_drive(
    run_id: str,
    character_name: str,
    frame_path: str,
    model_photo_path: str,
    swapped_url: str,
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

        # 3. Photo modèle de référence (utile pour avoir tout dans le dossier)
        if Path(model_photo_path).exists():
            model_bytes = Path(model_photo_path).read_bytes()
            await drive.upload_bytes(model_bytes, "model_reference.jpg", run_folder_id, "image/jpeg")
            uploaded_files.append("model_reference.jpg")

        # 4. Image swappée (déjà téléchargée en local si possible)
        if Path(swapped_local).exists():
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
