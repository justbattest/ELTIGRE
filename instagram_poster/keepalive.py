"""
Keepalive — maintient les sessions instagrapi actives.

Toutes les 48h par compte :
1. Switch vers le hotspot correct pour ce compte
2. Appel léger de lecture (account_info)
3. Sauvegarde la session mise à jour
4. Log l'IP utilisée

Tourne en thread parallèle dans main.py.
"""

import json
import time
import random
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path

import session_manager
import network_switcher

logger = logging.getLogger(__name__)

# Intervalle keepalive : 48h
KEEPALIVE_INTERVAL_HOURS = 48
KEEPALIVE_INTERVAL = KEEPALIVE_INTERVAL_HOURS * 3600


class KeepaliveManager:
    """Gère les keepalives pour tous les comptes."""

    def __init__(self, config: dict):
        self.config = config
        self._last_keepalive: dict[str, float] = {}  # account_id → timestamp
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Démarre le thread keepalive en arrière-plan."""
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="keepalive")
        self._thread.start()
        logger.info("Keepalive manager démarré (intervalle: 48h par compte)")

    def stop(self) -> None:
        """Arrête le thread keepalive."""
        self._running = False

    def _loop(self) -> None:
        """Boucle principale du keepalive."""
        # Attendre 10 minutes au démarrage pour éviter de perturber les posts initiaux
        time.sleep(600)

        while self._running:
            try:
                self._run_keepalives()
            except Exception as e:
                logger.error(f"Keepalive loop error: {e}")

            # Vérifier toutes les heures
            time.sleep(3600)

    def _run_keepalives(self) -> None:
        """Vérifie chaque compte et lance un keepalive si nécessaire."""
        now = time.time()

        for account_id, account_cfg in self.config.get("accounts", {}).items():
            last_keepalive = self._last_keepalive.get(account_id, 0)

            if now - last_keepalive >= KEEPALIVE_INTERVAL:
                # Décaler légèrement pour ne pas faire tous les comptes simultanément
                delay = random.uniform(0, 300)  # 0-5 minutes
                time.sleep(delay)

                try:
                    self._keepalive_account(account_id, account_cfg)
                    self._last_keepalive[account_id] = time.time()
                except Exception as e:
                    logger.error(f"Keepalive failed pour {account_id}: {e}")

    def _keepalive_account(self, account_id: str, account_cfg: dict) -> None:
        """Effectue un keepalive pour un compte spécifique."""
        network_name_key = account_cfg.get("network", "")
        wifi_name = self.config.get("networks", {}).get(network_name_key, network_name_key)

        logger.info(f"Keepalive pour {account_id} via {wifi_name}")

        # Switch vers le bon hotspot
        try:
            ip = network_switcher.switch_to_network(wifi_name)
            logger.info(f"Keepalive — IP: {ip}")
        except ConnectionError as e:
            logger.error(f"Keepalive — impossible de se connecter à {wifi_name}: {e}")
            return
        except ValueError as e:
            logger.error(f"Keepalive — IP suspecte: {e}")
            return

        # Charger les credentials depuis config
        # Note: le keepalive n'a pas besoin du username/password si la session est valide
        # On essaie de charger depuis la session existante
        session_file = Path(__file__).parent / account_cfg.get("session_file", f"sessions/{account_id}.json")
        device_file = Path(__file__).parent / account_cfg.get("device_file", f"devices/{account_id}.json")

        if not session_file.exists():
            logger.warning(f"Keepalive — pas de session pour {account_id}, skip")
            return

        try:
            from instagrapi import Client
            from instagrapi.exceptions import LoginRequired

            cl = Client()
            cl.delay_range = [3, 8]

            if device_file.exists():
                with open(device_file) as f:
                    device = json.load(f)
                cl.set_device(device)
                cl.set_country("US")
                cl.set_locale("en_US")

            cl.load_settings(str(session_file))

            # Requête légère de lecture — ne génère pas de trafic suspect
            time.sleep(random.uniform(5, 15))
            user_info = cl.account_info()

            # Sauvegarder la session mise à jour
            cl.dump_settings(str(session_file))

            logger.info(f"Keepalive ✓ — @{user_info.username} session valide")

        except LoginRequired:
            logger.warning(f"Keepalive — session expirée pour {account_id} (LoginRequired)")
            # Supprimer la session pour forcer un re-login au prochain post
            session_file.unlink(missing_ok=True)

        except Exception as e:
            logger.error(f"Keepalive error pour {account_id}: {e}")
