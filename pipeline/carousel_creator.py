"""
Carousel Creator — génère des centaines de carousels uniques depuis n'importe quel pool d'images.

Pipeline :
  1. Chaque image source est nettoyée : EXIF strippé + iPhone 17 Pro EXIF fake injecté
  2. Chaque instance d'une image dans un carousel a des métadonnées UNIQUES (seed différent)
     → même photo dans 2 carousels différents = 2 fichiers binaires différents
  3. Combinatorics : C(N, 4) combinaisons, cap à max_carousels
  4. Upload Drive : <run_id>/carousel_N/1.jpg … 4.jpg

Dépendances Python : piexif, Pillow (+ numpy optionnel pour le micro-noise)
"""

import asyncio
import io
import json
import os
import random
import sys
from datetime import datetime, timedelta
from itertools import combinations
from pathlib import Path

# ── Pool de villes GPS ─────────────────────────────────────────────────────────
# Coordonnées réelles de villes lifestyle plausibles pour une influenceuse.
# Chaque instance d'image reçoit une ville aléatoire + micro-offset (±0.005°).
GPS_CITIES = [
    ("Paris", 48.8566, 2.3522),
    ("New York", 40.7128, -74.0060),
    ("Los Angeles", 34.0522, -118.2437),
    ("Miami", 25.7617, -80.1918),
    ("London", 51.5074, -0.1278),
    ("Monaco", 43.7384, 7.4246),
    ("Dubai", 25.2048, 55.2708),
    ("Ibiza", 38.9067, 1.4206),
    ("Sydney", -33.8688, 151.2093),
    ("Barcelona", 41.3851, 2.1734),
    ("Amsterdam", 52.3676, 4.9041),
    ("Rome", 41.9028, 12.4964),
    ("Malibu", 34.0259, -118.7798),
    ("Cannes", 43.5528, 7.0174),
    ("Tokyo", 35.6762, 139.6503),
]

ISO_VALUES = [64, 80, 100, 125, 160]

# ── Helpers EXIF ───────────────────────────────────────────────────────────────

def _to_gps_coord(value: float) -> list:
    """Convertit des degrés décimaux en format EXIF GPS [(deg,1),(min,1),(sec,100)]."""
    deg = int(abs(value))
    minutes_float = (abs(value) - deg) * 60
    minutes = int(minutes_float)
    seconds = (minutes_float - minutes) * 60
    return [(deg, 1), (minutes, 1), (int(seconds * 100), 100)]


def clean_image_for_carousel(
    input_path: str,
    output_path: str,
    instance_seed: int,
) -> None:
    """
    Prépare une image pour un carousel Instagram avec métadonnées uniques.

    Étapes :
    1. Strip tout EXIF original (supprime AI markers, C2PA, watermark metadata)
    2. Micro-crop aléatoire 1-3px (décale le pixel grid → casse les hashes perceptuels)
    3. Micro-noise ±1 sur ~0.3% des pixels (disrupte les signatures fréquentielles)
    4. Injecte iPhone 17 Pro EXIF unique basé sur instance_seed :
       - Datetime aléatoire dans les 8 mois post-launch (sept. 2025 → mai 2026)
       - GPS d'une ville lifestyle aléatoire + micro-offset (±0.005°)
       - ISO / exposure_time / focal_length légèrement variés
       - LensModel : "iPhone 17 Pro back triple camera 6.86mm f/1.78"
    5. Re-save JPEG quality=93-96 (légère variation → fichiers binaires différents)

    Args:
        input_path  : chemin image source
        output_path : chemin image de sortie (créé ou écrasé)
        instance_seed : entier unique → chaque (carousel_idx, slot_idx, source) donne
                        une seed différente = métadonnées différentes même si même source
    """
    try:
        import piexif
        from PIL import Image
    except ImportError as e:
        raise RuntimeError(f"Dépendances manquantes : {e}. Installer avec : pip install piexif Pillow") from e

    rng = random.Random(instance_seed)

    img = Image.open(input_path).convert("RGB")
    w, h = img.size

    # ── 1. Micro-crop (1-3px, côté aléatoire) ───────────────────────────────
    crop_px = rng.randint(1, 3)
    side = rng.choice(["left", "right", "top", "bottom"])
    crop_map = {
        "left":   (crop_px, 0, w, h),
        "right":  (0, 0, w - crop_px, h),
        "top":    (0, crop_px, w, h),
        "bottom": (0, 0, w, h - crop_px),
    }
    img = img.crop(crop_map[side])
    w, h = img.size

    # ── 2. Micro-noise (±1 sur ~0.3% des pixels) ────────────────────────────
    try:
        import numpy as np
        arr = np.array(img, dtype=np.int16)
        n_pixels = max(1, (w * h) // 350)
        for _ in range(n_pixels):
            x = rng.randint(0, w - 1)
            y = rng.randint(0, h - 1)
            noise = rng.randint(-1, 1)
            arr[y, x] = np.clip(arr[y, x] + noise, 0, 255)
        img = Image.fromarray(arr.astype(np.uint8))
    except ImportError:
        pass  # numpy optionnel — on skip le noise sans planter

    # ── 3. iPhone 17 Pro EXIF unique ────────────────────────────────────────
    # Datetime : random entre sept. 2025 (launch iPhone 17 Pro) et mai 2026
    launch_date = datetime(2025, 9, 12)
    random_offset_days = rng.randint(0, 250)
    random_hour   = rng.randint(7, 21)
    random_minute = rng.randint(0, 59)
    random_second = rng.randint(0, 59)
    photo_dt = launch_date + timedelta(days=random_offset_days)
    dt_str = (
        f"{photo_dt.year}:{photo_dt.month:02d}:{photo_dt.day:02d} "
        f"{random_hour:02d}:{random_minute:02d}:{random_second:02d}"
    ).encode()

    # GPS : ville aléatoire + micro-offset (±0.005°)
    _, lat, lon = rng.choice(GPS_CITIES)
    lat += rng.uniform(-0.005, 0.005)
    lon += rng.uniform(-0.005, 0.005)

    gps_lat_ref = b"N" if lat >= 0 else b"S"
    gps_lon_ref = b"E" if lon >= 0 else b"W"
    gps_lat = _to_gps_coord(lat)
    gps_lon = _to_gps_coord(lon)

    # Paramètres caméra légèrement variés
    iso = rng.choice(ISO_VALUES)
    exposure_denom = rng.choice([100, 120, 125, 160])
    quality_val = rng.randint(93, 96)
    # iPhone 17 Pro : main (24mm eq = 5.1mm), 2x (48mm eq = 12mm), 5x (120mm eq = 6.86mm réel)
    focal_options = [(510, 100), (686, 100), (510, 100)]  # bias vers 24mm (main)
    focal_length = rng.choice(focal_options)

    w_final, h_final = img.size

    exif_dict = {
        "0th": {
            piexif.ImageIFD.Make: b"Apple",
            piexif.ImageIFD.Model: b"iPhone 17 Pro",
            piexif.ImageIFD.Orientation: 1,
            piexif.ImageIFD.Software: b"18.5",
            piexif.ImageIFD.DateTime: dt_str,
            piexif.ImageIFD.XResolution: (72, 1),
            piexif.ImageIFD.YResolution: (72, 1),
            piexif.ImageIFD.ResolutionUnit: 2,
        },
        "Exif": {
            piexif.ExifIFD.ExposureTime: (1, exposure_denom),
            piexif.ExifIFD.FNumber: (178, 100),          # f/1.78
            piexif.ExifIFD.ISOSpeedRatings: iso,
            piexif.ExifIFD.DateTimeOriginal: dt_str,
            piexif.ExifIFD.DateTimeDigitized: dt_str,
            piexif.ExifIFD.FocalLength: focal_length,
            piexif.ExifIFD.ExifVersion: b"0232",
            piexif.ExifIFD.FlashpixVersion: b"0100",
            piexif.ExifIFD.ColorSpace: 65535,            # sRGB uncalibrated (iPhone default)
            piexif.ExifIFD.PixelXDimension: w_final,
            piexif.ExifIFD.PixelYDimension: h_final,
            piexif.ExifIFD.Flash: 0,                     # no flash
            piexif.ExifIFD.ExposureMode: 0,              # auto
            piexif.ExifIFD.WhiteBalance: 0,              # auto
            piexif.ExifIFD.LensMake: b"Apple",
            piexif.ExifIFD.LensModel: b"iPhone 17 Pro back triple camera 6.86mm f/1.78",
            piexif.ExifIFD.SceneCaptureType: 0,          # standard
        },
        "GPS": {
            piexif.GPSIFD.GPSVersionID: (2, 3, 0, 0),
            piexif.GPSIFD.GPSLatitudeRef: gps_lat_ref,
            piexif.GPSIFD.GPSLatitude: gps_lat,
            piexif.GPSIFD.GPSLongitudeRef: gps_lon_ref,
            piexif.GPSIFD.GPSLongitude: gps_lon,
        },
        "1st": {},
    }

    exif_bytes = piexif.dump(exif_dict)

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality_val, exif=exif_bytes)
    Path(output_path).write_bytes(buf.getvalue())


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
    run_folder_id = await uploader._ensure_run_folder(run_id)

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
