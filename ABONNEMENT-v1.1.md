# Oplaa Pro — activer l'abonnement (v1.1)

Modèle : **1 mois d'essai gratuit, puis 4,99 €/mois**, 1 abonnement = 1 compte patron.
Employés = gratuits. La consultation reste gratuite ; créer/modifier un planning devient Pro.

⚠️ À faire **seulement après** la validation de la v1.0 (gratuite) par Apple.
Le code est déjà prêt dans `www/index.html` (module « OPLAA PRO ») mais **désactivé**
(`SUBSCRIPTION_ENABLED = false`).

---

## Étape 1 — Créer l'abonnement dans App Store Connect
1. App Store Connect → **Oplaa** → **Monétisation → Abonnements**.
2. Créer un **groupe d'abonnements** (ex. « Oplaa Pro »).
3. Dans le groupe, créer un **abonnement auto-renouvelable** :
   - **ID de produit (Product ID)** : `oplaa_pro_monthly`
   - **Durée** : 1 mois
   - **Prix** : 4,99 € (choisir le palier France ; les autres pays se remplissent tout seuls)
4. Ajouter une **offre d'introduction** → **Essai gratuit** → **1 mois**.
5. Remplir **nom d'affichage** + **description** (localisation FR) + une **capture de l'écran d'abonnement** (le paywall).
6. (Recommandé) S'inscrire au **App Store Small Business Program** → commission 15 % au lieu de 30 %.

## Étape 2 — Configurer RevenueCat (gratuit)
1. Créer un compte sur https://www.revenuecat.com → nouveau projet « Oplaa ».
2. **Project settings → Apps** : ajouter l'app iOS avec le bundle `com.oplaa.app`
   + coller la **clé App Store Connect API** (In-App Purchase key, générée dans ASC → Utilisateurs et accès → Clés).
3. **Products** : ajouter `oplaa_pro_monthly`.
4. **Entitlements** : créer un entitlement d'identifiant **`pro`** et y attacher le produit.
5. **Offerings** : créer l'offering « default » (`current`) avec un package contenant `oplaa_pro_monthly`.
6. Copier la **clé API publique iOS** (commence par `appl_...`).

## Étape 3 — Brancher le code
Dans `www/index.html` :
- Remplacer `RC_IOS_API_KEY = 'appl_XXXX...'` par la vraie clé publique iOS.
- Passer `SUBSCRIPTION_ENABLED = false` → **`true`**.
- (Les identifiants `RC_ENTITLEMENT_ID='pro'` et le Product ID doivent correspondre à RevenueCat.)

Installer le plugin Capacitor RevenueCat :
```
cd "/Users/noamadar/Local Sites/oplaa"
npm i @revenuecat/purchases-capacitor
npx cap sync ios
```

## Étape 4 — Rebuild + test
```
cd "/Users/noamadar/Local Sites/oplaa"
npx tailwindcss -c tailwind.config.js -i www/tw-input.css -o www/tailwind.css --minify
npx cap copy ios
```
- Monter le build (`CURRENT_PROJECT_VERSION` → 3, `MARKETING_VERSION` → 1.1).
- Tester l'achat en **bac à sable** (Sandbox) avec un compte de test Sandbox (ASC → Utilisateurs et accès → Testeurs Sandbox).
- Vérifier : essai → paywall à l'expiration → achat → déblocage → restauration.

## Étape 5 — Soumettre la v1.1
- Archive Xcode → upload.
- Dans la version 1.1, **joindre l'abonnement à l'examen** (l'IAP est examiné avec le build qui l'utilise).
- Soumettre.

---

### Rappels
- Le paywall contient déjà les mentions et liens exigés par Apple (renouvellement auto, Conditions d'utilisation = EULA standard Apple, Confidentialité).
- Apple prend 15 % (Small Business) ou 30 % → net ≈ 4,25 €/mois.
- « Par établissement » n'est pas géré par Apple : c'est 1 abonnement par compte Apple. Multi-établissements = logique serveur à ajouter plus tard si besoin.
