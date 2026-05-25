"""
Google Drive uploader — upload automatique des images source + générées.

Auth : OAuth2 Authorization Code Flow (refresh_token stocké en DB, passé via env var).
Pas de Service Account JSON à gérer — l'user connecte son compte Google
depuis Settings comme il connecte Higgsfield.

Structure Drive :
  <HYBRID CONTENT>/
    generations/
      <run_id>/
        source/<shortcode>.jpg      ← original Instagram
        generated/<shortcode>.jpg   ← output Higgsfield (scraping + studio)
    carousels/
      <run_id>/
        carousel_1/
          1.jpg  2.jpg  3.jpg  4.jpg
        carousel_2/
          ...
    video/
      Conférence/
        <run_id>/
          video_1.mp4
          video_2.mp4
          ...
"""

import asyncio
import json
import time
import httpx
import os
from pathlib import Path

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"


class DriveUploader:
    """Upload vers Google Drive via OAuth2 refresh token."""

    def __init__(self, refresh_token: str, folder_id: str, client_id: str, client_secret: str,
                 character_folder: str = ""):
        self.refresh_token = refresh_token
        self.folder_id = folder_id          # HYBRID CONTENT root
        self.client_id = client_id
        self.client_secret = client_secret
        # Nom du sous-dossier personnage (ex: "NINA HYBRID"). Vide = compat backward.
        self.character_folder = character_folder
        self._access_token: str | None = None
        self._token_expiry: float = 0
        # Cache des IDs de dossiers Drive pour éviter les appels API redondants
        # et les race conditions lors des générations parallèles (max 8 jobs simultanés).
        # Clé : "parent_id/name" → valeur : folder_id Drive
        self._folder_cache: dict[str, str] = {}
        self._folder_lock = asyncio.Lock()  # Protège la création concurrente de dossiers

    async def _get_access_token(self) -> str:
        """Rafraîchit l'access token si nécessaire."""
        if self._access_token and time.time() < self._token_expiry - 60:
            return self._access_token

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh_token,
                    "grant_type": "refresh_token",
                }
            )
            if not resp.is_success:
                err_body = resp.text[:300]
                print(json.dumps({
                    "type": "warn",
                    "msg": f"Drive token refresh failed [{resp.status_code}]: {err_body}"
                }), flush=True)
            resp.raise_for_status()
            data = resp.json()
            self._access_token = data["access_token"]
            self._token_expiry = time.time() + data.get("expires_in", 3600)
            return self._access_token

    async def _ensure_folder(self, name: str, parent_id: str) -> str:
        """Crée (ou réutilise) un sous-dossier nommé `name` dans `parent_id`.

        Thread-safe via double-checked locking : plusieurs générations parallèles peuvent
        appeler cette fonction simultanément pour le même carousel_N sans créer de doublons.
        """
        cache_key = f"{parent_id}/{name}"

        # Lecture rapide sans lock (cas courant : dossier déjà connu)
        if cache_key in self._folder_cache:
            return self._folder_cache[cache_key]

        # Lock pour éviter la race condition à la création
        async with self._folder_lock:
            # Double-check après acquisition du lock
            if cache_key in self._folder_cache:
                return self._folder_cache[cache_key]

            token = await self._get_access_token()
            headers = {"Authorization": f"Bearer {token}"}

            async with httpx.AsyncClient() as client:
                # Chercher si le dossier existe déjà dans Drive
                resp = await client.get(
                    DRIVE_FILES_URL,
                    headers=headers,
                    params={
                        "q": f"name='{name}' and '{parent_id}' in parents "
                             f"and mimeType='application/vnd.google-apps.folder' and trashed=false",
                        "fields": "files(id)",
                    }
                )
                resp.raise_for_status()
                files = resp.json().get("files", [])
                if files:
                    folder_id = files[0]["id"]
                else:
                    # Créer le sous-dossier
                    resp = await client.post(
                        DRIVE_FILES_URL,
                        headers=headers,
                        json={
                            "name": name,
                            "mimeType": "application/vnd.google-apps.folder",
                            "parents": [parent_id],
                        }
                    )
                    resp.raise_for_status()
                    folder_id = resp.json()["id"]

            self._folder_cache[cache_key] = folder_id
            return folder_id

    async def _ensure_character_folder(self) -> str:
        """Retourne l'ID du dossier personnage sous HYBRID CONTENT.

        Ex : HYBRID CONTENT/NINA HYBRID/
        Si character_folder est vide → retourne self.folder_id (compat backward).
        """
        if not self.character_folder:
            return self.folder_id
        return await self._ensure_folder(self.character_folder, self.folder_id)

    async def _ensure_generations_folder(self) -> str:
        """Crée (ou réutilise) le dossier 'generations' sous le dossier personnage."""
        char_id = await self._ensure_character_folder()
        return await self._ensure_folder("generations", char_id)

    async def _ensure_carousels_folder(self) -> str:
        """Crée (ou réutilise) le dossier 'carousels' sous le dossier personnage."""
        char_id = await self._ensure_character_folder()
        return await self._ensure_folder("carousels", char_id)

    async def _ensure_run_folder(self, run_id: str) -> str:
        """Crée (ou réutilise) le dossier d'un run sous generations/<run_id>."""
        generations_id = await self._ensure_generations_folder()
        return await self._ensure_folder(run_id, generations_id)

    async def _ensure_carousel_run_folder(self, run_id: str) -> str:
        """Crée (ou réutilise) le dossier d'un batch carousel sous carousels/<run_id>."""
        carousels_id = await self._ensure_carousels_folder()
        return await self._ensure_folder(run_id, carousels_id)

    # ── Video folders ──────────────────────────────────────────────────────────

    _NICHE_DISPLAY: dict[str, str] = {
        "conference": "Conférence",
    }

    async def _ensure_video_folder(self) -> str:
        """Crée (ou réutilise) le dossier 'video' sous le dossier personnage."""
        char_id = await self._ensure_character_folder()
        return await self._ensure_folder("video", char_id)

    async def _ensure_video_niche_folder(self, niche: str) -> str:
        """Crée (ou réutilise) le sous-dossier niche sous video/ (ex: 'Conférence')."""
        video_id = await self._ensure_video_folder()
        display = self._NICHE_DISPLAY.get(niche, niche.title())
        return await self._ensure_folder(display, video_id)

    async def _ensure_video_run_folder(self, run_id: str, niche: str) -> str:
        """Crée (ou réutilise) le dossier d'un run sous video/<niche>/<run_id>."""
        niche_id = await self._ensure_video_niche_folder(niche)
        return await self._ensure_folder(run_id, niche_id)

    async def upload_video(
        self,
        run_id: str,
        niche: str,
        shortcode: str,
        video_url: str,
    ) -> dict:
        """Télécharge la vidéo depuis video_url et l'uploade dans Drive.

        Structure : video/<niche>/<run_id>/<shortcode>.mp4
        """
        try:
            run_folder_id = await self._ensure_video_run_folder(run_id, niche)

            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.get(video_url)
                resp.raise_for_status()
                video_bytes = resp.content

            url = await self.upload_bytes(
                video_bytes,
                f"{shortcode}.mp4",
                run_folder_id,
                content_type="video/mp4",
            )
            print(json.dumps({
                "type": "info",
                "msg": f"Drive video upload OK [{shortcode}]: {url}"
            }), flush=True)
            return {"drive_video_url": url}

        except Exception as e:
            print(json.dumps({
                "type": "warn",
                "msg": f"Drive video upload ERREUR [{shortcode}]: {e}"
            }), flush=True)
            return {"drive_error": str(e)}

    async def upload_bytes(self, data: bytes, filename: str, parent_id: str, content_type: str = "image/jpeg") -> str:
        """Upload des bytes en multipart vers Drive. Retourne l'URL Drive."""
        token = await self._get_access_token()
        metadata = json.dumps({"name": filename, "parents": [parent_id]}).encode()
        ct_bytes = content_type.encode()

        body = (
            b"--boundary\r\n"
            b"Content-Type: application/json\r\n\r\n"
            + metadata
            + b"\r\n--boundary\r\n"
            b"Content-Type: " + ct_bytes + b"\r\n\r\n"
            + data
            + b"\r\n--boundary--"
        )

        timeout = 120 if content_type.startswith("video/") else 60
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id",
                content=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "multipart/related; boundary=boundary",
                }
            )
            resp.raise_for_status()
            file_id = resp.json()["id"]
            return f"https://drive.google.com/file/d/{file_id}/view"

    async def upload_generation(
        self,
        run_id: str,
        shortcode: str,
        local_image_path: str | None,
        generated_image_url: str | None,
        rank: int = 0,  # gardé pour compatibilité, non utilisé pour la structure Drive
    ) -> dict:
        """Upload la paire source + généré pour une génération.

        Structure Drive :
          generations/<run_id>/source/<shortcode>.jpg       ← original Instagram
          generations/<run_id>/generated/<shortcode>.jpg    ← output Higgsfield

        Toutes les générées dans un dossier plat → téléchargement facile,
        sélection manuelle pour le carousel creator.
        """
        try:
            run_folder_id = await self._ensure_run_folder(run_id)
            result = {}

            # Upload image source (depuis le disque local)
            if local_image_path and Path(local_image_path).exists():
                source_folder_id = await self._ensure_folder("source", run_folder_id)
                data = Path(local_image_path).read_bytes()
                url = await self.upload_bytes(data, f"{shortcode}.jpg", source_folder_id)
                result["drive_source_url"] = url
                print(json.dumps({
                    "type": "info",
                    "msg": f"Drive upload OK source [{shortcode}]: {url}"
                }), flush=True)
            elif local_image_path:
                print(json.dumps({
                    "type": "warn",
                    "msg": f"Drive source skip [{shortcode}]: fichier local introuvable ({local_image_path})"
                }), flush=True)

            # Télécharger + upload l'image générée dans generated/ (dossier plat)
            if generated_image_url:
                generated_folder_id = await self._ensure_folder("generated", run_folder_id)
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(generated_image_url)
                    resp.raise_for_status()
                    url = await self.upload_bytes(resp.content, f"{shortcode}.jpg", generated_folder_id)
                    result["drive_generated_url"] = url
                    print(json.dumps({
                        "type": "info",
                        "msg": f"Drive upload OK generated [{shortcode}]: {url}"
                    }), flush=True)

            return result

        except Exception as e:
            print(json.dumps({
                "type": "warn",
                "msg": f"Drive upload ERREUR [{shortcode}]: {e}"
            }), flush=True)
            return {"drive_error": str(e)}


# ── Singleton pipeline ─────────────────────────────────────────────────────────

_uploader: DriveUploader | None = None


def init_drive_uploader_from_env() -> DriveUploader | None:
    """Initialise l'uploader depuis les variables d'environnement."""
    global _uploader
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")
    folder_id = os.environ.get("DRIVE_FOLDER_ID")
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")

    character_folder = os.environ.get("CHARACTER_FOLDER_NAME", "")

    if refresh_token and folder_id and client_id and client_secret:
        _uploader = DriveUploader(refresh_token, folder_id, client_id, client_secret, character_folder)
        return _uploader
    return None


def get_uploader() -> DriveUploader | None:
    return _uploader
