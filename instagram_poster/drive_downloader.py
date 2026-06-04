"""
Drive Downloader — télécharge des fichiers depuis Google Drive.

Utilise les mêmes credentials Google que le pipeline principal
(GOOGLE_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET).

Méthode : OAuth2 Refresh Token (pas de service account).
"""

import os
import tempfile
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

# Endpoints Google OAuth2
TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files/{file_id}"
DRIVE_DOWNLOAD_URL = "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"


class DriveDownloader:
    """Télécharge des fichiers depuis Google Drive via OAuth2 Refresh Token."""

    def __init__(self, refresh_token: str, client_id: str, client_secret: str):
        self.refresh_token = refresh_token
        self.client_id = client_id
        self.client_secret = client_secret
        self._access_token: str | None = None
        self._token_expiry: float = 0.0

    def _get_access_token(self) -> str:
        """Obtient ou rafraîchit l'access token."""
        import time
        if self._access_token and time.time() < self._token_expiry - 60:
            return self._access_token

        resp = requests.post(TOKEN_URL, data={
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        import time as _time
        self._access_token = data["access_token"]
        self._token_expiry = _time.time() + data.get("expires_in", 3600)
        return self._access_token

    def get_file_metadata(self, file_id: str) -> dict:
        """Récupère les métadonnées d'un fichier Drive."""
        token = self._get_access_token()
        resp = requests.get(
            DRIVE_FILE_URL.format(file_id=file_id),
            headers={"Authorization": f"Bearer {token}"},
            params={"fields": "id,name,mimeType,size"},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()

    def download_file(self, file_id: str, dest_path: str | None = None) -> str:
        """
        Télécharge un fichier Drive vers un chemin local.

        Args:
            file_id: ID du fichier Google Drive
            dest_path: Chemin de destination (optionnel — crée un fichier temp si None)

        Returns:
            Le chemin local du fichier téléchargé.

        Raises:
            requests.HTTPError: Si le fichier n'existe pas ou access refusé.
            IOError: Si impossible d'écrire le fichier.
        """
        # Récupérer les métadonnées pour avoir le nom + extension
        meta = self.get_file_metadata(file_id)
        filename = meta.get("name", f"media_{file_id}")
        mime_type = meta.get("mimeType", "video/mp4")

        # Déterminer l'extension depuis le nom ou le mime type
        if not dest_path:
            ext = Path(filename).suffix or _mime_to_ext(mime_type)
            tmp = tempfile.NamedTemporaryFile(
                suffix=ext, prefix="ig_poster_", delete=False
            )
            dest_path = tmp.name
            tmp.close()

        logger.info(f"Téléchargement Drive {file_id} ({filename}) → {dest_path}")

        token = self._get_access_token()
        resp = requests.get(
            DRIVE_DOWNLOAD_URL.format(file_id=file_id),
            headers={"Authorization": f"Bearer {token}"},
            stream=True,
            timeout=120
        )
        resp.raise_for_status()

        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        size_mb = os.path.getsize(dest_path) / (1024 * 1024)
        logger.info(f"Téléchargé {size_mb:.1f} MB → {dest_path}")
        return dest_path

    def download_from_url(self, url: str, dest_path: str | None = None) -> str:
        """
        Télécharge depuis une URL Drive shareable (format: drive.google.com/file/d/ID/view).
        Tente d'abord un téléchargement public (sans auth), puis OAuth si échec.
        """
        file_id = _extract_drive_id(url)
        if not file_id:
            raise ValueError(f"Impossible d'extraire l'ID Drive depuis : {url}")
        # Essai téléchargement public d'abord (plus simple, pas besoin de token)
        try:
            return download_public(file_id, dest_path)
        except Exception as e:
            logger.warning(f"Téléchargement public échoué ({e}), tentative OAuth...")
            return self.download_file(file_id, dest_path)


def download_public(file_id: str, dest_path: str | None = None) -> str:
    """
    Télécharge un fichier Google Drive via lien public (sans OAuth).
    Fonctionne si le fichier est partagé "anyone with link".
    Gère automatiquement la confirmation Google pour les gros fichiers.
    """
    import tempfile

    if not dest_path:
        tmp = tempfile.NamedTemporaryFile(suffix=".tmp", prefix="ig_poster_", delete=False)
        dest_path = tmp.name
        tmp.close()

    session = requests.Session()

    # Tentative directe
    download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    resp = session.get(download_url, stream=True, timeout=120)

    # Google affiche une page de confirmation pour les gros fichiers
    if "text/html" in resp.headers.get("Content-Type", ""):
        # Extraire le token de confirmation
        import re
        confirm_match = re.search(r'confirm=([0-9A-Za-z_-]+)', resp.text)
        if confirm_match:
            confirm = confirm_match.group(1)
        else:
            # Nouvelle méthode Google (2023+)
            confirm = "t"
        download_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm={confirm}"
        resp = session.get(download_url, stream=True, timeout=120)

    resp.raise_for_status()

    # Détecter l'extension depuis Content-Disposition ou Content-Type
    content_type = resp.headers.get("Content-Type", "")
    if dest_path.endswith(".tmp"):
        ext = _mime_to_ext(content_type.split(";")[0].strip())
        dest_path = dest_path.replace(".tmp", ext)

    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    size_mb = os.path.getsize(dest_path) / (1024 * 1024)
    logger.info(f"Téléchargement public OK : {size_mb:.1f} MB → {dest_path}")
    return dest_path


def _mime_to_ext(mime_type: str) -> str:
    """Retourne l'extension de fichier pour un MIME type."""
    mapping = {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    return mapping.get(mime_type, ".bin")


def _extract_drive_id(url: str) -> str | None:
    """Extrait l'ID d'un fichier Google Drive depuis diverses formes d'URL."""
    import re
    patterns = [
        r"/file/d/([a-zA-Z0-9_-]+)",     # /file/d/ID/view
        r"id=([a-zA-Z0-9_-]+)",           # ?id=ID
        r"open\?id=([a-zA-Z0-9_-]+)",    # open?id=ID
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    # Si l'URL est déjà un ID pur
    if re.match(r"^[a-zA-Z0-9_-]{25,}$", url):
        return url
    return None


def init_from_env() -> DriveDownloader | None:
    """Initialise le downloader depuis les variables d'environnement."""
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")

    if not all([refresh_token, client_id, client_secret]):
        logger.warning("Credentials Google Drive manquants — download Drive désactivé")
        return None

    return DriveDownloader(refresh_token, client_id, client_secret)
