"""
Google Drive uploader — upload automatique des images source + générées.

Auth : OAuth2 Authorization Code Flow (refresh_token stocké en DB, passé via env var).
Pas de Service Account JSON à gérer — l'user connecte son compte Google
depuis Settings comme il connecte Higgsfield.

Les fichiers sont organisés dans Drive :
  <folder>/<run_id>/source/<shortcode>.jpg
  <folder>/<run_id>/generated/<shortcode>.jpg
"""

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

    def __init__(self, refresh_token: str, folder_id: str, client_id: str, client_secret: str):
        self.refresh_token = refresh_token
        self.folder_id = folder_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._access_token: str | None = None
        self._token_expiry: float = 0

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
        """Crée (ou réutilise) un sous-dossier nommé `name` dans `parent_id`."""
        token = await self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient() as client:
            # Chercher si le dossier existe déjà
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
                return files[0]["id"]

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
            return resp.json()["id"]

    async def _ensure_run_folder(self, run_id: str) -> str:
        """Crée (ou réutilise) le dossier racine pour ce run dans Drive."""
        return await self._ensure_folder(run_id, self.folder_id)

    async def upload_bytes(self, data: bytes, filename: str, parent_id: str) -> str:
        """Upload des bytes en multipart vers Drive. Retourne l'URL Drive."""
        token = await self._get_access_token()
        metadata = json.dumps({"name": filename, "parents": [parent_id]}).encode()

        body = (
            b"--boundary\r\n"
            b"Content-Type: application/json\r\n\r\n"
            + metadata
            + b"\r\n--boundary\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + data
            + b"\r\n--boundary--"
        )

        async with httpx.AsyncClient(timeout=60) as client:
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
    ) -> dict:
        """Upload la paire source + généré pour une génération.

        Structure Drive :
          <folder>/<run_id>/source/<shortcode>.jpg
          <folder>/<run_id>/generated/<shortcode>.jpg
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

            # Télécharger + upload l'image générée (URL Higgsfield)
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

    if refresh_token and folder_id and client_id and client_secret:
        _uploader = DriveUploader(refresh_token, folder_id, client_id, client_secret)
        return _uploader
    return None


def get_uploader() -> DriveUploader | None:
    return _uploader
