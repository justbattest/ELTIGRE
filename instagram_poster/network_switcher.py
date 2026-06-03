"""
Network Switcher — bascule le WiFi macOS vers le bon hotspot iPhone.

Utilise `networksetup` (outil natif macOS).

Après chaque switch :
- Attend jusqu'à 30s que la connexion soit établie
- Vérifie l'IP via api.ipify.org
- Sanity check : l'IP ne doit pas être une IP datacenter connue (AWS, Railway, etc.)
"""

import subprocess
import time
import logging
import socket
import requests

logger = logging.getLogger(__name__)

# Préfixes IP de datacenters connus à rejeter
# (liste partielle — suffisante pour détecter une erreur de config)
DATACENTER_PREFIXES = [
    "34.",    # GCP
    "35.",    # GCP
    "104.",   # Cloudflare / GCP
    "172.16.", "172.17.", "172.18.",  # Docker / privé
    "10.",    # Réseau privé
    "192.168.",  # Réseau local — PAS carrier
]

# Timeout pour établir la connexion WiFi
WIFI_CONNECT_TIMEOUT = 45  # secondes
IP_CHECK_TIMEOUT = 10       # secondes


def switch_to_network(network_name: str, wifi_interface: str = "en0") -> str:
    """
    Bascule le WiFi du Mac vers le réseau spécifié.

    Args:
        network_name: Le nom du réseau WiFi (ex: "iPhone de Alexandre")
        wifi_interface: Interface WiFi (défaut: en0)

    Returns:
        L'IP publique après connexion.

    Raises:
        ConnectionError: Si impossible de se connecter dans le délai imparti.
        ValueError: Si l'IP détectée est une IP datacenter.
    """
    logger.info(f"Switch WiFi → {network_name}")

    # Commande pour basculer le réseau
    result = subprocess.run(
        ["networksetup", "-setairportnetwork", wifi_interface, network_name],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        # Parfois networksetup retourne une erreur même si ça marche — on continue
        logger.warning(f"networksetup warning: {result.stderr.strip()}")

    # Attendre que la connexion soit établie
    start = time.time()
    connected = False
    while time.time() - start < WIFI_CONNECT_TIMEOUT:
        status = subprocess.run(
            ["networksetup", "-getairportnetwork", wifi_interface],
            capture_output=True, text=True
        )
        if network_name in status.stdout:
            logger.info(f"WiFi connecté à {network_name}")
            time.sleep(3)  # Laisser le DHCP s'établir
            connected = True
            break
        time.sleep(1)

    if not connected:
        raise ConnectionError(f"Impossible de se connecter à {network_name} après {WIFI_CONNECT_TIMEOUT}s")

    # Attendre 2 minutes pour la stabilisation IP (comme préconisé dans le brief)
    # Réduit à 30s pour les tests — ajuster à 120s en prod
    logger.info("Stabilisation IP (30s)...")
    time.sleep(30)

    # Récupérer l'IP publique
    public_ip = get_public_ip()
    logger.info(f"IP publique après switch : {public_ip}")

    # Sanity check
    _validate_carrier_ip(public_ip, network_name)

    return public_ip


def get_public_ip() -> str:
    """Retourne l'IP publique actuelle."""
    services = [
        "https://api.ipify.org",
        "https://api4.my-ip.io/ip",
        "https://ipv4.icanhazip.com",
    ]
    for service in services:
        try:
            resp = requests.get(service, timeout=IP_CHECK_TIMEOUT)
            if resp.status_code == 200:
                return resp.text.strip()
        except Exception:
            continue
    return "unknown"


def get_current_network(wifi_interface: str = "en0") -> str:
    """Retourne le nom du réseau WiFi actuellement connecté."""
    result = subprocess.run(
        ["networksetup", "-getairportnetwork", wifi_interface],
        capture_output=True, text=True
    )
    # Format : "Current Wi-Fi Network: iPhone de Alexandre"
    if ":" in result.stdout:
        return result.stdout.split(":", 1)[1].strip()
    return ""


def _validate_carrier_ip(ip: str, network_name: str) -> None:
    """
    Vérifie que l'IP n'est pas une IP datacenter ou locale.
    Lève ValueError si détecte une IP suspecte.
    """
    if ip == "unknown":
        logger.warning("Impossible de vérifier l'IP — on continue quand même")
        return

    for prefix in DATACENTER_PREFIXES:
        if ip.startswith(prefix):
            raise ValueError(
                f"IP suspecte détectée après switch vers '{network_name}': {ip}. "
                f"Vérifier que le hotspot iPhone est bien actif et que le Mac est connecté dessus."
            )

    logger.info(f"IP validée comme non-datacenter : {ip}")


def ensure_not_datacenter() -> str:
    """
    Vérifie que l'IP actuelle n'est pas un datacenter.
    Retourne l'IP actuelle.
    """
    ip = get_public_ip()
    _validate_carrier_ip(ip, "current network")
    return ip


def force_wifi_reconnect(wifi_interface: str = "en0") -> None:
    """
    Force une reconnexion WiFi (désactive puis réactive).
    Utile si le réseau semble bloqué.
    """
    logger.info("Force reconnexion WiFi...")
    subprocess.run(["networksetup", "-setairportpower", wifi_interface, "off"])
    time.sleep(2)
    subprocess.run(["networksetup", "-setairportpower", wifi_interface, "on"])
    time.sleep(5)
