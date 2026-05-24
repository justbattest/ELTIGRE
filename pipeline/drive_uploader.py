"""
Google Drive uploader — upload automatique des images source + générées.

Setup :
  1. Créer un projet Google Cloud Console
  2. Activer l'API Google Drive
  3. Créer un Service Account + télécharger le JSON credentials
  4. Partager votre dossier Drive avec l'email du Service Account
  5. Coller le contenu JSON dans Settings → Google Drive Credentials
  6. Entrer le Folder ID dans Settings → Google Drive Folder ID

Les fichiers sont organisés dans Drive :
  <folder>/<run_id>/<shortcode>_source.jpg
  <folder>/<run_id>/<shortcode>_generated.jpg
"""

import json
import os
import httpx
import asyncio
from pathlib import Path


class DriveUploader:
    """Upload vers Google Drive via Service Account."""

    def __init__(self, credentials_json: str, folder_id: str):
        """
        Args:
            credentials_json: Contenu JSON du fichier service account
            folder_id: ID du dossier Drive cible (dans l'URL Drive)
        """
        self.folder_id = folder_id
        self._credentials_json = credentials_json
        self._access_token: str | None = None
        self._token_expiry: float = 0

    async def _get_access_token(self) -> str:
        """Obtient un access token via JWT Service Account."""
        import time
        import json as _json
        import base64
        import hashlib
        import hmac

        # Vérifier si le token est encore valide (avec 60s de marge)
        if self._access_token and time.time() < self._token_expiry - 60:
            return self._access_token

        creds = _json.loads(self._credentials_json)
        now = int(time.time())

        # Construire le JWT
        header = base64.urlsafe_b64encode(
            _json.dumps({"alg": "RS256", "typ": "JWT"}).encode()
        ).rstrip(b"=").decode()

        payload = base64.urlsafe_b64encode(
            _json.dumps({
                "iss": creds["client_email"],
                "scope": "https://www.googleapis.com/auth/drive.file",
                "aud": "https://oauth2.googleapis.com/token",
                "exp": now + 3600,
                "iat": now,
            }).encode()
        ).rstrip(b"=").decode()

        # Signer avec la clé privée RSA
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        private_key = serialization.load_pem_private_key(
            creds["private_key"].encode(), password=None
        )
        signing_input = f"{header}.{payload}".encode()
        signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
        sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

        jwt_token = f"{header}.{payload}.{sig_b64}"

        # Échanger contre un access token
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": jwt_token,
                }
            )
            resp.raise_for_status()
            data = resp.json()
            self._access_token = data["access_token"]
            self._token_expiry = now + data.get("expires_in", 3600)
            return self._access_token

    async def _ensure_run_folder(self, run_id: str) -> str:
        """Crée (ou réutilise) un sous-dossier pour ce run."""
        token = await self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}

        # Chercher si le dossier existe déjà
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/drive/v3/files",
                headers=headers,
                params={
                    "q": f"name='{run_id}' and '{self.folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
                    "fields": "files(id)",
                }
            )
            resp.raise_for_status()
            files = resp.json().get("files", [])
            if files:
                return files[0]["id"]

            # Créer le dossier
            resp = await client.post(
                "https://www.googleapis.com/drive/v3/files",
                headers=headers,
                json={
                    "name": run_id,
                    "mimeType": "application/vnd.google-apps.folder",
                    "parents": [self.folder_id],
                }
            )
            resp.raise_for_status()
            return resp.json()["id"]

    async def upload_file(self, file_path: str, filename: str, parent_folder_id: str) -> str:
        """Upload un fichier image vers Drive. Retourne l'URL de visualisation."""
        token = await self._get_access_token()
        data = Path(file_path).read_bytes()

        async with httpx.AsyncClient(timeout=60) as client:
            # Multipart upload
            metadata = json.dumps({
                "name": filename,
                "parents": [parent_folder_id],
            })
            body = (
                b"--boundary\r\n"
                b"Content-Type: application/json\r\n\r\n"
                + metadata.encode()
                + b"\r\n--boundary\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + data
                + b"\r\n--boundary--"
            )
            resp = await client.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
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

        Returns:
            dict avec drive_source_url et drive_generated_url
        """
        try:
            run_folder_id = await self._ensure_run_folder(run_id)
            result = {}

            # Upload image source (locale)
            if local_image_path and Path(local_image_path).exists():
                src_name = f"{shortcode}_source.jpg"
                url = await self.upload_file(local_image_path, src_name, run_folder_id)
                result["drive_source_url"] = url

            # Télécharger + upload l'image générée (Higgsfield URL)
            if generated_image_url:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(generated_image_url)
                    resp.raise_for_status()
                    # Sauver temporairement
                    tmp_path = Path(f"/tmp/{shortcode}_generated.jpg")
                    tmp_path.write_bytes(resp.content)
                    gen_name = f"{shortcode}_generated.jpg"
                    url = await self.upload_file(str(tmp_path), gen_name, run_folder_id)
                    tmp_path.unlink(missing_ok=True)
                    result["drive_generated_url"] = url

            return result

        except Exception as e:
            return {"drive_error": str(e)}


# ── Singleton géré par le pipeline ───────────────────────────────────────────

_uploader: DriveUploader | None = None


def init_drive_uploader(credentials_json: str, folder_id: str) -> DriveUploader:
    global _uploader
    _uploader = DriveUploader(credentials_json, folder_id)
    return _uploader


def get_uploader() -> DriveUploader | None:
    return _uploader
