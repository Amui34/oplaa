# Oplaa Pro — activer l'abonnement (version « lancement »)

Mis à jour le 24/11/2026. Le code est **sur `main`**, désactivé (`SUBSCRIPTION_ENABLED = false` dans `www/index.html`) :
tant qu'il est désactivé, rien n'est bridé et l'écran d'abonnement n'apparaît jamais.
L'ancienne branche `abonnement-1.1` (partie de la 1.0.11) est remplacée par ce travail : ne plus la fusionner.

**Modèle** (décision Noa du 24/11/2026) : **19,99 €/mois ou 199,99 €/an TTC, par établissement** (au lieu de 7,99 € / 79,99 € décidés le 04/11).
Employés toujours gratuits, démo jamais bridée. Essai gratuit de 30 jours compté depuis la création de l'établissement
(les établissements créés avant `PRO_LAUNCH` démarrent leur essai à cette date). Éditeur / vendeur : SAS NOMAD.

## Prêt

| Élément | Où | État |
|---|---|---|
| Module d'achat `@revenuecat/purchases-capacitor` 14.1.2 (Capacitor 8) | `package.json`, `ios/App/CapApp-SPM/Package.swift` | installé, **compilation iOS vérifiée** le 24/11 |
| Abonnement rattaché à l'**établissement** (`Purchases.logIn('est_<id>')`) | `rcIdentify()`, appelé après chaque synchronisation | prêt : tous les admins/managers d'un établissement le partagent |
| Formules mensuelle et annuelle, prix lus dans l'App Store | `rcLoadOffers()`, `renderPaywall()`, `#planMonthly` / `#planAnnual` | prêt |
| Seuls un patron ou un manager connecté peuvent acheter | `rcPurchase()` | prêt |
| Essai 30 jours par établissement | `trialStartMs()`, `PRO_LAUNCH` (actuellement `2027-01-01`) | prêt : **ajuster `PRO_LAUNCH` au jour du lancement** |
| Sur le web : pas d'encaissement, renvoi vers l'app iPhone | `#paywallWeb` | prêt |
| Codes offerts | `redeem_licence`, `proFromCloud()` | en production |
| Garde-fou : `pro_until` modifiable seulement par le serveur | `guard_pro_columns` (schema.sql, audit du 22/11) | **en production** |
| Webhook RevenueCat → `establishments.pro_until` (Pro visible sur le web) | `supabase/functions/revenuecat-webhook/index.ts` | écrit, **à déployer** |
| Tests automatiques | `tests/e2e/flow.spec.mjs` (4 tests « abonnement », faux module d'achat) | verts |
| **App Store Connect** : groupe « Pro » (22615589) | créé par l'API le 24/11 | ok |
| Produit `pro_monthly` (6838889413) : 1 mois, 19,99 € (FRA), 175 pays, « Pro mensuel » | créé | `MISSING_METADATA` : il manque la **capture de l'écran d'abonnement** pour la review |
| Produit `pro_yearly` (6838889845) : 1 an, 199,99 € (FRA), 175 pays, « Pro annuel » | créé | idem |

Pas d'offre d'essai Apple : l'essai de 30 jours est géré par l'app (sinon double essai).
Noms visibles sans la marque (« Pro mensuel », « Pro annuel ») : rien à changer chez Apple en cas de changement de nom.
Revenu net affiché par Apple aujourd'hui : 12,33 € / mois (commission 30 %). Avec le Small Business Program (15 %) : environ 14,16 €.

## À faire, dans l'ordre

### A. Noa (comptes, signatures)
1. **Conversion du compte Apple en SAS NOMAD** (D-U-N-S, dossier 30000005091348). Sans ça, Apple paie Noa Madar, pas la société.
2. **Accord « Paid Apps »** (App Store Connect → Accords, taxes et banque) avec le RIB et les infos fiscales de SAS NOMAD. Indispensable pour vendre **et pour tester en bac à sable**.
3. **Small Business Program** (commission 15 %).
4. **Compte RevenueCat** (gratuit jusqu'à 2 500 $/mois de revenus) : projet, app iOS `com.oplaa.app`, clé « In-App Purchase » App Store Connect importée, entitlement **`pro`**, offering `default` avec `$rc_monthly` → `pro_monthly` et `$rc_annual` → `pro_yearly`. Me transmettre la **clé publique iOS** (`appl_…`, elle est faite pour être dans l'app).
5. Décisions : codes Pro offerts aux établissements existants (durée), médiateur de la consommation (probablement inutile en B2B, à confirmer).

### B. Claude
6. Capture de l'écran d'abonnement → jointe aux deux produits (supprime `MISSING_METADATA`).
7. `RC_IOS_API_KEY`, `PRO_LAUNCH`, `SUBSCRIPTION_ENABLED = true`.
8. Déployer `revenuecat-webhook` + secret `REVENUECAT_WEBHOOK_AUTH` (GO de Noa : production), puis le brancher dans RevenueCat.
9. Test bac à sable : essai → écran d'abonnement → mensuel → annuel → restauration → deuxième admin → web.
10. Archive, envoi, joindre les deux abonnements à la version, soumettre.

## Points d'attention
- **Factures** : Apple émet un reçu, pas une facture d'entreprise avec TVA. À terme, paiement web (Stripe) pour les clients qui en ont besoin.
- **Contrôle côté serveur** : le Pro est vérifié dans l'app ; la base n'interdit pas d'écrire un planning sans Pro. Suffisant pour démarrer.
- **Plusieurs établissements** : un abonnement par établissement (identifiant `est_<id>`).
- **Résiliations / remboursements** : gérés par Apple ; le webhook met à jour l'échéance.
