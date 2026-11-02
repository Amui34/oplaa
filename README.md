# Oplaa — planning d'équipe, enfin simple

Application iOS (App Store) + web de planification d'équipe pour restaurants, commerces, cafés, hôtels… Une seule page HTML, aucune dépendance de build côté app, un backend Supabase pour le partage, les rôles et le temps réel.

## Architecture

| Brique | Rôle | Où |
|---|---|---|
| `www/index.html` | **Toute l'application** (UI, logique, synchro). Données locales dans `localStorage`, synchro cloud automatique | ce dépôt |
| `www/supabase-config.js` | URL + clé **publishable** du projet Supabase (publique par conception — jamais de clé secrète) | ce dépôt |
| `supabase/schema.sql` | **Source de vérité** de la base : tables, RLS, RPC, temps réel. Idempotent, rejouable de zéro | ce dépôt |
| Supabase | base, comptes (e-mail + mot de passe, confirmation par e-mail via SMTP Resend), temps réel | projet `kldkqxqbmxtdedzjoghw`, org Amui studio |
| Capacitor (`ios/`) | enveloppe iOS, bundle `com.oplaa.app` | ce dépôt |
| `appstore/` | génération des captures App Store (DA Bricolage Grotesque) | ce dépôt |
| `site-public/` | vitrine oplaa.pro + pages légales : `confidentialite.html`, `cgu.html` (CGU/CGV), `dpa.html` (sous-traitance RGPD art. 28), `mentions-legales.html`, `assistance.html`. Servies par `docker/Caddyfile` (matcher `@legal`), déployées par `deploy.yml` à chaque push sur `main`. Les champs `<mark class="todo">` (raison sociale, SIREN, adresse, médiateur) sont à compléter avant publication | ce dépôt |

## Rôles (cloud)

- **Admin** (`owner`) : tout, y compris salaires et gestion des accès. Plusieurs admins possibles.
- **Manager** : planning, congés, équipe, réglages — pas les salaires, n'invite que des employés.
- **Employé** : son planning, ses demandes de congés.

Les règles sont appliquées **par la base** (RLS + fonctions `security definer`), pas par la page. Un employé ne reçoit jamais un salaire, même en bidouillant l'app.

## Développement

```bash
npm install
npm run build:css      # Tailwind → www/tailwind.css (à relancer après tout ajout de classe)
npm test               # unitaires (TZ=UTC) + intégration (auto-ignorés si le projet de test est injoignable)
npm run test:e2e       # Playwright (serveur local lancé automatiquement)
```

Pour voir l'app : `python3 -m http.server 8795` dans `www/` → http://localhost:8795 (mode démo disponible sur l'écran d'accueil).

### Tests d'intégration
`tests/integration/backend.test.mjs` frappe un **projet Supabase de test** (`rourjugjspqppjhrizxw`, « Confirm email » désactivé — indispensable : le signup doit renvoyer un token). Ne jamais les pointer sur la prod : ils créent des comptes et consommeraient le quota d'e-mails.

## Export comptable & import (format Combo)

- **Suivi → Export comptable (Excel)** (admins) : fichier `.xlsx` à 3 feuilles au format de l'export comptable Combo — `Synthèse` (72 colonnes, sections identiques, ligne TOTAL en formules), `Éléments Variables de Paie`, `Absences` — pour la période affichée (semaine ou mois). Calculs HCR : heures sup au contrat / hors contrat par paliers (+10 % / +20 % / +50 %, seuils réglables), complémentaires temps partiel (+10 % / +25 %), heures manquantes, jours fériés travaillés, absences valorisées (saisie > planifié > journée contrat moyenne), entrée/sortie, repas (avantage en nature / titre / indemnité) et paniers. Réglages → « Paie & export comptable » (SIRET, type de repas, paliers, jours/semaine).
- **Équipe → Importer (Combo)** (admins) : lit un export comptable Combo (`Synthèse` → fiches employés/contrats : matricule, contrat, dates, poste, mutuelle, heures, salaire de base, taux ; `Absences` → absences datées) avec aperçu avant import. Rapprochement par matricule puis par nom. Le planning n'est pas dans cet export (non importable).
- Moteur de calcul : fonctions pures `hcrTiers`, `payWeekSplit`, `payContractSup`, `payPeriod`, `splitName`, `dailyContractHours` (tests : `tests/unit/paie.test.mjs`). Bibliothèque Excel : SheetJS CE 0.18.5 (`www/vendor/xlsx.full.min.js`, chargée à la demande).
- Un fichier d'exemple réel peut être posé dans `docs/exemples/` (ignoré par git : données de paie).

## Base de données

Toute modification passe par `supabase/schema.sql` (jamais de SQL « à la volée » non versionné), puis : Supabase → SQL Editor → coller le fichier → Run. Le fichier est idempotent ; Supabase affiche « Potential issue detected » à cause des `drop policy if exists` → *Run query*.

## Publier sur l'App Store (100 % ligne de commande)

Prérequis : une clé API App Store Connect (rôle Admin) dans `~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8`.

1. `npm run build:css && npx cap copy ios`
2. Dans `ios/App/App.xcodeproj/project.pbxproj` : `CURRENT_PROJECT_VERSION` = numéro de build **strictement supérieur** au dernier uploadé ; `MARKETING_VERSION` = version cible.
3. Archive : `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath out/App.xcarchive archive -allowProvisioningUpdates -authenticationKeyID <KEYID> -authenticationKeyIssuerID <ISSUER> -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8`
4. Export : `xcodebuild -exportArchive -archivePath out/App.xcarchive -exportOptionsPlist exportOptions.plist -exportPath out` (plist : `method=app-store-connect`, `teamID`, `signingStyle=automatic`) avec les mêmes options d'authentification.
5. Upload : `xcrun altool --upload-app -f out/App.ipa -t ios --apiKey <KEYID> --apiIssuer <ISSUER>`
6. App Store Connect (API ou site) : créer la version, notes, attacher le build une fois « Valid », soumettre.

Les builds Xcode Cloud ne sont pas sélectionnables pour la mise en vente ; seuls les builds signés « Apple Distribution » le sont.

## Sécurité — règles non négociables

- La clé **secrète / service_role** de Supabase n'apparaît **nulle part** (ni dépôt, ni app, ni messages).
- Les salaires ne quittent le serveur que pour les admins (`pullForOwner` sans la colonne `rate` pour un manager).
- Suppression de compte in-app : RPC `delete_account` (transfère l'établissement à un autre admin s'il en existe un, sinon le supprime).
