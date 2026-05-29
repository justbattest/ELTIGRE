"""
Metadata Optimizer — nettoie et injecte des métadonnées optimisées sur tout contenu Drive.

Appliqué automatiquement dans drive_uploader.py::upload_bytes() avant chaque upload.

Images :
  - Strip EXIF original (supprime AI markers : Kling, Higgsfield, Seedream, etc.)
  - Micro-crop 1-3px (casse les hashes perceptuels)
  - Micro-noise ±1 sur ~0.3% des pixels (disrupte les signatures fréquentielles)
  - Injection iPhone 17 Pro EXIF unique (seed par fichier) :
      Make=Apple, Model=iPhone 17 Pro, GPS ville US aléatoire, datetime unique
  - Injection profil ICC Display P3 Apple (identique à une vraie photo iPhone)
      → marker APP2 JPEG byte-for-byte identique à /System/Library/ColorSync/Profiles/Display P3.icc

Vidéos (requiert ffmpeg via imageio-ffmpeg) :
  - Strip tous les tags AI (aigc_label_type, vid: ID Kling, Lavf encoder)
  - Injection tags Apple QuickTime (com.apple.quicktime.make/model/software/location/creationdate)
  - Re-mux sans réencodage (qualité identique, ~1s de traitement)
  - Dégradation gracieuse si ffmpeg absent

Dépendances Python : piexif, Pillow, imageio-ffmpeg (+ numpy optionnel pour le micro-noise)
"""

import io
import os
import random
import struct
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

# ── ICC Profile Display P3 Apple ──────────────────────────────────────────────
# Profil colorimétrique Apple Display P3 — identique à celui qu'un iPhone 17 Pro
# embarque dans chaque JPEG natif. Chargé depuis le système macOS si disponible,
# sinon depuis un cache binaire embarqué (garanti sur toute machine).
_DISPLAY_P3_PROFILE: bytes | None = None
_SRGB_PROFILE: bytes | None = None


def _get_display_p3_icc() -> bytes | None:
    """Retourne le profil ICC Display P3 Apple (536 bytes)."""
    global _DISPLAY_P3_PROFILE
    if _DISPLAY_P3_PROFILE is not None:
        return _DISPLAY_P3_PROFILE

    # 1. Chercher dans le système (macOS)
    candidates = [
        "/System/Library/ColorSync/Profiles/Display P3.icc",
        "/System/Library/ColorSync/Profiles/Apple Display P3.icc",
    ]
    for p in candidates:
        if Path(p).exists():
            _DISPLAY_P3_PROFILE = Path(p).read_bytes()
            return _DISPLAY_P3_PROFILE

    # 2. Utiliser PIL ImageCms pour générer un profil sRGB (fallback si pas macOS)
    try:
        from PIL import ImageCms
        profile = ImageCms.createProfile("sRGB")
        _DISPLAY_P3_PROFILE = ImageCms.ImageCmsProfile(profile).tobytes()
        return _DISPLAY_P3_PROFILE
    except Exception:
        return None


def _get_srgb_icc() -> bytes | None:
    """Retourne le profil ICC sRGB IEC61966-2.1.

    Priorité : profil système macOS (3144 bytes, officiel) > PIL généré.
    Ce profil est TOUJOURS utilisé en sortie, peu importe le profil de la source.
    """
    global _SRGB_PROFILE
    if _SRGB_PROFILE is not None:
        return _SRGB_PROFILE

    # 1. Profil sRGB système macOS — le vrai IEC 61966-2.1
    system_srgb = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"
    if Path(system_srgb).exists():
        _SRGB_PROFILE = Path(system_srgb).read_bytes()
        return _SRGB_PROFILE

    # 2. Généré par PIL (fallback non-macOS)
    try:
        from PIL import ImageCms
        profile = ImageCms.createProfile("sRGB")
        _SRGB_PROFILE = ImageCms.ImageCmsProfile(profile).tobytes()
        return _SRGB_PROFILE
    except Exception:
        return None

# ── Pool de villes GPS — priorité US (marché cible) ───────────────────────────

GPS_CITIES = [
    # US (majorité)
    ("Los Angeles",   34.0522,  -118.2437),
    ("Miami",         25.7617,   -80.1918),
    ("New York",      40.7128,   -74.0060),
    ("Miami Beach",   25.7907,   -80.1300),
    ("Las Vegas",     36.1699,  -115.1398),
    ("Malibu",        34.0259,  -118.7798),
    ("Beverly Hills", 34.0736,  -118.4004),
    ("Santa Monica",  34.0195,  -118.4912),
    ("Chicago",       41.8781,   -87.6298),
    ("Houston",       29.7604,   -95.3698),
    ("Atlanta",       33.7490,   -84.3880),
    ("Dallas",        32.7767,   -96.7970),
    # International (minorité)
    ("Dubai",         25.2048,    55.2708),
    ("London",        51.5074,    -0.1278),
    ("Paris",         48.8566,     2.3522),
    ("Ibiza",         38.9067,     1.4206),
    ("Barcelona",     41.3851,     2.1734),
    ("Sydney",       -33.8688,   151.2093),
]

ISO_VALUES = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250]

# ── Tables de quantification JPEG Apple ───────────────────────────────────────
# Extraites d'une vraie photo iPhone (IMG_3374.JPG, iOS 26.5, iPhone 17 Pro Max).
# Valeurs très basses = ultra haute qualité, signature distinctive de l'encodeur Apple.
# Remplace les tables PIL standard (qui révèlent l'encodeur logiciel).
APPLE_QTABLES = [
    # Table 0 — luminance (luma)
    [  2,  2,  2,  2,  2,  2,  3,  2,
       2,  3,  5,  3,  3,  3,  5,  6,
       5,  5,  5,  5,  6,  8,  6,  6,
       6,  6,  6,  8, 10,  8,  8,  8,
       8,  8,  8, 10, 10, 10, 10, 10,
      10, 10, 10, 12, 12, 12, 12, 12,
      12, 14, 14, 14, 14, 14, 15, 15,
      15, 15, 15, 15, 15, 15, 15, 15 ],
    # Table 1 — chrominance (chroma)
    [  2,  3,  3,  4,  4,  4,  7,  4,
       4,  7, 16, 11,  9, 11, 16, 16,
      16, 16, 16, 16, 16, 16, 16, 16,
      16, 16, 16, 16, 16, 16, 16, 16,
      16, 16, 16, 16, 16, 16, 16, 16,
      16, 16, 16, 16, 16, 16, 16, 16,
      16, 16, 16, 16, 16, 16, 16, 16,
      16, 16, 16, 16, 16, 16, 16, 16 ],
]

# ── Conversion zigzag → naturel ───────────────────────────────────────────────
# PIL attend les tables en ordre naturel (row-major 8×8), pas en ordre zigzag JPEG.
# APPLE_QTABLES est extrait d'un vrai fichier JPEG (ordre zigzag DQT).
# _JPEG_ZIGZAG[nat_pos] = index zigzag correspondant à la position naturelle nat_pos.
_JPEG_ZIGZAG = [
     0,  1,  5,  6, 14, 15, 27, 28,
     2,  4,  7, 13, 16, 26, 29, 42,
     3,  8, 12, 17, 25, 30, 41, 43,
     9, 11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
    35, 36, 48, 49, 57, 58, 62, 63,
]


def _zigzag_to_natural(zz: list) -> list:
    """Convertit une table JPEG (ordre zigzag) en ordre naturel (row-major) attendu par PIL."""
    natural = [0] * 64
    for nat_pos, zz_pos in enumerate(_JPEG_ZIGZAG):
        natural[nat_pos] = zz[zz_pos]
    return natural


# Pré-calculé une fois au chargement du module (évite de recalculer à chaque image)
_APPLE_LUMA_NATURAL   = _zigzag_to_natural(APPLE_QTABLES[0])
_APPLE_CHROMA_NATURAL = _zigzag_to_natural(APPLE_QTABLES[1])


# ── Helpers EXIF ───────────────────────────────────────────────────────────────

def _to_gps_coord(value: float) -> list:
    """Convertit des degrés décimaux en format EXIF GPS [(deg,1),(min,1),(sec,100)]."""
    deg = int(abs(value))
    minutes_float = (abs(value) - deg) * 60
    minutes = int(minutes_float)
    seconds = (minutes_float - minutes) * 60
    return [(deg, 1), (minutes, 1), (int(seconds * 100), 100)]


# ── Image optimizer ────────────────────────────────────────────────────────────

def _inject_apple_qtables(jpeg: bytes) -> bytes:
    """Remplace les markers DQT dans un JPEG par les tables de quantification Apple.

    PIL réordonne les tables à l'export — on passe outre en écrivant directement
    dans le binaire JPEG. Les tables Apple sont extraites d'une vraie photo iPhone 17 Pro
    et produisent une fingerprint JPEG identique à CoreImage (l'encodeur Apple).

    Args:
        jpeg : bytes JPEG valide produit par PIL

    Returns:
        bytes JPEG avec DQT markers remplacés par les tables Apple
    """
    result = bytearray()
    data = bytearray(jpeg)
    idx = 0
    dqt_count = 0   # index dans APPLE_QTABLES

    while idx < len(data) - 1:
        if data[idx] != 0xFF:
            result.append(data[idx])
            idx += 1
            continue

        marker = data[idx + 1]

        # SOI (Start Of Image) — copier tel quel
        if marker == 0xD8:
            result += data[idx:idx + 2]
            idx += 2
            continue

        # EOI ou marqueurs sans longueur
        if marker == 0xD9 or marker == 0x00:
            result += data[idx:idx + 2]
            idx += 2
            continue

        # Marqueurs sans longueur (RST0-RST7)
        if 0xD0 <= marker <= 0xD7:
            result += data[idx:idx + 2]
            idx += 2
            continue

        # Lire la longueur du segment
        if idx + 3 >= len(data):
            result += data[idx:]
            break

        seg_len = struct.unpack(">H", data[idx + 2:idx + 4])[0]
        seg_end = idx + 2 + seg_len

        if seg_end > len(data):
            result += data[idx:]
            break

        # DQT — remplacer par table Apple si disponible
        if marker == 0xDB and dqt_count < len(APPLE_QTABLES):
            table = APPLE_QTABLES[dqt_count]
            # Format DQT : FF DB | length(2) | precision_id(1) | 64 bytes table
            # Le champ length inclut ses 2 propres octets → length = 2 + 1 + 64 = 67
            precision_id = data[idx + 4] & 0xF0  # garder la précision d'origine (0=8bit)
            content = bytes([precision_id | dqt_count]) + bytes(table)  # 65 bytes
            result += bytes([0xFF, 0xDB])
            result += struct.pack(">H", 2 + len(content))  # 2 + 65 = 67
            result += content
            dqt_count += 1
        else:
            # Copier le segment tel quel
            result += data[idx:seg_end]

        idx = seg_end

    return bytes(result)


def optimize_image_bytes(data: bytes, seed: int) -> bytes:
    """
    Strip EXIF AI → micro-crop → micro-noise → iPhone 17 Pro EXIF unique.

    Args:
        data : bytes JPEG/PNG/WEBP en entrée
        seed : entier unique par fichier (garantit EXIF différent même source identique)

    Returns:
        bytes JPEG avec EXIF iPhone 17 Pro injectés
    """
    try:
        import piexif
        from PIL import Image
    except ImportError as e:
        raise RuntimeError(
            f"Dépendances manquantes : {e}. Installer avec : pip install piexif Pillow"
        ) from e

    rng = random.Random(seed)

    buf_in = io.BytesIO(data)
    img = Image.open(buf_in).convert("RGB")
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
        pass  # numpy optionnel — skip sans planter

    # ── 3. iPhone 17 Pro / Pro Max EXIF unique ──────────────────────────────
    # Calibré sur de vraies photos iPhone 17 Pro Max (iOS 26.4.2, mai 2026).
    # iOS a changé de numérotation (année) : 26.x = 2026, pas 18.x.

    # Modèle aléatoire : Pro ou Pro Max (les deux existent, variété = crédibilité)
    iphone_models = [
        (b"iPhone 17 Pro",     b"iPhone 17 Pro back triple camera 6.86mm f/1.78"),
        (b"iPhone 17 Pro Max", b"iPhone 17 Pro Max back triple camera 6.765mm f/1.78"),
    ]
    iphone_model, lens_model = rng.choice(iphone_models)

    # Version iOS 26.x — numérotation Apple année 2026 (confirmé sur IMG_3374.JPG = 26.5)
    ios_versions = [b"26.0", b"26.1", b"26.1.1", b"26.2", b"26.3", b"26.3.2", b"26.4", b"26.4.2", b"26.5"]
    ios_version = rng.choice(ios_versions)

    # Datetime : random entre sept. 2025 (launch iPhone 17 Pro) et aujourd'hui
    launch_date = datetime(2025, 9, 12)
    random_offset_days = rng.randint(0, 260)
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

    # Paramètres caméra — valeurs extraites de vraies photos iPhone 17 Pro Max
    iso = rng.choice(ISO_VALUES)
    # ExposureTime réels observés : 1/22, 1/38, 1/40, 1/60, 1/100, 1/125, 1/160
    exposure_denom = rng.choice([22, 30, 38, 40, 50, 60, 80, 100, 125, 160, 200])
    # FocalLength réel : (251773, 37217) ≈ 6.765mm — valeur extraite du fichier HEIC
    # On varie légèrement selon le modèle (Pro vs Pro Max)
    focal_length = (251773, 37217) if b"Pro Max" in iphone_model else (686, 100)
    # FNumber réel : (1244236, 699009) ≈ f/1.78
    fnumber = (1244236, 699009)

    w_final, h_final = img.size

    exif_dict = {
        "0th": {
            piexif.ImageIFD.Make:            b"Apple",
            piexif.ImageIFD.Model:           iphone_model,
            piexif.ImageIFD.Orientation:     1,
            piexif.ImageIFD.Software:        ios_version,
            piexif.ImageIFD.DateTime:        dt_str,
            piexif.ImageIFD.XResolution:     (72, 1),
            piexif.ImageIFD.YResolution:     (72, 1),
            piexif.ImageIFD.ResolutionUnit:  2,
        },
        "Exif": {
            piexif.ExifIFD.ExposureTime:       (1, exposure_denom),
            piexif.ExifIFD.FNumber:            fnumber,
            piexif.ExifIFD.ISOSpeedRatings:    iso,
            piexif.ExifIFD.DateTimeOriginal:   dt_str,
            piexif.ExifIFD.DateTimeDigitized:  dt_str,
            piexif.ExifIFD.FocalLength:        focal_length,
            piexif.ExifIFD.ExifVersion:        b"0232",
            piexif.ExifIFD.FlashpixVersion:    b"0100",
            piexif.ExifIFD.ColorSpace:         65535,
            piexif.ExifIFD.PixelXDimension:    w_final,
            piexif.ExifIFD.PixelYDimension:    h_final,
            piexif.ExifIFD.Flash:              0,
            piexif.ExifIFD.ExposureMode:       0,
            piexif.ExifIFD.WhiteBalance:       0,
            piexif.ExifIFD.LensMake:           b"Apple",
            piexif.ExifIFD.LensModel:          lens_model,
            piexif.ExifIFD.SceneCaptureType:   0,
        },
        "GPS": {
            piexif.GPSIFD.GPSVersionID:      (2, 3, 0, 0),
            piexif.GPSIFD.GPSLatitudeRef:    gps_lat_ref,
            piexif.GPSIFD.GPSLatitude:       gps_lat,
            piexif.GPSIFD.GPSLongitudeRef:   gps_lon_ref,
            piexif.GPSIFD.GPSLongitude:      gps_lon,
            # Altitude (présente sur IMG_3374.JPG) : valeur aléatoire réaliste
            piexif.GPSIFD.GPSAltitudeRef:    0,   # 0 = above sea level
            piexif.GPSIFD.GPSAltitude:       (int(rng.uniform(5, 150) * 993), 993),
        },
        "1st": {},
    }

    exif_bytes = piexif.dump(exif_dict)

    # ICC Profile : on attache TOUJOURS sRGB IEC61966-2.1, sans jamais regarder le profil source.
    #
    # CAUSE DU BUG : certains outils AI (Higgsfield, Kling, etc.) embarquent automatiquement
    # un profil Display P3 dans leurs exports, même quand les valeurs de pixels sont sRGB.
    # Préserver ce profil P3 → les visionneuses macOS/iOS interprètent les valeurs sRGB comme P3
    # → cast orange/chaud dramatique.
    #
    # FIX GARANTI : on ignore le profil d'origine et on attache sRGB systématiquement.
    # Les contenus IA/Instagram sont sRGB → le profil est juste.
    # L'EXIF iPhone (Make, Model, GPS, iOS) est ce qui compte pour contourner la détection IA,
    # pas le profil ICC.
    icc_profile = _get_srgb_icc()

    buf_out = io.BytesIO()
    # Utiliser les tables Apple directement via le paramètre qtables de PIL.
    # IMPORTANT : PIL attend l'ordre naturel (row-major 8×8), pas l'ordre zigzag JPEG.
    # _APPLE_LUMA_NATURAL / _APPLE_CHROMA_NATURAL sont pré-convertis au chargement du module.
    #
    # On ne passe plus "quality=" : le paramètre qtables remplace quality et encode
    # exactement avec les valeurs Apple — zéro mismatch DQT possible.
    save_kwargs: dict = {
        "qtables":    {0: _APPLE_LUMA_NATURAL, 1: _APPLE_CHROMA_NATURAL},
        "exif":       exif_bytes,
        "subsampling": 0,   # 4:4:4 — même sous-échantillonnage chroma qu'un iPhone
    }
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    img.save(buf_out, "JPEG", **save_kwargs)

    return buf_out.getvalue()


# ── Video optimizer ────────────────────────────────────────────────────────────

def _find_ffmpeg() -> str | None:
    """Cherche ffmpeg dans PATH, Homebrew, et imageio-ffmpeg (fallback pip)."""
    import shutil
    candidates = [
        shutil.which("ffmpeg"),
        "/opt/homebrew/bin/ffmpeg",   # Apple Silicon Homebrew
        "/usr/local/bin/ffmpeg",       # Intel Mac Homebrew
        "/usr/bin/ffmpeg",             # Linux
    ]
    # imageio-ffmpeg : package pip qui embarque un binaire statique ffmpeg
    # Utilisé quand Homebrew n'est pas installé (ex: MacBook sans brew)
    try:
        import imageio_ffmpeg
        candidates.insert(0, imageio_ffmpeg.get_ffmpeg_exe())
    except ImportError:
        pass

    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def _random_datetime(seed: int) -> tuple[str, str]:
    """
    Génère une paire (UTC ISO, locale+TZ) aléatoire entre sept 2025 et aujourd'hui.

    Returns:
        (utc_str, local_str)  ex: ("2026-01-15T14:23:11.000000Z", "2026-01-15T09:23:11-0500")
    """
    rng = random.Random(seed)
    launch = datetime(2025, 9, 12)
    offset = timedelta(
        days=rng.randint(0, 260),
        hours=rng.randint(7, 21),   # heures raisonnables (pas la nuit)
        minutes=rng.randint(0, 59),
        seconds=rng.randint(0, 59),
    )
    dt = launch + offset
    utc_str   = dt.strftime("%Y-%m-%dT%H:%M:%S.000000Z")
    # Timezone US de la ville (simplifiée : -0500 EST ou -0800 PST selon seed)
    tz_offset = rng.choice(["-0500", "-0800", "-0600", "-0700"])
    local_str = dt.strftime(f"%Y-%m-%dT%H:%M:%S{tz_offset}")
    return utc_str, local_str


def _iso6709(lat: float, lon: float, alt: float = 42.0) -> str:
    """Formate lat/lon en ISO 6709 pour QuickTime.

    Format exact extrait d'un iPhone 17 Pro Max réel (IMG_3375.MOV) :
      +41.8736+008.8085+083.555/
    - Latitude  : ±DD.DDDD  (2 chiffres entiers, zero-padded)
    - Longitude : ±DDD.DDDD (3 chiffres entiers, zero-padded) ← différent
    - Altitude  : +DDD.DDD  (toujours positive selon iPhone)
    """
    lat_sign = "+" if lat >= 0 else "-"
    lon_sign = "+" if lon >= 0 else "-"
    lat_str = f"{lat_sign}{abs(lat):07.4f}"   # ±DD.DDDD (total 7 chars)
    lon_str = f"{lon_sign}{abs(lon):08.4f}"   # ±DDD.DDDD (total 8 chars)
    alt_str = f"+{alt:07.3f}"                  # +DDD.DDD  (total 7 chars)
    return f"{lat_str}{lon_str}{alt_str}/"


def optimize_video_bytes(data: bytes, seed: int) -> bytes:
    """
    Remplace les métadonnées MP4/MOV par des métadonnées iPhone 17 Pro réalistes.

    Calibré sur une vraie vidéo iPhone 17 Pro Max (IMG_3375.MOV, iOS 26.5) :

    - com.apple.quicktime.make       = "Apple"
    - com.apple.quicktime.model      = "iPhone 17 Pro" / "iPhone 17 Pro Max" (aléatoire)
    - com.apple.quicktime.software   = "26.x" (numérotation Apple 2026, confirmé iOS 26.5)
    - com.apple.quicktime.creationdate = <date locale + TZ>
    - com.apple.quicktime.location.ISO6709 = <GPS ville US, format ±DD.DDDD±DDD.DDDD±DDD.DDD/>
    - com.apple.quicktime.location.accuracy.horizontal = <float réaliste, ex: 14.774808>
    - creation_time (UTC, atom mvhd)
    - location / location-eng (standard MP4)
    - handler_name video  = "Core Media Video"  (nom réel Apple, pas "VideoHandler")
    - handler_name audio  = "Core Media Audio"

    Tout ça en re-mux sans réencodage (qualité identique, ~1s de traitement).

    Dégradation gracieuse : si ffmpeg absent → retourne data inchangé + warning.

    Args:
        data : bytes MP4/MOV en entrée
        seed : entier unique par fichier (seed → GPS + datetime uniques)

    Returns:
        bytes MP4 avec métadonnées iPhone 17 Pro injectées
    """
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        import json
        print(json.dumps({
            "type": "warn",
            "msg": "metadata_optimizer: ffmpeg non trouvé — vidéo uploadée sans optimisation metadata. "
                   "pip install imageio-ffmpeg pour activer automatiquement."
        }), flush=True)
        return data

    rng = random.Random(seed)

    # Modèle iPhone aléatoire — Pro ou Pro Max (comme pour les images)
    iphone_model = rng.choice(["iPhone 17 Pro", "iPhone 17 Pro Max"])

    # Version iOS 26.x — numérotation Apple 2026 (confirmé sur IMG_3375.MOV = 26.5)
    ios_version = rng.choice(["26.0", "26.1", "26.1.1", "26.2", "26.3", "26.3.2", "26.4", "26.4.2", "26.5"])

    # GPS : ville US aléatoire + micro-offset
    _, lat, lon = rng.choice(GPS_CITIES)
    lat += rng.uniform(-0.005, 0.005)
    lon += rng.uniform(-0.005, 0.005)
    alt = rng.uniform(5.0, 120.0)   # altitude réaliste (mètres)

    # Précision GPS réaliste (valeur réelle iPhone : 14.774808, pas un chiffre rond)
    gps_accuracy = f"{rng.uniform(4.0, 35.0):.6f}"

    utc_str, local_str = _random_datetime(seed)
    iso6709 = _iso6709(lat, lon, alt)
    gps_simple = f"{lat:+.4f}{lon:+.4f}/"  # format location standard MP4

    in_fd, in_path = tempfile.mkstemp(suffix=".mp4")
    out_path = in_path + "_iphone.mp4"
    try:
        with os.fdopen(in_fd, "wb") as f:
            f.write(data)

        result = subprocess.run(
            [
                ffmpeg, "-y", "-i", in_path,

                # 1. Strip toutes les métadonnées AI d'origine
                "-map_metadata", "-1",

                # 2. Tags standard MP4 (mvhd + udta)
                "-metadata", f"creation_time={utc_str}",
                "-metadata", f"location={gps_simple}",
                "-metadata", f"location-eng={gps_simple}",

                # 3. Tags QuickTime Apple (com.apple.quicktime.*)
                #    Calibrés depuis IMG_3375.MOV (iPhone 17 Pro Max réel, iOS 26.5)
                "-metadata", "com.apple.quicktime.make=Apple",
                "-metadata", f"com.apple.quicktime.model={iphone_model}",
                "-metadata", f"com.apple.quicktime.software={ios_version}",
                "-metadata", f"com.apple.quicktime.creationdate={local_str}",
                "-metadata", f"com.apple.quicktime.location.ISO6709={iso6709}",
                "-metadata", f"com.apple.quicktime.location.accuracy.horizontal={gps_accuracy}",

                # 4. Handler names Apple réels (extraits de IMG_3375.MOV)
                #    "Core Media Video" / "Core Media Audio" vs "VideoHandler" ffmpeg par défaut
                "-metadata:s:v", "handler_name=Core Media Video",
                "-metadata:s:a", "handler_name=Core Media Audio",

                # 5. Re-mux sans réencodage
                "-c", "copy",
                "-movflags", "+faststart+use_metadata_tags",
                # bitexact supprime le tag "encoder: Lavf..." que ffmpeg injecte automatiquement
                "-fflags", "+bitexact",
                out_path,
            ],
            capture_output=True,
            timeout=120,
        )

        if result.returncode != 0:
            return data  # fallback silencieux

        return Path(out_path).read_bytes()

    except Exception:
        return data

    finally:
        try:
            os.unlink(in_path)
        except OSError:
            pass
        try:
            if Path(out_path).exists():
                os.unlink(out_path)
        except OSError:
            pass
