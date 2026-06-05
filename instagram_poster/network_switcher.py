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


def get_current_wifi_ssid(wifi_interface: str = "en0") -> str:
    """
    Retourne le SSID WiFi actuel via ipconfig (fiable sur macOS Sonoma).
    networksetup -getairportnetwork est buggé sur macOS Ventura/Sonoma.
    """
    try:
        result = subprocess.run(
            ["ipconfig", "getsummary", wifi_interface],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if "SSID" in line:
                # Format : "  SSID : NomDuReseau"
                parts = line.split(":", 1)
                if len(parts) == 2:
                    return parts[1].strip()
    except Exception:
        pass

    # Fallback : networksetup (peut être incorrect sur Sonoma mais on essaie)
    result = subprocess.run(
        ["networksetup", "-getairportnetwork", wifi_interface],
        capture_output=True, text=True
    )
    if "Current Wi-Fi Network:" in result.stdout:
        return result.stdout.split(":", 1)[1].strip()
    return ""


def switch_to_network(network_name: str, wifi_interface: str = "en0") -> str:
    """
    Bascule le WiFi du Mac vers le réseau spécifié.

    Note: Sur macOS Ventura/Sonoma, networksetup -getairportnetwork est buggé.
    On utilise ipconfig getsummary pour vérifier la connexion réelle.

    Args:
        network_name: Le nom du réseau WiFi (ex: "iPhone 12promax")
        wifi_interface: Interface WiFi (défaut: en0)

    Returns:
        L'IP publique après connexion.

    Raises:
        ConnectionError: Si impossible de se connecter dans le délai imparti.
        ValueError: Si l'IP détectée est une IP datacenter.
    """
    logger.info(f"Switch WiFi → {network_name}")

    # Vérifier d'abord si on est déjà sur le bon réseau
    current_ssid = get_current_wifi_ssid(wifi_interface)
    if current_ssid and (network_name in current_ssid or current_ssid in network_name):
        logger.info(f"Déjà connecté à {current_ssid} ✓")
    else:
        # Tenter le switch
        result = subprocess.run(
            ["networksetup", "-setairportnetwork", wifi_interface, network_name],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            logger.warning(f"networksetup warning: {result.stderr.strip()}")

        # Attendre que la connexion soit établie (vérification via ipconfig)
        start = time.time()
        connected = False
        while time.time() - start < WIFI_CONNECT_TIMEOUT:
            ssid = get_current_wifi_ssid(wifi_interface)
            if ssid and (network_name in ssid or ssid in network_name):
                logger.info(f"WiFi connecté à {ssid} ✓")
                time.sleep(3)
                connected = True
                break
            # Fallback : vérifier si internet fonctionne
            try:
                ip = get_public_ip()
                if ip and ip != "unknown":
                    logger.info(f"Internet disponible ({ip}) — connexion probablement établie")
                    connected = True
                    break
            except Exception:
                pass
            time.sleep(2)

        if not connected:
            raise ConnectionError(f"Impossible de se connecter à {network_name} après {WIFI_CONNECT_TIMEOUT}s")

    # Stabilisation IP
    logger.info("Stabilisation IP (15s)...")
    time.sleep(15)

    # Récupérer l'IP publique
    public_ip = get_public_ip()
    logger.info(f"IP publique : {public_ip}")

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
