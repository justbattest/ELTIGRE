"""
Session Manager — gère les sessions instagrapi.

Responsabilités :
- Premier login d'un compte (init_account) → génère un device unique, login, dump session
- Chargement session existante (get_client) → load_settings + login léger
- Sauvegarde session après chaque action (save_session)

RÈGLE ABSOLUE : 1 device profile par compte, jamais réutilisé sur un autre compte.
"""

import json
import os
import random
import logging
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, ChallengeRequired, TwoFactorRequired

try:
    import pyotp
    PYOTP_AVAILABLE = True
except ImportError:
    PYOTP_AVAILABLE = False
    logging.getLogger(__name__).warning("pyotp non installé — 2FA TOTP non supporté")

logger = logging.getLogger(__name__)

# Pools de devices Samsung réalistes (instagrapi simule Android)
DEVICE_POOL = [
    {
        "app_version": "269.0.0.18.75",
        "android_version": 33,
        "android_release": "13.0",
        "dpi": "420dpi",
        "resolution": "1080x2340",
        "manufacturer": "Samsung",
        "device": "SM-G991B",
        "model": "Galaxy S21",
        "cpu": "exynos2100",
        "version_code": "314665256",
    },
    {
        "app_version": "269.0.0.18.75",
        "android_version": 33,
        "android_release": "13.0",
        "dpi": "440dpi",
        "resolution": "1080x2400",
        "manufacturer": "Samsung",
        "device": "SM-S918B",
        "model": "Galaxy S23",
        "cpu": "snapdragon8gen2",
        "version_code": "314665256",
    },
    {
        "app_version": "269.0.0.18.75",
        "android_version": 34,
        "android_release": "14.0",
        "dpi": "450dpi",
        "resolution": "1440x3088",
        "manufacturer": "Samsung",
        "device": "SM-S928B",
        "model": "Galaxy S24 Ultra",
        "cpu": "snapdragon8gen3",
        "version_code": "314665256",
    },
    {
        "app_version": "269.0.0.18.75",
        "android_version": 33,
        "android_release": "13.0",
        "dpi": "420dpi",
        "resolution": "1080x2340",
        "manufacturer": "Google",
        "device": "Pixel 7",
        "model": "Pixel 7",
        "cpu": "tensor_g2",
        "version_code": "314665256",
    },
    {
        "app_version": "269.0.0.18.75",
        "android_version": 34,
        "android_release": "14.0",
        "dpi": "411dpi",
        "resolution": "1080x2400",
        "manufacturer": "Google",
        "device": "Pixel 8",
        "model": "Pixel 8",
        "cpu": "tensor_g3",
        "version_code": "314665256",
    },
    {
        "app_version": "269.0.0.18.75",
        "android_version": 33,
        "android_release": "13.0",
        "dpi": "395dpi",
        "resolution": "1080x2340",
        "manufacturer": "OnePlus",
        "device": "CPH2449",
        "model": "OnePlus 11",
        "cpu": "snapdragon8gen2",
        "version_code": "314665256",
    },
]


def _base_dir() -> Path:
    """Retourne le répertoire de base du script."""
    return Path(__file__).parent


def _generate_totp(secret: str) -> str:
    """Génère le code TOTP actuel depuis le secret base32."""
    if not PYOTP_AVAILABLE:
        raise RuntimeError("pyotp non installé. Lance: pip install pyotp")
    # Nettoyer le secret (espaces, tirets parfois ajoutés par Instagram)
    clean_secret = secret.replace(" ", "").replace("-", "").upper()
    return pyotp.TOTP(clean_secret).now()


def _apply_proxy(cl: Client, proxy_url: str | None) -> None:
    """Configure le proxy sur le client instagrapi si fourni."""
    if proxy_url:
        cl.set_proxy(proxy_url)
        logger.debug(f"Proxy configuré: {proxy_url.split('@')[-1] if '@' in proxy_url else proxy_url[:30]}")


def _do_login(cl: Client, username: str, password: str, totp_secret: str | None) -> None:
    """
    Login instagrapi avec gestion automatique du 2FA TOTP.
    - Si pas de 2FA : login normal
    - Si TwoFactorRequired : génère le code TOTP et finalise le login
    """
    try:
        cl.login(username, password)
    except TwoFactorRequired:
        if not totp_secret:
            raise RuntimeError(
                f"2FA requis pour @{username} mais aucun totp_secret configuré. "
                f"Ajoute la clé Google Authenticator dans l'UI Poster → Comptes."
            )
        logger.info(f"[{username}] 2FA requis — génération code TOTP...")
        code = _generate_totp(totp_secret)
        logger.info(f"[{username}] Code TOTP généré: {code}")
        # instagrapi 2.8.x : passer verification_code directement à login()
        cl.login(username, password, verification_code=code)
        logger.info(f"[{username}] 2FA validé ✓")


def init_account(account_id: str, username: str, password: str, config: dict) -> Client:
    """
    Premier login d'un compte.
    Génère un device unique, login, dump session + device.
    À appeler UNE SEULE FOIS par compte (depuis le bon hotspot !).
    """
    account_cfg = config["accounts"].get(account_id, {})
    session_file = _base_dir() / account_cfg.get("session_file", f"sessions/{account_id}.json")
    device_file = _base_dir() / account_cfg.get("device_file", f"devices/{account_id}.json")

    if session_file.exists():
        logger.warning(f"Session déjà existante pour {account_id} — utiliser get_client()")
        return get_client(account_id, username, password, config)

    # Choisir un device unique parmi le pool (basé sur l'index du compte pour stabilité)
    # Chaque compte a toujours le même device tant que l'ordre ne change pas
    account_ids = list(config["accounts"].keys())
    idx = account_ids.index(account_id) if account_id in account_ids else random.randint(0, len(DEVICE_POOL) - 1)
    device = DEVICE_POOL[idx % len(DEVICE_POOL)]

    cl = Client()
    cl.delay_range = [2, 6]  # Délai naturel entre requêtes internes
    cl.set_device(device)
    cl.set_country("US")
    cl.set_locale("en_US")

    totp_secret = config["accounts"].get(account_id, {}).get("totp_secret")
    logger.info(f"[{username}] Premier login avec device {device['model']}{'+ 2FA' if totp_secret else ''}...")
    _do_login(cl, username, password, totp_secret)

    # Sauvegarder session + device
    session_file.parent.mkdir(parents=True, exist_ok=True)
    device_file.parent.mkdir(parents=True, exist_ok=True)
    cl.dump_settings(str(session_file))

    # Sauvegarder le device séparément pour pouvoir le réappliquer
    with open(device_file, "w") as f:
        json.dump(device, f, indent=2)

    logger.info(f"[{username}] Session initialisée → {session_file}")
    return cl


def get_client(account_id: str, username: str, password: str, config: dict, proxy_url: str | None = None) -> Client:
    """
    Charge une session existante et retourne un Client instagrapi prêt à l'emploi.

    RÈGLE CRITIQUE : NE PAS re-logger si une session valide est chargée.
    Chaque cl.login() génère une requête de connexion vers Instagram → flaggé comme suspect.
    On charge la session sauvegardée et on retourne le client SANS appeler login().
    Le re-login n'est déclenché que si la session est réellement expirée (LoginRequired
    levé lors d'un vrai appel API comme album_upload).
    """
    account_cfg = config["accounts"].get(account_id, {})
    session_file = _base_dir() / account_cfg.get("session_file", f"sessions/{account_id}.json")
    device_file = _base_dir() / account_cfg.get("device_file", f"devices/{account_id}.json")
    totp_secret = config["accounts"].get(account_id, {}).get("totp_secret")

    cl = Client()
    cl.delay_range = [2, 6]

    # Appliquer le device fingerprint sauvegardé (IDENTIQUE à l'init — même device = même "téléphone")
    if device_file.exists():
        with open(device_file) as f:
            device = json.load(f)
        cl.set_device(device)
        cl.set_country("US")
        cl.set_locale("en_US")

    # Proxy 4G si configuré
    effective_proxy = proxy_url or config["accounts"].get(account_id, {}).get("proxy_url")
    _apply_proxy(cl, effective_proxy)

    if session_file.exists():
        # ✅ Session existante → charger et RETOURNER DIRECTEMENT sans login
        # Pas de requête Instagram, pas de nouvelle session, pas de flag
        cl.load_settings(str(session_file))
        logger.info(f"[{username}] Session chargée depuis {session_file.name} — pas de re-login ✓")
        return cl

    # ── Première connexion : aucun fichier session ──
    logger.info(f"[{username}] Pas de session sauvegardée — premier login...")
    try:
        _do_login(cl, username, password, totp_secret)
        session_file.parent.mkdir(parents=True, exist_ok=True)
        cl.dump_settings(str(session_file))
        logger.info(f"[{username}] Session créée → {session_file.name}")
        return cl
    except ChallengeRequired:
        raise


def relogin_client(cl: Client, account_id: str, username: str, password: str, config: dict) -> None:
    """
    Re-login forcé quand un appel API a levé LoginRequired.
    Appelé uniquement depuis poster.py quand album_upload/reel_upload échoue.
    Sauvegarde la nouvelle session après succès.
    """
    account_cfg = config["accounts"].get(account_id, {})
    session_file = _base_dir() / account_cfg.get("session_file", f"sessions/{account_id}.json")
    device_file = _base_dir() / account_cfg.get("device_file", f"devices/{account_id}.json")
    totp_secret = config["accounts"].get(account_id, {}).get("totp_secret")

    logger.warning(f"[{username}] Session expirée — re-login forcé...")

    # Réinitialiser proprement
    if session_file.exists():
        session_file.unlink()

    cl2 = Client()
    cl2.delay_range = [2, 6]
    if device_file.exists():
        with open(device_file) as f:
            device = json.load(f)
        cl2.set_device(device)
        cl2.set_country("US")
        cl2.set_locale("en_US")

    # Copier le proxy si configuré
    if cl.proxy:
        cl2.set_proxy(cl.proxy)

    _do_login(cl2, username, password, totp_secret)
    session_file.parent.mkdir(parents=True, exist_ok=True)
    cl2.dump_settings(str(session_file))
    logger.info(f"[{username}] Re-login réussi → nouvelle session sauvegardée.")

    # Copier l'état dans le client existant
    cl.__dict__.update(cl2.__dict__)


def save_session(cl: Client, account_id: str, config: dict) -> None:
    """Sauvegarde la session après un post (met à jour les cookies)."""
    account_cfg = config["accounts"].get(account_id, {})
    session_file = _base_dir() / account_cfg.get("session_file", f"sessions/{account_id}.json")
    session_file.parent.mkdir(parents=True, exist_ok=True)
    cl.dump_settings(str(session_file))
