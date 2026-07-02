"""
Metadata Batch — nettoie un lot de photos/vidéos et écrit le résultat en local.

Applique pipeline.metadata_optimizer (EXIF/metadata cleaning) sur chaque fichier,
puis écrit directement dans --output-dir pour un téléchargement ZIP direct
(pas de dépendance Google Drive — voir /api/metadata/download/[runId]).

Structure output :
  <output_dir>/
    photo1.jpg
    video1.mp4
    ...

Protocol stdout (JSON lines) :
  {"type": "batch_start", "total": N}
  {"type": "file", "n": i, "total": N, "filename": "x.jpg", "error": null}
  {"type": "done", "run_id": "...", "total": N, "finished_at": "..."}
  {"type": "error", "message": "..."}
"""

import asyncio
import hashlib
import json
from datetime import datetime, timezone
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


async def run_metadata_batch(run_id: str, files_dir: str, output_dir: str) -> None:
    from pipeline.metadata_optimizer import optimize_image_bytes, optimize_video_bytes

    files_dir_path = Path(files_dir)
    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)

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

    completed = 0
    for file_path in all_files:
        completed += 1
        ct = _content_type(file_path)
        is_video = ct.startswith("video/")

        try:
            data = file_path.read_bytes()
            seed = int(hashlib.md5(data).hexdigest()[:8], 16)

            optimized = (
                await asyncio.to_thread(optimize_video_bytes, data, seed)
                if is_video
                else await asyncio.to_thread(optimize_image_bytes, data, seed)
            )

            out_path = output_dir_path / file_path.name
            out_path.write_bytes(optimized)

            print(json.dumps({
                "type": "file",
                "n": completed,
                "total": total,
                "filename": file_path.name,
                "is_video": is_video,
                "error": None,
            }), flush=True)

        except Exception as e:
            print(json.dumps({
                "type": "file",
                "n": completed,
                "total": total,
                "filename": file_path.name,
                "is_video": is_video,
                "error": str(e),
            }), flush=True)

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": total,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }), flush=True)


# ── Entry point CLI ────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Metadata Batch — clean metadata, output local files")
    parser.add_argument("--run-id",     required=True, help="ID unique du run")
    parser.add_argument("--files-dir",  required=True, help="Dossier contenant les fichiers uploadés")
    parser.add_argument("--output-dir", required=True, help="Dossier de sortie pour le ZIP de téléchargement")
    args = parser.parse_args()

    asyncio.run(run_metadata_batch(
        run_id=args.run_id,
        files_dir=args.files_dir,
        output_dir=args.output_dir,
    ))


if __name__ == "__main__":
    main()
