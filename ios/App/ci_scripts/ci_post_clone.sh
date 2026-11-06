#!/bin/sh
# =============================================================================
# Xcode Cloud — préparation de l'app Capacitor avant le build iOS.
# Xcode Cloud exécute ce script juste après le clone du dépôt.
#   1) installe Node (nécessaire à Capacitor CLI + Tailwind)
#   2) installe les dépendances npm
#   3) compile le CSS Tailwind
#   4) copie www/ dans ios/App/App/public (généré, non versionné)
# =============================================================================
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "→ Node : $(command -v node || echo 'absent, installation via Homebrew')"
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi

echo "→ Installation des dépendances (npm ci)"
npm ci

echo "→ Compilation du CSS Tailwind"
npx tailwindcss -c tailwind.config.js -i www/tw-input.css -o www/tailwind.css --minify

echo "→ Copie des assets web dans le projet iOS (cap copy ios)"
npx cap copy ios

echo "✓ Préparation Capacitor terminée — Xcode Cloud peut builder."
