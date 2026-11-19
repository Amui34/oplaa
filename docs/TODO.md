# Oplaa — À faire (mis à jour le 19/11/2026)

## État au 17/11/2026
- **Site oplaa.pro** : à jour (dernier commit `ae04fae`). Tout ce qui a été fait aujourd'hui y est.
- **iPhone** : 1.0.13 (build 301) **en vente depuis le 19/11/2026** : compte obligatoire + démo éphémère. Les passes visuelles d'aujourd'hui et le correctif d'import attendent la **1.0.14**.
- **Notifications** : fonction `notify` déployée, clé APNs créée, 5 secrets posés. **Jamais testées en réel.**
- **Workflows Xcode Cloud** : désactivés (plus de collision de numéros de build).

## Noa — à faire soi-même (chaque point ≈ 5 min)
1. **Tester les notifications** : votre iPhone (patron) + un second iPhone avec un compte employé de l'établissement, app installée, notifications acceptées. Publier une semaine → la notification doit arriver. Si rien : me le dire, je lis les logs de la fonction.
2. **Tester les e-mails** (Resend) : créer un compte avec une adresse jamais utilisée → le code doit arriver depuis une adresse `@oplaa.pro`, pas depuis Supabase.
3. **Refaire l'import Combo sur le web, connecté** : Menu → « Importer des employés (Excel Combo) » → aperçu → Importer → l'onglet Équipe s'ouvre rempli. Me dire sur quel appareil le premier essai avait échoué (Safari ? iPhone ?).
4. **Ranger la clé .p8** hors des Téléchargements (fait ? sinon : Documents/Oplaa/Clés ou gestionnaire de mots de passe).
5. **Mettre à jour l'app** sur votre iPhone (1.0.13 en vente depuis le 19/11) et vérifier que l'ouverture demande bien un compte.

## Claude — à la prochaine session
1. **Envoyer la 1.0.14** dès que la 1.0.13 est en vente (ou que Noa dit go) : build 302, notes = refonte visuelle (icônes, planning iPhone, cartes, Jour par défaut, Équipe, Conformité, semaine vide, haptique) + correctif import + postes de travail (19/11 : champ « Poste de travail » avec suggestions, lien « Gérer… » pour ajouter des équipes depuis les fiches, champs dates d'arrivée/départ alignés). Pipeline : `build1013.sh` du scratchpad à adapter (projet SPM : `-project App.xcodeproj`, pas de workspace).
2. **Abonnement 1.1** (branche `abonnement-1.1`) : finir RevenueCat, produits 7,99 €/mois et 79,99 €/an **par établissement**, essai gratuit, paywall ; **désigner le médiateur de la consommation** dans les CGV avant d'encaisser ; page Tarifs du site.
3. **Import côté iPhone** : vérifier que le sélecteur de fichiers iOS accepte bien un `.xlsx` (plugin Filesystem / input file) ; test e2e de l'import avec un fichier de fixture **synthétique** (jamais le vrai export).
4. **Finitions mobiles** : largeur de la colonne « Équipe » en mode Jour sur iPhone ; passer en revue le mode sombre écran par écran (modales incluses).
5. **Métiers à la création** : si Noa le souhaite, ajouter bar/brasserie, fast-food/snack, traiteur (équipes + créneaux adaptés).
6. **Vague 2** : à définir avec Noa (ce qui manque le plus aux restaurateurs au quotidien).

## En attente (rien à faire)
- Conversion du compte Apple en Organisation (dossier en cours, banque SAS NOMAD).

## Rappels / règles
- Compte obligatoire à chaque ouverture ; la démo ne survit pas à une fermeture.
- Les employés ne voient jamais les salaires ; un manager n'envoie/ne reçoit ni taux, ni salaire de base, ni primes.
- Le vrai export Combo (`docs/exemples/*.xlsx`) et les clés `.p8` ne vont jamais dans le dépôt (`.gitignore`).
- Numéros de build manuels > 301 ; après chaque lot : pousser `main` (déploie oplaa.pro), `npx cap copy ios` avant un build iPhone.
