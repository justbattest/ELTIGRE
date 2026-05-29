"""
Metadata Batch — nettoie et uploade un lot de photos/vidéos vers Google Drive.

Applique automatiquement pipeline.metadata_optimizer sur chaque fichier
(via drive_uploader.upload_bytes qui intercepte avant chaque upload).

Structure Drive :
  <CHARACTER>/
    metadata/
      <run_id>/
        photo1.jpg
        video1.mp4
        ...

Protocol stdout (JSON lines) :
  {"type": "batch_start", "total": N}
  {"type": "file", "n": i, "total": N, "filename": "x.jpg", "drive_url": "...", "error": null}
  {"type": "done", "run_id": "...", "total": N, "finished_at": "..."}
  {"type": "error", "message": "..."}
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

SUPPORTED_IMAGES = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'}
SUPPORTED_VIDEOS = {'.mp4', '.mov', '.m4v', '.avi', '.mkv', '.mp4v'}


def _content_type(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in SUPPORTED_IMAGES:
        return "image/jpeg"
    if ext in SUPPORTED_VIDEOS:
        return "video/mp4"
    return "application/octet-stream"


async def run_metadata_batch(run_id: str, files_dir: str) -> None:
    from pipeline.drive_uploader import get_uploader, init_drive_uploader_from_env

    files_dir_path = Path(files_dir)
    all_files = sorted([
        p for p in files_dir_path.iterdir()
        if p.suffix.lower() in (SUPPORTED_IMAGES | SUPPORTED_VIDEOS) and p.is_file()
    ])

    if not all_files:
        print(json.dumps({
            "type": "error",
            "message": "Aucun fichier supporté trouvé (JPG, PNG, WebP, MP4, MOV acceptés)"
        }), flush=True)
        return

    total = len(all_files)
    print(json.dumps({
        "type": "batch_start",
        "total": total,
    }), flush=True)

    init_drive_uploader_from_env()
    uploader = get_uploader()
    if not uploader:
        print(json.dumps({
            "type": "error",
            "message": "Google Drive non configuré (GOOGLE_REFRESH_TOKEN manquant)"
        }), flush=True)
        return

    # Pré-créer le dossier du run dans Drive
    run_folder_id = await uploader._ensure_metadata_run_folder(run_id)

    completed = 0
    for file_path in all_files:
        completed += 1
        ct = _content_type(file_path)

        try:
            data = file_path.read_bytes()
            # upload_bytes applique automatiquement metadata_optimizer
            url = await uploader.upload_bytes(
                data,
                file_path.name,
                run_folder_id,
                content_type=ct,
            )
            print(json.dumps({
                "type": "file",
                "n": completed,
                "total": total,
                "filename": file_path.name,
                "is_video": ct.startswith("video/"),
                "drive_url": url,
                "error": None,
            }), flush=True)

        except Exception as e:
            print(json.dumps({
                "type": "file",
                "n": completed,
                "total": total,
                "filename": file_path.name,
                "is_video": ct.startswith("video/"),
                "drive_url": None,
                "error": str(e),
            }), flush=True)

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": total,
        "finished_at": datetime.utcnow().isoformat(),
    }), flush=True)

    # Fermer le client HTTP persistant proprement
    await uploader.aclose()


# ── Entry point CLI ────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Metadata Batch — clean + Drive upload")
    parser.add_argument("--run-id",    required=True, help="ID unique du run")
    parser.add_argument("--files-dir", required=True, help="Dossier contenant les fichiers uploadés")
    args = parser.parse_args()

    asyncio.run(run_metadata_batch(
        run_id=args.run_id,
        files_dir=args.files_dir,
    ))


if __name__ == "__main__":
    main()
