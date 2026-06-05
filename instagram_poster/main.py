"""
Main — boucle de polling principale du Mac Poster.

Flow :
1. Poll /api/instagram/pending toutes les 30s
2. Si post disponible → lock (status=processing déjà set par Railway)
3. Identifier le compte + le réseau hotspot
4. Switch WiFi vers le bon hotspot
5. Télécharger le fichier depuis Drive
6. Poster via instagrapi
7. Reporter le résultat à Railway
8. Nettoyer le fichier temporaire
9. Répéter

Résilience :
- queue.json : sauvegarde le post courant pour survivre aux reboots
- Lock file : évite les instances multiples
- Retry expo backoff si Railway unreachable
- Logs rotatifs par jour dans logs/

Pour démarrer : python main.py
Pour setup LaunchAgent : ./install.sh
"""

import json
import logging
import logging.handlers
import os
import sys
import time
import random
import fcntl
import tempfile
import requests
from pathlib import Path
from datetime import datetime

# Ajouter le répertoire du script au path
sys.path.insert(0, str(Path(__file__).parent))

import poster
import network_switcher
import drive_downloader
from keepalive import KeepaliveManager

# ─── Configuration ───────────────────────────────────────────────────────────

CONFIG_FILE = Path(__file__).parent / "config.json"
QUEUE_FILE = Path(__file__).parent / "queue.json"
LOCK_FILE = Path(tempfile.gettempdir()) / "instagram_poster.lock"
LOGS_DIR = Path(__file__).parent / "logs"

POLL_INTERVAL = 30        # secondes entre deux polls
RETRY_BACKOFF = [30, 60, 120, 300]  # backoff expo si Railway unreachable


# ─── Logging ─────────────────────────────────────────────────────────────────

def setup_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / f"poster_{datetime.now().strftime('%Y-%m-%d')}.log"

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Console
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S"))
    root.addHandler(console)

    # Fichier (rotatif à minuit)
    file_handler = logging.handlers.TimedRotatingFileHandler(
        log_file, when="midnight", backupCount=14
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s — %(message)s"
    ))
    root.addHandler(file_handler)

logger = logging.getLogger(__name__)


# ─── Lock file (évite les instances multiples) ────────────────────────────────

def acquire_lock() -> int:
    """Acquiert le lock file. Retourne le fd ou raise si déjà lock."""
    fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd.write(str(os.getpid()))
        fd.flush()
        logger.info(f"Lock acquis (PID {os.getpid()})")
        return fd
    except OSError:
        fd.close()
        raise RuntimeError(
            f"Une autre instance du poster tourne déjà. "
            f"Si ce n'est pas le cas, supprimer {LOCK_FILE}"
        )


# ─── Config ───────────────────────────────────────────────────────────────────

def load_config() -> dict:
    if not CONFIG_FILE.exists():
        raise FileNotFoundError(
            f"config.json introuvable. Copier config.example.json → config.json "
            f"et remplir les valeurs."
        )
    with open(CONFIG_FILE) as f:
        return json.load(f)


# ─── Queue persistante ────────────────────────────────────────────────────────

def save_queue(post_data: dict | None) -> None:
    """Sauvegarde le post courant pour survivre aux reboots."""
    if post_data is None:
        QUEUE_FILE.unlink(missing_ok=True)
    else:
        with open(QUEUE_FILE, "w") as f:
            json.dump(post_data, f)


def load_queue() -> dict | None:
    """Charge le post en attente (si le script a redémarré)."""
    if QUEUE_FILE.exists():
        try:
            with open(QUEUE_FILE) as f:
                return json.load(f)
        except Exception:
            QUEUE_FILE.unlink(missing_ok=True)
    return None


# ─── API Railway ──────────────────────────────────────────────────────────────

def api_get_pending(config: dict) -> dict | None:
    """Poll /api/instagram/pending. Retourne le post ou None."""
    url = config["railway_url"].rstrip("/") + "/api/instagram/pending"
    headers = {"Authorization": f"Bearer {config['mac_api_token']}"}

    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 204:
        return None  # Rien à faire
    resp.raise_for_status()
    return resp.json()


def api_report_result(config: dict, post_id: str, result: dict) -> None:
    """Reporte le résultat d'un post à Railway."""
    url = config["railway_url"].rstrip("/") + "/api/instagram/result"
    headers = {
        "Authorization": f"Bearer {config['mac_api_token']}",
        "Content-Type": "application/json",
    }
    payload = {
        "postId": post_id,
        "status": "posted" if result.get("success") else "failed",
        "igPostId": result.get("ig_post_id"),
        "errorMessage": result.get("error"),
        "accountStatus": result.get("account_status"),
        "sessionJson": result.get("session_json"),  # Session mise à jour
    }
    resp = requests.patch(url, json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    logger.info(f"Résultat reporté à Railway: {payload['status']}")


# ─── Process post ─────────────────────────────────────────────────────────────

def process_post(pending: dict, config: dict) -> None:
    """Traite un post en attente de bout en bout."""
    post_data = pending["post"]
    account_data = pending["account"]

    post_id = post_data["id"]
    account_id = account_data["id"]
    username = account_data["username"]
    password = account_data["password"] or ""
    totp_secret = account_data.get("totpSecret")  # Secret TOTP depuis la DB (décrypté par Railway)
    network_name_key = account_data["networkName"]
    caption = post_data.get("caption") or ""
    media_type = post_data.get("mediaType", "reel")
    drive_file_id = post_data.get("driveFileId")
    drive_file_url = post_data.get("driveFileUrl")

    logger.info(f"Processing post {post_id} → @{username} ({media_type})")

    # Sauvegarder dans la queue locale (résilience reboot)
    save_queue({"post_id": post_id, "pending": pending})

    # 1. Identifier le WiFi hotspot
    wifi_name = config.get("networks", {}).get(network_name_key, network_name_key)
    logger.info(f"Réseau cible: {wifi_name} ({network_name_key})")

    # 2. Switch vers le bon hotspot (ou vérifier que l'IP actuelle est déjà carrier)
    try:
        ip = network_switcher.switch_to_network(wifi_name)
        logger.info(f"Connecté à {wifi_name} — IP: {ip}")
    except ConnectionError as e:
        # WiFi switch échoué — vérifier si on est déjà sur une IP carrier (USB tethering)
        logger.warning(f"WiFi switch échoué: {e} — vérification IP actuelle...")
        current_ip = network_switcher.get_public_ip()
        try:
            network_switcher._validate_carrier_ip(current_ip, "current (USB/tethering)")
            logger.info(f"IP actuelle valide (USB tethering) : {current_ip} — on continue")
        except ValueError:
            logger.error(f"IP datacenter ou pas de connexion. Vérifier le partage de connexion iPhone.")
            api_report_result(config, post_id, {
                "success": False,
                "error": f"Hotspot introuvable et IP actuelle non carrier ({current_ip}). Vérifier partage de connexion iPhone.",
            })
            save_queue(None)
            return
    except ValueError as e:
        logger.error(f"IP suspecte après switch: {e}")
        api_report_result(config, post_id, {"success": False, "error": str(e)})
        save_queue(None)
        return

    # 3. Télécharger le(s) fichier(s) depuis Drive
    drive_files_json = post_data.get("driveFilesJson")
    media_path = None   # str pour video/photo, list[str] pour carousel
    tmp_files = []      # fichiers temporaires à nettoyer après le post

    try:
        if media_type == "carousel" and drive_files_json:
            # Carousel : télécharger chaque image de la liste
            import json as _json
            urls = _json.loads(drive_files_json) if isinstance(drive_files_json, str) else drive_files_json
            logger.info(f"Carousel : {len(urls)} images à télécharger")
            paths = []
            for url in urls:
                try:
                    file_id = drive_downloader._extract_drive_id(url)
                    if file_id:
                        p = drive_downloader.download_public(file_id)
                    else:
                        p = drive_downloader.download_public(url)
                    paths.append(p)
                    tmp_files.append(p)
                except Exception as dl_err:
                    logger.error(f"Erreur download image carousel {url}: {dl_err}")
                    raise
            media_path = paths

        elif drive_file_url:
            # Video/photo : URL Drive unique
            try:
                file_id = drive_downloader._extract_drive_id(drive_file_url)
                if file_id:
                    media_path = drive_downloader.download_public(file_id)
                else:
                    media_path = drive_downloader.download_public(drive_file_url)
                tmp_files.append(media_path)
            except Exception as pub_err:
                logger.warning(f"Download public échoué: {pub_err} — tentative OAuth...")
                downloader = _get_downloader(config)
                if downloader:
                    media_path = downloader.download_from_url(drive_file_url)
                    tmp_files.append(media_path)

        elif drive_file_id:
            try:
                media_path = drive_downloader.download_public(drive_file_id)
                tmp_files.append(media_path)
            except Exception as pub_err:
                logger.warning(f"Download public échoué: {pub_err} — tentative OAuth...")
                downloader = _get_downloader(config)
                if downloader:
                    media_path = downloader.download_file(drive_file_id)
                    tmp_files.append(media_path)

        if not media_path:
            raise ValueError("Impossible de télécharger le fichier (ni URL ni file_id valide)")
    except Exception as e:
        logger.error(f"Erreur téléchargement Drive: {e}")
        api_report_result(config, post_id, {
            "success": False,
            "error": f"Erreur téléchargement Drive: {e}",
        })
        save_queue(None)
        return

    # 4. Poster
    try:
        result = poster.post(
            account_id=account_id,
            username=username,
            password=password,
            totp_secret=totp_secret,
            media_path=media_path,
            caption=caption,
            media_type=media_type,
            config=config,
        )
    except Exception as e:
        logger.exception(f"Erreur inattendue lors du post: {e}")
        result = {"success": False, "error": str(e)}
    finally:
        # Nettoyer les fichiers temporaires (video/photo ou les 4 images carousel)
        for tmp in tmp_files:
            if tmp and os.path.exists(tmp):
                try:
                    os.unlink(tmp)
                    logger.debug(f"Fichier temp supprimé: {tmp}")
                except Exception:
                    pass

    # 5. Reporter le résultat
    try:
        api_report_result(config, post_id, result)
    except Exception as e:
        logger.error(f"Impossible de reporter le résultat à Railway: {e}")
        # Le post est peut-être quand même réussi — loguer pour investigation manuelle
        logger.error(f"Résultat non reporté: {json.dumps(result)}")

    # 6. Effacer la queue locale
    save_queue(None)

    if result.get("success"):
        logger.info(f"✓ Post {post_id} réussi — ig_post_id={result.get('ig_post_id')}")
    else:
        logger.warning(f"✗ Post {post_id} échoué — {result.get('error')}")


def _get_downloader(config: dict):
    """Initialise le downloader Drive depuis config.json ou env vars (fallback)."""
    # Priorité : config.json → puis variables d'environnement
    refresh_token = (
        config.get("google_refresh_token")
        or os.environ.get("GOOGLE_REFRESH_TOKEN")
    )
    client_id = (
        config.get("google_client_id")
        or os.environ.get("GOOGLE_CLIENT_ID")
    )
    client_secret = (
        config.get("google_client_secret")
        or os.environ.get("GOOGLE_CLIENT_SECRET")
    )

    if refresh_token and client_id and client_secret:
        return drive_downloader.DriveDownloader(refresh_token, client_id, client_secret)

    logger.warning("Credentials Google Drive non configurés dans config.json — téléchargement Drive désactivé")
    return None


# ─── Main loop ────────────────────────────────────────────────────────────────

def main() -> None:
    setup_logging()
    logger.info("=== Los Tigres Factory — Instagram Poster ===")
    logger.info(f"PID: {os.getpid()}")

    # Acquire lock (évite les instances multiples)
    try:
        lock_fd = acquire_lock()
    except RuntimeError as e:
        logger.error(str(e))
        sys.exit(1)

    # Charger la config
    try:
        config = load_config()
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)

    logger.info(f"Railway URL: {config.get('railway_url')}")
    logger.info(f"Comptes configurés: {len(config.get('accounts', {}))}")

    # Démarrer le keepalive en background
    keepalive = KeepaliveManager(config)
    keepalive.start()

    # Reprendre un post en attente depuis queue.json (si reboot)
    pending_resume = load_queue()
    if pending_resume:
        logger.info(f"Reprise du post interrompu: {pending_resume.get('post_id')}")
        try:
            process_post(pending_resume["pending"], config)
        except Exception as e:
            logger.error(f"Erreur lors de la reprise: {e}")
        save_queue(None)

    # Boucle principale
    backoff_idx = 0
    logger.info(f"Polling /api/instagram/pending toutes les {POLL_INTERVAL}s...")

    while True:
        try:
            pending = api_get_pending(config)

            if pending is None:
                # Rien à faire — attendre le prochain poll
                backoff_idx = 0  # Reset backoff
                time.sleep(POLL_INTERVAL + random.uniform(-5, 5))
                continue

            # Post disponible !
            backoff_idx = 0
            logger.info(f"Post disponible: {pending['post']['id']}")

            try:
                process_post(pending, config)
            except Exception as e:
                logger.exception(f"Erreur process_post: {e}")
                # Essayer de reporter l'erreur à Railway
                try:
                    api_report_result(config, pending["post"]["id"], {
                        "success": False,
                        "error": f"Erreur inattendue: {e}",
                    })
                except Exception:
                    pass
                save_queue(None)

            # Délai humain entre les posts
            time.sleep(random.uniform(30, 90))

        except requests.ConnectionError as e:
            logger.warning(f"Railway unreachable: {e}")
            wait = RETRY_BACKOFF[min(backoff_idx, len(RETRY_BACKOFF) - 1)]
            logger.info(f"Retry dans {wait}s")
            backoff_idx = min(backoff_idx + 1, len(RETRY_BACKOFF) - 1)
            time.sleep(wait)

        except requests.HTTPError as e:
            logger.error(f"Erreur HTTP Railway: {e}")
            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            logger.info("Arrêt demandé (KeyboardInterrupt)")
            keepalive.stop()
            break

        except Exception as e:
            logger.exception(f"Erreur inattendue dans la boucle principale: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
