# Oplaa Pro — activer l'abonnement (version 1.1)

Branche : `abonnement-1.1` (à fusionner dans `main` au moment du lancement).

**Modèle** (décisions Noa, 04–06/11/2026) : **7,99 €/mois ou 79,99 €/an, par établissement**. Employés toujours gratuits.
Essai gratuit de 30 jours compté depuis la création de l'établissement. Éditeur / vendeur : SAS NOMAD.
Tant que `SUBSCRIPTION_ENABLED = false` dans `www/index.html`, rien n'est bridé et le paywall n'apparaît jamais.

## Ce qui est prêt dans le code (testé avec un faux module d'achat)

| Élément | Où | État |
|---|---|---|
| Plugin `@revenuecat/purchases-capacitor` 14.1 (Capacitor 8) | `package.json`, `ios/App/CapApp-SPM/Package.swift` | installé sur la branche, compilation iOS vérifiée |
| Abonnement rattaché à l'**établissement** (`Purchases.logIn('est_<id>')`) | `rcIdentify()` | prêt — tous les admins/managers d'un établissement partagent l'abonnement |
| Formules mensuelle et annuelle, prix lus dans l'App Store | `rcLoadOffers()`, `renderPaywall()`, `#planMonthly` / `#planAnnual` | prêt |
| Essai 30 jours par établissement (date de création côté serveur, non réinitialisable) | `trialStartMs()`, constante `PRO_LAUNCH` | prêt — **ajuster `PRO_LAUNCH` à la date de sortie** (les établissements existants démarrent leur essai ce jour-là) |
| Employés et démo jamais bridés | `isPro()` | prêt |
| Sur le web : pas d'encaissement, renvoi vers l'app iPhone | `#paywallWeb` | prêt |
| Codes offerts (BIVOUAK, TEST3M) | `redeem_licence`, `proFromCloud()` | en production depuis le 26/10 |
| Webhook RevenueCat → `establishments.pro_until` (Pro visible sur le web) | `supabase/functions/revenuecat-webhook/index.ts` | écrit, **à déployer** |
| Garde-fou : `pro_until` non modifiable par un client | `guard_pro_columns` dans `supabase/schema.sql` | écrit, **à appliquer en base** |
| Actions bridées sans Pro (5 points : créer/modifier un service, une fiche, etc.) | `ensurePro()` | en place |
| Tests | `tests/e2e/flow.spec.mjs` (3 tests « abonnement ») | verts |

## Ce qu'il reste à faire, dans l'ordre

### A. Côté comptes (Noa / Lucas)
1. **Conversion du compte Apple en SAS NOMAD** — dossier 30000005124775. Puis re-signer les contrats, refaire W-8BEN-E, Certificate of Foreign Status et DAC7 au nom de NOMAD.
2. **Small Business Program** (commission 15 %) : App Store Connect → Business.
3. **RevenueCat** (Lucas) : compte + projet « Oplaa » ; app iOS `com.oplaa.app` ; clé « In-App Purchase » App Store Connect (.p8) importée dans RevenueCat ; entitlement **`pro`** ; offering `default` avec deux packages `$rc_monthly` et `$rc_annual` ; transmettre la **clé publique iOS** (`appl_…`).
4. **Médiateur de la consommation** à désigner (CGU, art. 16).

### B. Côté App Store Connect (Claude, via l'API, une fois A.1 fait)
5. Groupe d'abonnements « Oplaa Pro » ; produits `oplaa_pro_monthly` (7,99 €, 1 mois) et `oplaa_pro_yearly` (79,99 €, 1 an) ; nom + description FR ; capture du paywall pour la review.
   Pas d'offre d'introduction Apple : l'essai de 30 jours est géré par l'app (sinon double essai).

### C. Côté serveur (GO de Noa nécessaire : production)
6. Appliquer le bloc `guard_pro_columns` de `supabase/schema.sql`.
7. Déployer la fonction `revenuecat-webhook` (Supabase → Edge Functions), définir le secret `REVENUECAT_WEBHOOK_AUTH`, puis dans RevenueCat → Integrations → Webhooks : URL de la fonction + en-tête `Authorization: Bearer <secret>`.

### D. Côté app (Claude)
8. `RC_IOS_API_KEY` = clé publique iOS ; `PRO_LAUNCH` = date de sortie ; `SUBSCRIPTION_ENABLED = true`.
9. Fusionner `abonnement-1.1` dans `main`, `npm run build:css && npx cap sync ios`, version 1.1.
10. Test en **bac à sable** (testeur Sandbox dans App Store Connect) : essai → paywall → achat mensuel → achat annuel → restauration → deuxième admin du même établissement → web.
11. Archive, upload, joindre les deux abonnements à la version, soumettre.

## Points d'attention

- **Factures** : Apple envoie un reçu au client, pas une facture avec TVA au nom de son entreprise. Pour des clients professionnels, prévoir à terme un paiement web (Stripe) qui, lui, émet des factures.
- **Contrôle côté serveur** : le Pro est vérifié dans l'app (affichage du paywall). La base n'interdit pas d'écrire un planning sans Pro. Suffisant pour démarrer ; à durcir si des contournements apparaissent.
- **Changement d'établissement** : l'identifiant RevenueCat suit l'établissement (`est_<id>`), pas la personne. Un admin qui gère deux établissements a deux abonnements distincts.
- **Remboursements / résiliations** : gérés par Apple ; le webhook met à jour l'échéance, l'accès court jusqu'à la fin de la période payée.
