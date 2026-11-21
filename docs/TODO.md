# Oplaa — À faire (mis à jour le 21/11/2026)

## État au 17/11/2026
- **Site oplaa.pro** : à jour (dernier commit `ae04fae`). Tout ce qui a été fait aujourd'hui y est.
- **iPhone** : 1.0.13 (build 301) **en vente depuis le 19/11/2026** : compte obligatoire + démo éphémère. **1.0.15 (build 303) soumise à la review le 21/11/2026 au soir** (passe « propre et pro » : barre latérale ordinateur, grille allégée, vue Jour en liste sur iPhone, accueil deux colonnes). 1.0.14 (build 302) en vente depuis le 21/11/2026 : refonte visuelle, correctif import, postes de travail, haptique. Noa a autorisé les soumissions sans redemander.
- **Notifications** : fonction `notify` déployée, clé APNs créée, 5 secrets posés. **Jamais testées en réel.**
- **Workflows Xcode Cloud** : désactivés (plus de collision de numéros de build).

## Noa — à faire soi-même (chaque point ≈ 5 min)
1. **Tester les notifications** : votre iPhone (patron) + un second iPhone avec un compte employé de l'établissement, app installée, notifications acceptées. Publier une semaine → la notification doit arriver. Si rien : me le dire, je lis les logs de la fonction.
2. **Tester les e-mails** (Resend) : créer un compte avec une adresse jamais utilisée → le code doit arriver depuis une adresse `@oplaa.pro`, pas depuis Supabase.
3. **Refaire l'import Combo sur le web, connecté** : Menu → « Importer des employés (Excel Combo) » → aperçu → Importer → l'onglet Équipe s'ouvre rempli. Me dire sur quel appareil le premier essai avait échoué (Safari ? iPhone ?).
4. **Ranger la clé .p8** hors des Téléchargements (fait ? sinon : Documents/Oplaa/Clés ou gestionnaire de mots de passe).
5. **Mettre à jour l'app** sur votre iPhone (1.0.14 en vente depuis le 21/11) et vérifier que l'ouverture demande bien un compte.

## Claude — à la prochaine session
1. ~~Envoyer la 1.0.14~~ (en vente le 21/11/2026, build 302) — pour mémoire : build 302, notes = refonte visuelle (icônes, planning iPhone, cartes, Jour par défaut, Équipe, Conformité, semaine vide, haptique) + correctif import + postes de travail (19/11 : champ « Poste de travail » avec suggestions, lien « Gérer… » pour ajouter des équipes depuis les fiches, champs dates d'arrivée/départ alignés). Pipeline : `build1013.sh` du scratchpad à adapter (projet SPM : `-project App.xcodeproj`, pas de workspace).
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

## Direction visuelle retenue (21/11/2026)
- Noa a refusé la maquette « éditorial minimaliste » (fond papier, cadres partout, Space Mono) proposée par Lucas : trop de carrés, on s'y perd.
- Direction validée : « propre et pro » — beaucoup de blanc, très peu de traits, barre latérale sur ordinateur, pastilles de couleur par personne, un seul bouton accent par écran, police système. Maquettes dans `docs/maquettes/` (style-propre.html = référence).
- Appliquée en trois passes le 21/11 (ordinateur, iPhone, accueil) ; reste à affiner : vue Équipe en liste dense (une ligne par personne), Suivi et Conformité au même niveau, mode sombre à revérifier.

## Sécurité (audit du 22/11/2026)
- Correctifs codés, testés sur une base Postgres Supabase locale (attaques bloquées, usages normaux OK) et poussés : `supabase/migrations/2026-11-22-securite.sql` (aussi dans schema.sql).
- **Migration appliquée en prod le 22/11/2026** (CLI Supabase, à la demande de Noa) et vérifiée : employee_pay + join_attempts, 3 triggers, 4 politiques invite_codes, 0 code sans expiration, suppression de compte débloquée, anon sans accès aux fonctions, congés verrouillés. 0 taux repris (aucun n'était saisi en ligne ; 18 employés, 3 établissements).
- iPhone : 1.0.15 renvoyée avec le build 305 (correctifs app : échappement, codes 10 caractères, effacement à la déconnexion, SheetJS 0.20.3).
- Après la migration, les **anciennes** versions iPhone (≤ 1.0.15 build 303) affichent les taux à 0 chez l'admin : rien n'est perdu (table employee_pay), mettre à jour l'app.
- Reste en réserve : CSP complète (sortir le gros script inline), texte libre des notifications push (redéployer notify), réglage « longueur mini du mot de passe = 8 » dans Supabase → Auth (l'app l'impose déjà), tests d'intégration sur base locale Docker plutôt qu'un projet cloud de test.
- Décision prise par défaut : un manager garde le droit de modifier nom et réglages de l'établissement (l'abonnement est désormais protégé par trigger).
