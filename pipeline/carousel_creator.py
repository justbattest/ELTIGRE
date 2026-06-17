"""
Carousel Creator — génère des centaines de carousels uniques depuis n'importe quel pool d'images.

Pipeline :
  1. Chaque image source est nettoyée : EXIF strippé + iPhone 17 Pro EXIF fake injecté
     (via pipeline.metadata_optimizer — logique partagée avec tous les uploads Drive)
  2. Chaque instance d'une image dans un carousel a des métadonnées UNIQUES (seed différent)
     → même photo dans 2 carousels différents = 2 fichiers binaires différents
  3. Combinatorics : C(N, 4) combinaisons, cap à max_carousels
  4. Upload Drive : <run_id>/carousel_N/1.jpg … 4.jpg

Dépendances Python : piexif, Pillow (+ numpy optionnel pour le micro-noise)
"""

import asyncio
import json
import os
import random
import sys
from datetime import datetime
from itertools import combinations
from pathlib import Path

# Logique EXIF centralisée dans metadata_optimizer (partagée avec drive_uploader)
from pipeline.metadata_optimizer import GPS_CITIES, optimize_image_bytes


def clean_image_for_carousel(
    input_path: str,
    output_path: str,
    instance_seed: int,
) -> None:
    """
    Prépare une image pour un carousel Instagram avec métadonnées uniques.

    Délègue à optimize_image_bytes() de metadata_optimizer :
    - Strip EXIF original (supprime AI markers)
    - Micro-crop 1-3px (casse les hashes perceptuels)
    - Micro-noise ±1 sur ~0.3% des pixels
    - Injection iPhone 17 Pro EXIF unique (seed = unique par (carousel, slot, source))

    Args:
        input_path    : chemin image source
        output_path   : chemin image de sortie (créé ou écrasé)
        instance_seed : entier unique → métadonnées différentes même si même source
    """
    data = Path(input_path).read_bytes()
    optimized = optimize_image_bytes(data, instance_seed)
    Path(output_path).write_bytes(optimized)


# ── Combinatorics ──────────────────────────────────────────────────────────────

def generate_carousel_combinations(
    images: list[str],
    max_carousels: int = 200,
    carousel_size: int = 4,
) -> list[list[str]]:
    """
    Génère jusqu'à max_carousels combinaisons uniques de carousel_size images.

    Avec N images :
    - C(N, 4) combinaisons mathématiques possibles
    - Si C(N,4) ≤ max_carousels : génère toutes les combinaisons
    - Sinon : échantillonnage aléatoire (random.sample sur la liste complète)
    - L'ordre dans chaque carousel est shuffled aléatoirement pour la variété visuelle

    Exemples :
    - 10 images → 210 combinaisons → cap 200 → 200 carousels
    - 20 images → 4845 combinaisons → cap 200 → 200 carousels
    - 5 images  → 5 combinaisons → 5 carousels (moins que le cap)
    """
    if len(images) < carousel_size:
        raise ValueError(
            f"Il faut au moins {carousel_size} images pour créer des carousels "
            f"(reçu {len(images)})"
        )

    all_combos = list(combinations(range(len(images)), carousel_size))
    if len(all_combos) > max_carousels:
        all_combos = random.sample(all_combos, max_carousels)

    result = []
    for combo in all_combos:
        order = list(combo)
        random.shuffle(order)
        result.append([images[i] for i in order])
    return result


# ── Orchestration async ────────────────────────────────────────────────────────

async def run_carousel_creator(
    run_id: str,
    images_dir: str,
    max_carousels: int = 200,
) -> None:
    """
    Orchestre la création et l'upload de carousels vers Google Drive.

    Protocol stdout (JSON lines) :
    {"type": "info",            "msg": "...", "image_count": N}
    {"type": "carousel_start",  "total": N, "image_count": N}
    {"type": "carousel",        "n": N, "total": N, "drive_urls": [...], "errors": null|[...]}
    {"type": "done",            "run_id": "...", "total": N, "finished_at": "..."}
    {"type": "error",           "message": "..."}
    """
    from pipeline.drive_uploader import get_uploader, init_drive_uploader_from_env

    images_dir_path = Path(images_dir)
    images = sorted([
        str(p) for p in images_dir_path.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and p.is_file()
    ])

    if not images:
        print(json.dumps({
            "type": "error",
            "message": "Aucune image trouvée dans le dossier uploadé"
        }), flush=True)
        return

    print(json.dumps({
        "type": "info",
        "msg": f"{len(images)} images chargées",
        "image_count": len(images),
    }), flush=True)

    try:
        carousels = generate_carousel_combinations(images, max_carousels)
    except ValueError as e:
        print(json.dumps({"type": "error", "message": str(e)}), flush=True)
        return

    total = len(carousels)
    print(json.dumps({
        "type": "carousel_start",
        "total": total,
        "image_count": len(images),
        "combinations_possible": len(list(combinations(range(len(images)), 4))),
    }), flush=True)

    # Init Drive uploader
    init_drive_uploader_from_env()
    uploader = get_uploader()
    if not uploader:
        print(json.dumps({
            "type": "error",
            "message": "Google Drive non configuré (GOOGLE_REFRESH_TOKEN manquant)"
        }), flush=True)
        return

    # Dossier temp pour les images nettoyées (nettoyées une par une, supprimées après upload)
    cleaned_dir = Path(images_dir).parent / f"cleaned_{run_id}"
    cleaned_dir.mkdir(parents=True, exist_ok=True)

    # Pré-créer le dossier racine du run dans Drive
    try:
        run_folder_id = await uploader._ensure_carousel_run_folder(run_id)
    except Exception as drive_exc:
        print(json.dumps({
            "type": "error",
            "message": f"Google Drive token expired or revoked — go to Settings → Reconnect Drive. ({drive_exc})"
        }), flush=True)
        return

    # Semaphore : max 6 carousels en parallèle (24 uploads Drive simultanés max)
    sem = asyncio.Semaphore(6)

    async def process_carousel(carousel_idx: int, img_paths: list[str]) -> None:
        async with sem:
            carousel_num = carousel_idx + 1
            carousel_name = f"carousel_{carousel_num}"
            drive_urls: list[str] = []
            errors: list[str] = []

            try:
                carousel_folder_id = await uploader._ensure_folder(carousel_name, run_folder_id)

                for slot_idx, source_path in enumerate(img_paths):
                    # Seed unique = (carousel_idx × 10000) + (slot_idx × 1000) + hash(source_path)
                    # → même source dans deux carousels différents = seeds différentes = EXIF différent
                    instance_seed = (carousel_idx * 10000 + slot_idx * 1000 + hash(source_path)) & 0x7FFFFFFF

                    cleaned_filename = f"c{carousel_num}_s{slot_idx + 1}_{Path(source_path).stem}.jpg"
                    cleaned_path = cleaned_dir / cleaned_filename

                    try:
                        clean_image_for_carousel(str(source_path), str(cleaned_path), instance_seed)
                    except Exception as e:
                        errors.append(f"clean slot {slot_idx + 1}: {e}")
                        continue

                    try:
                        data = cleaned_path.read_bytes()
                        url = await uploader.upload_bytes(
                            data,
                            f"{slot_idx + 1}.jpg",   # 1.jpg, 2.jpg, 3.jpg, 4.jpg
                            carousel_folder_id,
                        )
                        drive_urls.append(url)
                    except Exception as e:
                        errors.append(f"upload slot {slot_idx + 1}: {e}")
                    finally:
                        # Supprimer le fichier temp immédiatement après upload
                        try:
                            cleaned_path.unlink(missing_ok=True)
                        except Exception:
                            pass

            except Exception as e:
                errors.append(f"carousel_folder: {e}")

            print(json.dumps({
                "type": "carousel",
                "n": carousel_num,
                "total": total,
                "drive_urls": drive_urls,
                "errors": errors if errors else None,
            }), flush=True)

    tasks = [
        process_carousel(idx, imgs)
        for idx, imgs in enumerate(carousels)
    ]
    await asyncio.gather(*tasks)

    # Nettoyer le dossier temp
    try:
        cleaned_dir.rmdir()
    except Exception:
        pass

    print(json.dumps({
        "type": "done",
        "run_id": run_id,
        "total": total,
        "finished_at": datetime.utcnow().isoformat(),
    }), flush=True)


# ── Entry point CLI ────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Carousel Creator — metadata clean + Drive upload")
    parser.add_argument("--run-id", required=True, help="ID unique du run carousel")
    parser.add_argument("--images-dir", required=True, help="Dossier contenant les images uploadées")
    parser.add_argument("--max-carousels", type=int, default=200, help="Nombre max de carousels à créer (défaut: 200)")
    args = parser.parse_args()

    asyncio.run(run_carousel_creator(
        run_id=args.run_id,
        images_dir=args.images_dir,
        max_carousels=args.max_carousels,
    ))


if __name__ == "__main__":
    main()
