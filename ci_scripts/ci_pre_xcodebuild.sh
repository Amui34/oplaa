#!/bin/sh
# =============================================================================
# Xcode Cloud — numéro de build automatique, unique et croissant.
# Xcode Cloud exécute ce script juste avant xcodebuild (l'archive).
#
# On s'appuie sur le compteur interne d'Xcode Cloud ($CI_BUILD_NUMBER, qui
# augmente à chaque build), décalé de +10 pour rester AU-DESSUS des builds
# envoyés manuellement (1, 2, 3). Résultat : plus jamais de collision ni de
# numéro à incrémenter à la main.
# =============================================================================
set -e

# Hors Xcode Cloud (build local), on ne touche à rien.
if [ -z "$CI_BUILD_NUMBER" ]; then
  echo "→ Pas de CI_BUILD_NUMBER (build local) — numéro de build inchangé."
  exit 0
fi

NEW_BUILD=$((CI_BUILD_NUMBER + 10))
echo "→ Numéro de build Xcode Cloud : $NEW_BUILD (CI_BUILD_NUMBER=$CI_BUILD_NUMBER + 10)"

cd "$CI_PRIMARY_REPOSITORY_PATH/ios/App"
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9.]+;/CURRENT_PROJECT_VERSION = ${NEW_BUILD};/g" App.xcodeproj/project.pbxproj

echo "✓ CURRENT_PROJECT_VERSION fixé à ${NEW_BUILD}"
grep -m1 "CURRENT_PROJECT_VERSION" App.xcodeproj/project.pbxproj
