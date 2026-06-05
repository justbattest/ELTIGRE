"""
Poster — logique de posting instagrapi.

Supporte :
- Reels (clip_upload) — format vertical 9:16
- Photos (photo_upload)

Gestion d'erreurs exhaustive avec retry intelligent :
- PleaseWaitFewMinutes → wait 15min, retry 1x
- LoginRequired → re-login, retry
- ChallengeRequired → NE PAS retry, propager pour alert manuel
- FeedbackRequired → propager (suspension 24h)
"""

import os
import time
import random
import logging
from pathlib import Path

from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
    FeedbackRequired,
)

import session_manager

logger = logging.getLogger(__name__)


def human_delay(min_sec: float = 3, max_sec: float = 12) -> None:
    """Pause aléatoire simulant le comportement humain."""
    delay = random.uniform(min_sec, max_sec)
    logger.debug(f"Human delay: {delay:.1f}s")
    time.sleep(delay)


def human_warmup(cl: Client, username: str) -> None:
    """
    Simule un comportement humain après le login, avant de poster.
    Rend la session "chaude" — réduit la détection bot par Meta.

    Séquence : notifs → feed → pause lecture → prêt à poster
    Total : ~20-45s (comme un humain qui ouvre l'app et navigue un peu)
    """
    logger.info(f"[{username}] Warm-up session (simule comportement humain)...")

    # 1. Vérifier les notifications (premier geste naturel à l'ouverture de l'app)
    human_delay(1, 3)
    try:
        cl.news_inbox()
    except Exception:
        pass  # Non bloquant

    # 2. Charger quelques posts du feed (scroll rapide)
    human_delay(2, 5)
    try:
        cl.get_timeline()
    except Exception:
        pass  # Non bloquant

    # 3. Pause "lecture" — simule un humain qui regarde les posts
    pause = random.uniform(10, 25)
    logger.debug(f"[{username}] Lecture feed simulée ({pause:.0f}s)...")
    time.sleep(pause)

    logger.info(f"[{username}] Warm-up terminé — prêt à poster")


def post_reel(
    account_id: str,
    username: str,
    password: str,
    video_path: str,
    caption: str,
    config: dict,
    totp_secret: str | None = None,
    proxy_url: str | None = None,
    retry_count: int = 0,
) -> dict:
    """
    Poste une vidéo Reel sur Instagram.

    Returns:
        {"success": True, "ig_post_id": "...", "session_json": "..."} si succès
        {"success": False, "error": "...", "account_status": "..."} si échec
    """
    logger.info(f"[{username}] Posting Reel: {Path(video_path).name}")

    cl: Client | None = None
    try:
        # Injecter le totp_secret dans la config pour que session_manager puisse le lire
        if totp_secret and account_id in config.get("accounts", {}):
            config["accounts"][account_id]["totp_secret"] = totp_secret
        cl = session_manager.get_client(account_id, username, password, config, proxy_url)

        # Warm-up avant de poster (simule comportement humain)
        human_warmup(cl, username)
        logger.info(f"[{username}] Caption: {caption[:80]!r}{'...' if len(caption) > 80 else ''}")
        media = cl.clip_upload(
            path=video_path,
            caption=caption,
        )

        # Sauvegarder la session mise à jour
        session_manager.save_session(cl, account_id, config)

        logger.info(f"[{username}] Reel posté ✓ — pk={media.pk}")
        return {
            "success": True,
            "ig_post_id": str(media.pk),
            "session_json": _read_session_file(account_id, config),
        }

    except PleaseWaitFewMinutes as e:
        logger.warning(f"[{username}] Rate limit — attente 15min: {e}")
        if retry_count < 1:
            time.sleep(random.uniform(900, 1800))  # 15-30 min
            return post_reel(account_id, username, password, video_path, caption, config, totp_secret, retry_count + 1)
        return {
            "success": False,
            "error": f"Rate limit après retry: {e}",
            "account_status": None,
        }

    except LoginRequired as e:
        logger.warning(f"[{username}] Session expirée pendant le post — re-login...")
        # session_manager.get_client gère déjà le re-login
        # Si on arrive ici, c'est que le re-login a aussi échoué
        return {
            "success": False,
            "error": f"Login required: {e}",
            "account_status": None,
        }

    except ChallengeRequired as e:
        logger.error(f"[{username}] ⚠️  CHALLENGE REQUIRED — vérification manuelle nécessaire!")
        return {
            "success": False,
            "error": f"Challenge required — vérifier l'iPhone de @{username}",
            "account_status": "challenge",
        }

    except FeedbackRequired as e:
        logger.error(f"[{username}] ⚠️  FEEDBACK REQUIRED — compte suspendu temporairement: {e}")
        return {
            "success": False,
            "error": f"Feedback required: {e}",
            "account_status": "suspended",
        }

    except Exception as e:
        logger.exception(f"[{username}] Erreur inattendue lors du post: {e}")
        return {
            "success": False,
            "error": str(e),
            "account_status": None,
        }


def post_photo(
    account_id: str,
    username: str,
    password: str,
    image_path: str,
    caption: str,
    config: dict,
    totp_secret: str | None = None,
    proxy_url: str | None = None,
    retry_count: int = 0,
) -> dict:
    """
    Poste une photo sur Instagram.

    Returns:
        {"success": True, "ig_post_id": "...", "session_json": "..."} si succès
        {"success": False, "error": "...", "account_status": "..."} si échec
    """
    logger.info(f"[{username}] Posting Photo: {Path(image_path).name}")

    try:
        if totp_secret and account_id in config.get("accounts", {}):
            config["accounts"][account_id]["totp_secret"] = totp_secret
        cl = session_manager.get_client(account_id, username, password, config, proxy_url)
        human_warmup(cl, username)

        media = cl.photo_upload(
            path=image_path,
            caption=caption,
        )

        session_manager.save_session(cl, account_id, config)

        logger.info(f"[{username}] Photo postée ✓ — pk={media.pk}")
        return {
            "success": True,
            "ig_post_id": str(media.pk),
            "session_json": _read_session_file(account_id, config),
        }

    except PleaseWaitFewMinutes as e:
        logger.warning(f"[{username}] Rate limit — attente 15min")
        if retry_count < 1:
            time.sleep(random.uniform(900, 1800))
            return post_photo(account_id, username, password, image_path, caption, config, retry_count + 1)
        return {"success": False, "error": f"Rate limit après retry: {e}", "account_status": None}

    except ChallengeRequired as e:
        logger.error(f"[{username}] ⚠️  CHALLENGE REQUIRED")
        return {"success": False, "error": f"Challenge required pour @{username}", "account_status": "challenge"}

    except FeedbackRequired as e:
        logger.error(f"[{username}] ⚠️  FEEDBACK REQUIRED")
        return {"success": False, "error": str(e), "account_status": "suspended"}

    except Exception as e:
        logger.exception(f"[{username}] Erreur inattendue: {e}")
        return {"success": False, "error": str(e), "account_status": None}


def post_carousel(
    account_id: str,
    username: str,
    password: str,
    image_paths: list[str],
    caption: str,
    config: dict,
    totp_secret: str | None = None,
    proxy_url: str | None = None,
) -> dict:
    """
    Poste un carousel (album) Instagram.
    image_paths : liste de chemins locaux des images (triées, max 10, min 2)
    """
    logger.info(f"[{username}] Posting Carousel: {len(image_paths)} images")
    try:
        if totp_secret and account_id in config.get("accounts", {}):
            config["accounts"][account_id]["totp_secret"] = totp_secret
        cl = session_manager.get_client(account_id, username, password, config, proxy_url)

        # Warm-up avant de poster (simule comportement humain)
        human_warmup(cl, username)

        logger.info(f"[{username}] Caption: {caption[:80]!r}{'...' if len(caption) > 80 else ''}")

        media = cl.album_upload(
            paths=image_paths,
            caption=caption,
        )

        session_manager.save_session(cl, account_id, config)
        logger.info(f"[{username}] Carousel posté ✓ — pk={media.pk}")
        return {
            "success": True,
            "ig_post_id": str(media.pk),
            "session_json": _read_session_file(account_id, config),
        }

    except PleaseWaitFewMinutes as e:
        logger.warning(f"[{username}] Rate limit carousel")
        return {"success": False, "error": f"Rate limit: {e}", "account_status": None}
    except ChallengeRequired:
        logger.error(f"[{username}] CHALLENGE REQUIRED")
        return {"success": False, "error": f"Challenge required pour @{username}", "account_status": "challenge"}
    except FeedbackRequired as e:
        logger.error(f"[{username}] FEEDBACK REQUIRED")
        return {"success": False, "error": str(e), "account_status": "suspended"}
    except Exception as e:
        logger.exception(f"[{username}] Erreur carousel: {e}")
        return {"success": False, "error": str(e), "account_status": None}


def post(
    account_id: str,
    username: str,
    password: str,
    media_path: str | list[str],   # str pour video/photo, list[str] pour carousel
    caption: str,
    media_type: str,               # 'reel' | 'photo' | 'carousel'
    config: dict,
    totp_secret: str | None = None,
    proxy_url: str | None = None,
) -> dict:
    """Dispatcher : poste selon le media_type."""
    if media_type == "carousel":
        paths = media_path if isinstance(media_path, list) else [media_path]
        return post_carousel(account_id, username, password, paths, caption, config, totp_secret, proxy_url)
    elif media_type == "photo":
        return post_photo(account_id, username, password, str(media_path), caption, config, totp_secret, proxy_url)
    else:
        return post_reel(account_id, username, password, str(media_path), caption, config, totp_secret, proxy_url)


def _read_session_file(account_id: str, config: dict) -> str | None:
    """Lit le contenu du fichier session pour l'envoyer à Railway."""
    import json
    from pathlib import Path
    account_cfg = config["accounts"].get(account_id, {})
    session_file = Path(__file__).parent / account_cfg.get("session_file", f"sessions/{account_id}.json")
    if session_file.exists():
        with open(session_file) as f:
            return f.read()
    return None
