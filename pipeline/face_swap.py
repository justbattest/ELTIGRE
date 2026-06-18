"""
pipeline/face_swap.py — Transplant de visage pixel-parfait via InsightFace.

Utilisé après le swap Seedream pour coller le vrai visage du modèle (Nina)
sur le résultat Seedream. Tourne côté serveur Railway — aucune installation
côté utilisateur.

Modèles téléchargés automatiquement au premier appel (~870 MB total) :
  - buffalo_l   (~300 MB) — détection + embedding de visage
  - inswapper_128.onnx (~570 MB) — moteur de swap

Les modèles sont mis en cache dans INSIGHTFACE_HOME (défaut /tmp/insightface_cache).
Sur Railway avec storage éphémère, le premier appel après un restart prend 2-4 min.
"""

import os
import cv2
import numpy as np
from pathlib import Path

# Cache persistant entre requêtes (peut être perdu au restart Railway)
_CACHE_DIR = os.environ.get("INSIGHTFACE_HOME", "/tmp/insightface_cache")

# Singletons pour éviter de recharger les modèles à chaque appel
_app = None
_swapper = None


def _get_app():
    global _app
    if _app is None:
        import insightface
        from insightface.app import FaceAnalysis
        os.makedirs(_CACHE_DIR, exist_ok=True)
        os.environ["INSIGHTFACE_HOME"] = _CACHE_DIR
        _app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        _app.prepare(ctx_id=0, det_size=(640, 640))
    return _app


def _get_swapper():
    global _swapper
    if _swapper is None:
        import insightface
        os.makedirs(_CACHE_DIR, exist_ok=True)
        os.environ["INSIGHTFACE_HOME"] = _CACHE_DIR
        _swapper = insightface.model_zoo.get_model(
            "inswapper_128.onnx",
            download=True,
            download_zip=True,
            root=_CACHE_DIR,
        )
    return _swapper


def swap_face(source_path: str, target_path: str, output_path: str) -> bool:
    """Transplante le visage de source_path sur target_path.

    Args:
        source_path: photo du modèle référence (Nina) — donneur de visage
        target_path: résultat Seedream — receveur (scène + pose + tenue)
        output_path: chemin où écrire le résultat

    Returns:
        True  — transplant réussi, résultat écrit dans output_path
        False — aucun visage détecté dans l'une des images (caller garde target_path)

    Raises:
        Exception — InsightFace non installé ou erreur critique
    """
    app = _get_app()
    swapper = _get_swapper()

    source_img = cv2.imread(source_path)
    target_img = cv2.imread(target_path)

    if source_img is None:
        raise ValueError(f"Impossible de lire source: {source_path}")
    if target_img is None:
        raise ValueError(f"Impossible de lire target: {target_path}")

    source_faces = app.get(source_img)
    target_faces = app.get(target_img)

    if not source_faces:
        return False  # Pas de visage détecté dans la photo modèle
    if not target_faces:
        return False  # Pas de visage dans le résultat Seedream

    # Visage le plus grand dans la photo source (le plus proche de la caméra)
    source_face = max(
        source_faces,
        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
    )

    # Transplanter sur tous les visages détectés dans le target
    result = target_img.copy()
    for face in target_faces:
        result = swapper.get(result, face, source_face, paste_back=True)

    cv2.imwrite(output_path, result)
    return True
