"""
MC Prep — Motion Control Folder Preparation Pipeline.

Prépare un dossier Drive complet (vidéo + frame sélectionnée + modèle swappé + N variations)
pour que l'utilisateur puisse faire du Kling Motion Control manuellement.

Trois sous-commandes :

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

3. batch    — Process multiple videos at once (extract → swap → variations → Drive upload)
   python -m pipeline.mc_prep batch
       --run-id ID
       --items-file PATH          # JSON file: [{"type":"url","value":"..."}, {"type":"file","value":"..."}]
       --model-photo-path PATH
       --num-variations N
       --output-dir DIR
       --character-name NAME

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

# Swap modèle — nano_banana_2, frame en image 1, Nina en image 2
#
# RÈGLE ABSOLUE des images :
#   Image 1 (frame)       = source de la SCÈNE ENTIÈRE
#                           → pose du corps, fond, décor, personnes, tenue, lumière, cadrage
#   Image 2 (model_photo) = source du VISAGE UNIQUEMENT
#                           → rien d'autre : pas le fond, pas la tenue, pas la pose
#
# Les premiers tests ont confirmé que nano_banana_2 frame-first préserve bien l'identité
# de Nina. Le problème résiduel était l'import du fond/pose de l'image 2. Ce prompt
# l'interdit explicitement avec maximal redundancy.
SWAP_PROMPT = (
    "Use image 1 as the complete scene reference: keep its background, environment, "
    "all other people, the exact body pose and limb positions, the clothing and outfit, "
    "the lighting, shadows, camera angle, and framing — all unchanged. "
    "Use image 2 as the face reference only: take the face, hair, and skin tone "
    "from image 2 and place it on the person in image 1. "
    "Do not use any background, outfit, or setting from image 2. "
    "Result: image 1 scene with the face from image 2. "
    "Photorealistic, seamless, high quality."
)

# Prompt alternatif conservé pour référence (Nina en image 1) — non utilisé en prod
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

# Variations d'outfit : un prompt par style pour forcer la diversité entre variations.
# Chaque variation reçoit un style différent → pas deux fois le même outfit.
# La partie "keep identical" est commune à tous pour préserver la scène/pose/visage.
_OUTFIT_BASE = (
    "Outfit change only. Keep absolutely identical: "
    "face, skin tone, hair, body shape, exact pose, all limb positions, "
    "background, environment, lighting, shadows, camera angle, framing. "
    "Change ONLY the clothing. "
)

OUTFIT_STYLES = [
    # 1 — Sporty / athletic
    _OUTFIT_BASE +
    "New outfit: very tight athletic crop top (sports bra style) + high-waist leggings or biker shorts. "
    "Shows midriff, form-fitting, sporty-sexy. High-fashion athletic editorial. Photorealistic.",

    # 2 — Party / night out
    _OUTFIT_BASE +
    "New outfit: ultra-short bodycon mini dress, very deep V-neckline, maximum décolleté, "
    "barely-there hemline. Glossy or metallic fabric. Glamorous night-out. Photorealistic.",

    # 3 — Casual chic / streetwear
    _OUTFIT_BASE +
    "New outfit: tight low-rise micro shorts or mini skirt + fitted crop top or tied shirt, "
    "showing midriff. Trendy streetwear, fashionable, provocative casual. Photorealistic.",

    # 4 — Beach / summer
    _OUTFIT_BASE +
    "New outfit: sexy bikini top + micro shorts or sarong, beach-ready, "
    "maximum skin, vibrant color. Summer glamour editorial. Photorealistic.",

    # 5 — Elegant / cocktail
    _OUTFIT_BASE +
    "New outfit: fitted cocktail dress, plunging neckline, thigh-high slit, "
    "luxurious fabric (silk, velvet, or sequins). High-fashion couture elegance. Photorealistic.",

    # 6 — Lingerie / boudoir
    _OUTFIT_BASE +
    "New outfit: elegant lingerie set or lace bodysuit, sheer fabric details, "
    "maximum skin exposure, luxurious and seductive. Boudoir editorial photography. Photorealistic.",

    # 7 — Power / business sexy
    _OUTFIT_BASE +
    "New outfit: very tight pencil skirt + open blazer with nothing underneath (or deep-cut top), "
    "power-sexy office look, shows skin. High-fashion editorial. Photorealistic.",

    # 8 — Festival / boho
    _OUTFIT_BASE +
    "New outfit: festival outfit — crochet or cut-out crop top + micro shorts, "
    "boho accessories, maximum skin, free-spirited chic. Festival editorial. Photorealistic.",
]

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
    """Télécharge la vidéo via yt-dlp. Retourne le chemin local.

    Si la variable d'env INSTAGRAM_COOKIES est définie, elle est écrite dans un
    fichier temporaire au format Netscape cookies.txt et passée à yt-dlp —
    permet de contourner le rate-limit / login-required d'Instagram sur Railway.
    """
    import tempfile
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

    # Cookies Instagram (Netscape format) via env var → contourne le rate-limit Railway
    cookies_tmp: str | None = None
    instagram_cookies = os.environ.get("INSTAGRAM_COOKIES", "").strip()
    if instagram_cookies:
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        tmp.write(instagram_cookies)
        tmp.close()
        cookies_tmp = tmp.name
        ydl_opts["cookiefile"] = cookies_tmp

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
    finally:
        if cookies_tmp:
            try:
                Path(cookies_tmp).unlink(missing_ok=True)
            except Exception:
                pass

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
    """Génère une variation d'outfit via Seedream 4.5 img2img.
    Chaque variation utilise un style distinct (cycle sur OUTFIT_STYLES).
    """
    # Style différent par variation pour forcer la diversité
    outfit_prompt = OUTFIT_STYLES[(index - 1) % len(OUTFIT_STYLES)]
    cmd = [
        "higgsfield", "generate", "create", "seedream_v4_5",
        "--image", swapped_image_path,
        "--prompt", outfit_prompt,
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


# ─── Sub-commande : batch-extract ────────────────────────────────────────────

async def cmd_batch_extract(
    items_file: str,
    output_dir: str,
    num_frames: int = 4,
) -> None:
    """Extract frames from multiple videos in parallel. Emits JSON-lines events on stdout."""

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Load items from JSON file
    with open(items_file, "r") as f:
        items: list[dict] = json.load(f)

    if not items:
        _emit({"type": "error", "msg": "items_file is empty"})
        sys.exit(1)

    total = len(items)
    _emit({"type": "info", "msg": f"Batch extract started — {total} video(s)"})

    # Heartbeat toutes les 20s pour éviter le timeout SSE
    heartbeat_task = asyncio.create_task(_heartbeat_loop(20))

    extract_sem = asyncio.Semaphore(4)
    success_count = 0

    async def _extract_one(i: int, item: dict) -> bool:
        """Extract frames from a single video. Returns True on success."""
        source = item.get("value", "")
        item_type = item.get("type", "url")
        sub_dir = str(out / f"video_{i}")
        Path(sub_dir).mkdir(parents=True, exist_ok=True)

        async with extract_sem:
            _emit({"type": "extract", "videoIndex": i, "status": "started", "source": source})
            try:
                video_path: str | None = None
                if item_type == "url":
                    video_path = await _download_video(source, sub_dir)
                elif item_type == "file":
                    video_path = source
                else:
                    raise ValueError(f"Unknown item type: {item_type}")

                frames = await _extract_frames(video_path, sub_dir, num_frames)

                if not frames:
                    raise RuntimeError("No frames extracted")

                _emit({
                    "type": "extract",
                    "videoIndex": i,
                    "status": "done",
                    "videoPath": video_path,
                    "frames": frames,
                })
                return True
            except Exception as exc:
                _emit({"type": "extract", "videoIndex": i, "status": "error", "msg": str(exc)[:400]})
                return False

    extract_tasks = [_extract_one(i, item) for i, item in enumerate(items)]
    results = await asyncio.gather(*extract_tasks)
    success_count = sum(1 for r in results if r)

    # Arrêter le heartbeat proprement
    heartbeat_task.cancel()
    try:
        await heartbeat_task
    except asyncio.CancelledError:
        pass

    _emit({"type": "extract_complete", "total": total, "success": success_count})


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

    # ── Étape 1 : Person swap (nano_banana_2, frame-first) ───────────────────
    # Frame en IMAGE 1 = scène complète (pose, décor, tenue, lumière)
    # Nina en IMAGE 2  = visage/cheveux uniquement
    # Cette configuration a montré dans les premiers tests que nano_banana_2
    # préserve bien l'identité de Nina. Le nouveau SWAP_PROMPT interdit
    # explicitement tout import de fond/pose depuis l'image 2.
    _emit({"type": "step", "step": "swap", "status": "started"})

    swapped_url: str | None = None

    cmd_swap = [
        "higgsfield", "generate", "create", "seedream_v4_5",
        "--image", frame_path,         # image 1 = frame (scène / pose / décor)
        "--image", model_photo_path,   # image 2 = modèle référence (visage uniquement)
        "--prompt", SWAP_PROMPT,
        "--quality", "high",
        "--aspect_ratio", "9:16",
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

    # Télécharger l'image swappée localement (pour InsightFace + variations Seedream)
    if swapped_url:
        swapped_local = str(out / "swap_model.jpg")
        try:
            await _download_url_to_file(swapped_url, swapped_local)
        except Exception as exc:
            _emit({"type": "warn", "msg": f"Download swap image failed: {exc!r} — using URL directly"})
            swapped_local = swapped_url
    else:
        swapped_local = frame_path

    # ── Étape 1b : Face transplant InsightFace (pixel-perfect) ───────────────
    # Seedream a produit la bonne scène/pose/tenue. InsightFace colle maintenant
    # le vrai visage de Nina pixel-à-pixel par dessus. Fallback silencieux si
    # InsightFace n'est pas dispo ou ne détecte pas de visage.
    if swapped_url and Path(swapped_local).exists():
        _emit({"type": "info", "msg": "Face transplant InsightFace en cours…"})
        face_final_path = str(out / "swap_face_final.jpg")
        try:
            from pipeline.face_swap import swap_face
            ok = await asyncio.get_event_loop().run_in_executor(
                None, swap_face, model_photo_path, swapped_local, face_final_path
            )
            if ok and Path(face_final_path).exists():
                swapped_local = face_final_path
                _emit({"type": "info", "msg": "Face transplant ✓ — visage copié pixel-à-pixel"})
            else:
                _emit({"type": "warn", "msg": "Face transplant : aucun visage détecté — résultat Seedream conservé"})
        except Exception as exc:
            _emit({"type": "warn", "msg": f"InsightFace non disponible — résultat Seedream conservé ({str(exc)[:150]})"})

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
        # Utiliser le suffixe aléatoire final du run_id pour un nom de dossier unique
        # run_id = "mcprep_gen_1781794361936_t05eh" → suffix = "t05eh"
        folder_suffix = run_id.split('_')[-1] if '_' in run_id else run_id[-6:]
        folder_name = f"MC_Prep_{date.today().strftime('%Y-%m-%d')}_{folder_suffix}"
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


# ─── Helper : HF call with retry ─────────────────────────────────────────────

async def _hf_call_with_retry(
    user_token: str,
    cmd_args: list,
    refresh_token: str = "",
    timeout: int = 720,
    max_retries: int = 5,
    retry_sleep: int = 20,
    label: str = "",
) -> str | None:
    """Run a Higgsfield CLI command with robust retry on concurrent_jobs_limit.

    Returns the result URL string on success, or None after all retries exhausted.
    Never raises — all exceptions are caught and logged via _emit.
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            result = await run_higgsfield_for_user(
                user_token, cmd_args, timeout=timeout, refresh_token=refresh_token
            )
            return result.strip() if result else None
        except Exception as e:
            last_exc = e
            err_str = str(e).lower()
            if "concurrent_jobs_limit" in err_str or "concurrent_jobs" in err_str:
                _emit({"type": "warn", "msg": f"HF busy ({label}), retry in {retry_sleep}s..."})
                await asyncio.sleep(retry_sleep)
                continue
            # Non-retryable error
            break

    _emit({"type": "warn", "msg": f"Failed after {max_retries} retries: {label} — {str(last_exc)}"})
    return None


# ─── Sub-commande : batch ────────────────────────────────────────────────────

async def cmd_batch(
    run_id: str,
    items_file: str,
    model_photo_path: str,
    num_variations: int,
    output_dir: str,
    character_name: str,
    skip_extract: bool = False,
) -> None:
    """Batch orchestrator: extract → swap → variations → Drive upload for multiple videos."""

    user_token = os.environ.get("HIGGSFIELD_TOKEN", "")
    if not user_token:
        _emit({"type": "error", "msg": "HIGGSFIELD_TOKEN manquant"})
        sys.exit(1)
    refresh_token = os.environ.get("HIGGSFIELD_REFRESH_TOKEN", "")

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Load items from JSON file
    with open(items_file, "r") as f:
        items: list[dict] = json.load(f)

    if not items:
        _emit({"type": "error", "msg": "items_file is empty"})
        sys.exit(1)

    total = len(items)
    _emit({"type": "info", "msg": f"Batch started — {total} video(s) to process"})

    # Heartbeat toutes les 20s pour éviter le timeout SSE
    heartbeat_task = asyncio.create_task(_heartbeat_loop(20))

    if skip_extract:
        # ── Skip Phase 1 : use pre-selected frames from items ──────────────
        extracted: list[dict] = []
        for i, item in enumerate(items):
            extracted.append({
                "videoIndex": i,
                "video_path": item.get("video_path"),
                "frame_path": item["frame_path"],
                "source": item.get("value", ""),
            })
        _emit({"type": "info", "msg": f"Skip extract — using {len(extracted)} pre-selected frame(s)"})
    else:
        # ── Phase 1 : EXTRACT ALL (parallel, Semaphore(4)) ──────────────────
        extract_sem = asyncio.Semaphore(4)

        async def _extract_one(i: int, item: dict) -> dict | None:
            """Extract a single video. Returns metadata dict or None on failure."""
            source = item.get("value", "")
            item_type = item.get("type", "url")
            sub_dir = str(out / f"video_{i}")
            Path(sub_dir).mkdir(parents=True, exist_ok=True)

            async with extract_sem:
                _emit({"type": "extract", "videoIndex": i, "status": "started", "source": source})
                try:
                    video_path: str | None = None
                    if item_type == "url":
                        video_path = await _download_video(source, sub_dir)
                        frames = await _extract_frames(video_path, sub_dir, 1)
                    elif item_type == "file":
                        video_path = source  # already local
                        frames = await _extract_frames(source, sub_dir, 1)
                    else:
                        raise ValueError(f"Unknown item type: {item_type}")

                    if not frames:
                        raise RuntimeError("No frames extracted")

                    _emit({"type": "extract", "videoIndex": i, "status": "done"})
                    return {
                        "videoIndex": i,
                        "video_path": video_path,
                        "frame_path": frames[0]["path"],
                        "source": source,
                    }
                except Exception as exc:
                    _emit({"type": "extract", "videoIndex": i, "status": "error", "msg": str(exc)[:400]})
                    return None

        extract_tasks = [_extract_one(i, item) for i, item in enumerate(items)]
        extract_results = await asyncio.gather(*extract_tasks)

        # Filter out failed extractions
        extracted = [r for r in extract_results if r is not None]

    if not extracted:
        _emit({"type": "error", "msg": "All extractions failed — nothing to process"})
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        _emit({"type": "done", "totalVideos": total, "completed": 0, "failed": total})
        return

    # ── Phase 2 : SWAP ALL (parallel, Semaphore(4)) ─────────────────────────
    swap_sem = asyncio.Semaphore(4)

    async def _swap_one(entry: dict) -> dict:
        """Swap model face onto extracted frame. Updates entry in-place with swap results."""
        i = entry["videoIndex"]
        frame_path = entry["frame_path"]
        sub_dir = str(out / f"video_{i}")

        async with swap_sem:
            _emit({"type": "step", "step": "swap", "videoIndex": i, "status": "started"})
            try:
                cmd_swap = [
                    "higgsfield", "generate", "create", "seedream_v4_5",
                    "--image", frame_path,
                    "--image", model_photo_path,
                    "--prompt", SWAP_PROMPT,
                    "--quality", "high",
                    "--aspect_ratio", "9:16",
                    "--wait", "--wait-timeout", "12m",
                ]
                swapped_url = await _hf_call_with_retry(
                    user_token, cmd_swap, refresh_token, timeout=720, label=f"swap-{i}"
                )

                swapped_local: str | None = None
                if swapped_url:
                    local_path = str(Path(sub_dir) / "swap_model.jpg")
                    try:
                        await _download_url_to_file(swapped_url, local_path)
                        swapped_local = local_path
                    except Exception as exc:
                        _emit({"type": "warn", "msg": f"Download swap image {i} failed: {exc!r}"})
                        swapped_local = None

                    # InsightFace face transplant (silent fallback)
                    if swapped_local and Path(swapped_local).exists():
                        face_final_path = str(Path(sub_dir) / "swap_face_final.jpg")
                        try:
                            from pipeline.face_swap import swap_face
                            ok = await asyncio.get_event_loop().run_in_executor(
                                None, swap_face, model_photo_path, swapped_local, face_final_path
                            )
                            if ok and Path(face_final_path).exists():
                                swapped_local = face_final_path
                        except Exception:
                            pass  # silent fallback — keep Seedream result

                entry["swapped_url"] = swapped_url
                entry["swapped_local"] = swapped_local or frame_path
                _emit({"type": "step", "step": "swap", "videoIndex": i, "status": "done"})

            except Exception as exc:
                _emit({"type": "step", "step": "swap", "videoIndex": i, "status": "error", "msg": str(exc)[:400]})
                entry["swapped_url"] = None
                entry["swapped_local"] = frame_path

        return entry

    swap_tasks = [_swap_one(entry) for entry in extracted]
    swapped_entries = await asyncio.gather(*swap_tasks)

    # ── Phase 3 : VARIATIONS (1 video at a time, sequential) ────────────────
    ok_count = 0

    for entry in swapped_entries:
        i = entry["videoIndex"]
        swapped_local = entry["swapped_local"]
        swapped_url = entry.get("swapped_url")
        sub_dir = str(out / f"video_{i}")

        # Generate outfit variations in parallel for this video
        async def _gen_variation(idx: int, _img: str = swapped_local, _vi: int = i) -> dict:
            outfit_prompt = OUTFIT_STYLES[(idx - 1) % len(OUTFIT_STYLES)]
            cmd = [
                "higgsfield", "generate", "create", "seedream_v4_5",
                "--image", _img,
                "--prompt", outfit_prompt,
                "--aspect_ratio", "9:16",
                "--quality", "high",
                "--wait", "--wait-timeout", "10m",
            ]
            url = await _hf_call_with_retry(
                user_token, cmd, refresh_token, timeout=600, label=f"outfit-{_vi}-{idx}"
            )
            return {"index": idx, "total": num_variations, "url": url}

        variation_tasks = [_gen_variation(j + 1) for j in range(num_variations)]
        variation_results = await asyncio.gather(*variation_tasks)

        variation_urls: list[str] = []
        for result in variation_results:
            if result.get("url"):
                variation_urls.append(result["url"])
                _emit({
                    "type": "variation",
                    "videoIndex": i,
                    "index": result["index"],
                    "total": result["total"],
                    "url": result["url"],
                })
            else:
                _emit({"type": "warn", "msg": f"Variation {result['index']} for video {i} failed — skipped"})

        # ── Phase 4 : Drive upload (per-video) ──────────────────────────────
        try:
            drive_url = await _upload_to_drive(
                run_id=f"{run_id}_v{i}",
                character_name=character_name,
                frame_path=entry["frame_path"],
                model_photo_path=model_photo_path,
                swapped_url=swapped_url,
                swapped_local=swapped_local,
                variation_urls=variation_urls,
                video_path=entry.get("video_path"),
                out=Path(sub_dir),
            )
            _emit({"type": "video_complete", "videoIndex": i, "driveUrl": drive_url})
            ok_count += 1
        except Exception as exc:
            _emit({"type": "warn", "msg": f"Drive upload failed for video {i}: {str(exc)[:300]}"})
            fail_count += 1

    fail_count = total - ok_count

    # Arrêter le heartbeat proprement
    heartbeat_task.cancel()
    try:
        await heartbeat_task
    except asyncio.CancelledError:
        pass

    _emit({"type": "done", "totalVideos": total, "completed": ok_count, "failed": fail_count})


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

    # Sub-commande batch
    batch_parser = subparsers.add_parser("batch", help="Batch process multiple videos")
    batch_parser.add_argument("--run-id", required=True)
    batch_parser.add_argument("--items-file", required=True)
    batch_parser.add_argument("--model-photo-path", required=True)
    batch_parser.add_argument("--num-variations", type=int, default=4)
    batch_parser.add_argument("--output-dir", required=True)
    batch_parser.add_argument("--character-name", default="")
    batch_parser.add_argument("--skip-extract", action="store_true", default=False)

    # Sub-commande batch-extract
    bextract_parser = subparsers.add_parser("batch-extract", help="Extract frames from multiple videos")
    bextract_parser.add_argument("--items-file", required=True)
    bextract_parser.add_argument("--output-dir", required=True)
    bextract_parser.add_argument("--num-frames", type=int, default=4)

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

    elif args.command == "batch":
        if not os.environ.get("HIGGSFIELD_TOKEN"):
            print(json.dumps({"type": "error", "msg": "HIGGSFIELD_TOKEN manquant"}), flush=True)
            sys.exit(1)
        asyncio.run(cmd_batch(
            run_id=args.run_id,
            items_file=args.items_file,
            model_photo_path=args.model_photo_path,
            num_variations=args.num_variations,
            output_dir=args.output_dir,
            character_name=args.character_name,
            skip_extract=args.skip_extract,
        ))

    elif args.command == "batch-extract":
        asyncio.run(cmd_batch_extract(
            items_file=args.items_file,
            output_dir=args.output_dir,
            num_frames=args.num_frames,
        ))


if __name__ == "__main__":
    main()
