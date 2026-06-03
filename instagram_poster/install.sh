#!/bin/bash
# install.sh — Configure le LaunchAgent macOS pour le Instagram Poster
# Usage : chmod +x install.sh && ./install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
VENV_PYTHON="$REPO_DIR/venv/bin/python"
PLIST_LABEL="com.lostrigres.poster"
PLIST_FILE="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
LOGS_DIR="$SCRIPT_DIR/logs"

echo "=== Los Tigres Factory — Instagram Poster Setup ==="
echo ""

# Vérifier que Python venv existe
if [ ! -f "$VENV_PYTHON" ]; then
    echo "❌ Python venv introuvable à $VENV_PYTHON"
    echo "   Lance d'abord: cd $REPO_DIR && python3 -m venv venv && venv/bin/pip install -r requirements.txt"
    exit 1
fi

# Installer les dépendances du poster
echo "📦 Installation des dépendances poster..."
"$VENV_PYTHON" -m pip install -r "$SCRIPT_DIR/requirements_poster.txt" --quiet
echo "✓ Dépendances installées"

# Vérifier que config.json existe
if [ ! -f "$SCRIPT_DIR/config.json" ]; then
    echo ""
    echo "⚠️  config.json manquant !"
    echo "   Copier: cp $SCRIPT_DIR/config.example.json $SCRIPT_DIR/config.json"
    echo "   Puis remplir les valeurs (railway_url, mac_api_token, noms WiFi, etc.)"
    echo ""
    echo "   Lancer ./install.sh à nouveau une fois config.json rempli."
    exit 1
fi

# Créer le dossier logs
mkdir -p "$LOGS_DIR"

# Créer le fichier plist du LaunchAgent
echo "📝 Création du LaunchAgent..."
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$VENV_PYTHON</string>
    <string>$SCRIPT_DIR/main.py</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>

  <!-- Démarrer automatiquement au login -->
  <key>RunAtLoad</key>
  <true/>

  <!-- Redémarrer automatiquement si crash -->
  <key>KeepAlive</key>
  <true/>

  <!-- Attendre 10s avant restart en cas de crash rapide -->
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <!-- Logs -->
  <key>StandardOutPath</key>
  <string>$LOGS_DIR/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$LOGS_DIR/stderr.log</string>
</dict>
</plist>
EOF

echo "✓ LaunchAgent créé : $PLIST_FILE"

# Décharger si déjà chargé (pour mise à jour)
launchctl unload "$PLIST_FILE" 2>/dev/null || true

# Charger le LaunchAgent
launchctl load "$PLIST_FILE"
echo "✓ LaunchAgent chargé — le poster démarrera automatiquement à chaque login"

echo ""
echo "=== Installation terminée ==="
echo ""
echo "📊 Commandes utiles :"
echo "   Voir le statut   : launchctl list | grep poster"
echo "   Voir les logs    : tail -f $LOGS_DIR/stdout.log"
echo "   Arrêter          : launchctl unload $PLIST_FILE"
echo "   Redémarrer       : launchctl unload $PLIST_FILE && launchctl load $PLIST_FILE"
echo ""
echo "⚡ Le poster est maintenant actif et poll Railway toutes les 30s."
