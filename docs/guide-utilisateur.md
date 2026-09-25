# Guide utilisateur

Un chapitre par rôle. Chaque compte de démonstration cité est décrit dans le
`docs/guide-installation.md` (§2) et n'existe jamais en production
(`APP_ENV=production`).

## Se connecter

Un seul parcours pour tous les rôles (agricultrice, agent de terrain, coopérative, acheteur,
ministère), sur `/connexion`, sans mot de passe :

1. Saisir votre NPI (13 chiffres, inscrit sur la carte d'identité ou le certificat
   d'identification personnelle) et le numéro de téléphone qui y est relié (`01 XX XX XX XX`),
   puis « Recevoir mon code sur WhatsApp ».
2. Saisir le code à six chiffres reçu sur WhatsApp, valable 5 minutes. Un nouveau code peut être
   demandé au bout de 60 secondes.

À la première connexion, un compte est créé et le NPI y est lié, en attente de vérification par
l'ANIP. Aux connexions suivantes, le numéro doit être présenté avec ce même NPI. Les rôles
institutionnels (ministère, coopérative, acheteur) sont attribués par un administrateur à un
compte déjà identifié par son NPI.

Hors production, quand un code de démonstration est configuré, la liste des comptes de
démonstration s'affiche sous le formulaire : le bouton « Utiliser » remplit le NPI et le numéro,
et le code de démonstration affiché remplace le message WhatsApp.

---

## Agricultrice / agriculteur

Espace pensé pour un téléphone d'entrée de gamme, en réseau intermittent.

1. **Accueil** (`/agriculteur`) : vos exploitations, un raccourci vers la déclaration de récolte
   et vos alertes actives.
2. **Déclarer une récolte** : choisissez la culture proposée pour la campagne en cours (les
   cultures et parcelles viennent de votre exploitation, pas d'une saisie libre), indiquez la
   quantité et l'unité locale (sac de 50 ou 100 kg, tas, bassine, régime…), les pertes éventuelles.
   La déclaration part immédiatement si vous êtes en ligne.
3. **Météo** (`/agriculteur/meteo`) : prévisions et alertes en cours pour votre commune.
4. **Alertes** (`/agriculteur/alertes`) : stress hydrique ou excès de pluie signalé pour votre
   zone et vos cultures, avec ce qu'il faut faire.
5. **Historique** (`/agriculteur/historique`) : vos récoltes déclarées, campagne par campagne.

Capture : [accueil, mobile](rapports/captures/etape-5/agriculteur-accueil-mobile.png),
[déclarer une récolte, mobile](rapports/captures/etape-5/agriculteur-recolte-mobile.png),
[météo, mobile](rapports/captures/etape-6/agriculteur-meteo-mobile.png),
[fiche d'alerte, mobile](rapports/captures/etape-6/agriculteur-alerte-fiche-mobile.png).

---

## Agent de terrain

Le seul espace pensé pour fonctionner **hors ligne** : premier lancement en réseau, puis
enregistrement, vérification et synchronisation même en zone blanche.

1. **Premier lancement** (`/agent/premier-lancement`) : télécharge le référentiel (communes,
   cultures, campagnes) et vos exploitations assignées pour un usage hors ligne. À faire une fois,
   en réseau, avant une tournée de terrain.
2. **Enregistrer une exploitation** (`/agent/enregistrer`) : parcours guidé en plusieurs étapes
   (producteur, exploitation, parcelle avec relevé GPS ou tracé à main levée, culture). Fonctionne
   hors ligne ; chaque saisie part dans une file d'attente locale (l'« outbox »).
3. **Mes exploitations** (`/agent/exploitations`) : celles de votre commune, avec leur statut de
   vérification.
4. **Vérification** (`/agent/verification`) : confirmez, corrigez ou contestez une exploitation
   déclarée lors d'une visite. C'est la seule action qui fait passer une exploitation au statut
   « vérifiée sur le terrain » — ni une déclaration en ligne, ni un simple relevé GPS depuis un
   autre rôle n'y suffisent.
5. **Synchronisation** (`/agent/synchronisation`) : l'état de votre file d'attente. Un bandeau
   signale les saisies non encore envoyées ; la synchronisation reprend automatiquement au retour
   du réseau.
6. **Tableau de bord** (`/agent/tableau-de-bord`) : les indicateurs de votre commune uniquement.
7. **Alertes** (`/agent/alertes`) : à relayer de vive voix aux producteurs sans téléphone.

**Se déconnecter sur un appareil partagé** : le bouton « Se déconnecter » vide les données mises
en cache de votre compte sur cet appareil (registre local, pages hors ligne). S'il reste des
saisies non envoyées dans la file d'attente, un message le signale avant de continuer — elles
seraient perdues.

Captures : [accueil agent, desktop](rapports/captures/etape-5/agent-accueil-desktop.png),
[enregistrer, mobile](rapports/captures/etape-5/agent-enregistrer-mobile.png),
[vérification, mobile](rapports/captures/etape-5/agent-verification-mobile.png),
[synchronisation, desktop](rapports/captures/etape-5/synchronisation-desktop.png),
[fiche d'exploitation, desktop](rapports/captures/etape-5/agent-fiche-desktop.png),
[tableau de bord de l'agent, desktop](rapports/captures/etape-7/agent-tableau-de-bord-desktop.png)
et [mobile](rapports/captures/etape-7/agent-tableau-de-bord-mobile.png),
[alertes, desktop](rapports/captures/etape-6/agent-alertes-desktop.png).

---

## Coopérative

L'espace coopérative (`/cooperative`) affiche les indicateurs et la production agrégée des
exploitations de vos membres, avec le même seuil de confidentialité que le pilotage national
(aucun chiffre en dessous de cinq exploitations).

À ce jour, le registre ne relie pas encore les exploitations aux organisations coopératives :
l'espace l'indique explicitement (« Votre organisation n'est pas encore rattachée à des
exploitations ») plutôt que d'afficher des zéros trompeurs. Cette liaison est prévue dans une
étape ultérieure.

Capture : [espace coopérative, état vide](rapports/captures/etape-7/cooperative-desktop.png).

---

## Acheteur

L'espace acheteur (`/acheteur`) présente aujourd'hui les trois usages prévus — rechercher des
productions vérifiées par produit, zone et volume ; s'appuyer sur le badge de vérification
terrain ; publier une demande d'achat — comme un accueil d'orientation. Le module de mise en
relation (marché) n'est pas encore construit ; cet espace sera complété dans une étape ultérieure
sans changer d'adresse ni de connexion.

---

## Ministère (pilotage national)

Connexion par le parcours commun (NPI, numéro relié, code WhatsApp) ; le rôle ministère est
attribué au compte par un administrateur. Une session ministère dure 12 heures au plus.

1. **Vue nationale** (`/pilotage`) : six indicateurs avec provenance et fiabilité (producteurs,
   exploitations, superficies déclarée et relevée, part vérifiée, production déclarée), carte des
   communes, production par culture, comparaison de campagnes, alertes en cours, qualité des
   données. Les filtres (campagne, culture, département, statut de vérification) se reflètent dans
   l'adresse : un lien partagé rouvre exactement la même vue.
2. **Territoires** (`/pilotage/territoires`) : douze départements puis leurs communes, tableau
   triable.
3. **Fiche commune** (`/pilotage/communes/[code]`) : chiffres comparés aux moyennes départementale
   et nationale, cultures, couverture terrain (agents, visites récentes), météo et alertes.
4. **Qualité des données** (`/pilotage/qualite`) : fraîcheur des statistiques, écarts entre
   superficies déclarée et relevée, exploitations anciennes non vérifiées, communes sans agent.
5. **Règles d'alerte** (`/pilotage/regles`) : conditions de déclenchement (seuils météo, cultures
   concernées), activation/désactivation, simulation avant mise en service.
6. **Exports** : CSV compatible avec un tableur français, et fiche imprimable A4 pour une
   présentation hors écran.

**Secret statistique** : toute case résumant moins de cinq exploitations est masquée (« secret
statistique »), y compris sur la carte publique `/carte` et l'API `/api/v1/territory/stats` — pas
seulement dans les écrans réservés au ministère.

Captures : [vue nationale, desktop](rapports/captures/etape-7/pilotage-national-desktop.png) et
[mobile](rapports/captures/etape-7/pilotage-national-mobile.png),
[production et campagnes](rapports/captures/etape-7/pilotage-production-desktop.png),
[carte des communes](rapports/captures/etape-7/pilotage-carte-desktop.png),
[territoires](rapports/captures/etape-7/pilotage-territoires-desktop.png),
[fiche commune](rapports/captures/etape-7/pilotage-commune-fiche-desktop.png),
[qualité des données](rapports/captures/etape-7/pilotage-qualite-desktop.png),
[fiche imprimable](rapports/captures/etape-7/pilotage-fiche-impression.png),
[règles, liste](rapports/captures/etape-6/pilotage-regles-desktop.png) et
[fiche d'une règle](rapports/captures/etape-6/pilotage-regle-fiche-desktop.png),
[alertes](rapports/captures/etape-6/pilotage-alertes-desktop.png).

---

## Questions transverses

- **Accès refusé** : chaque espace est réservé à son rôle ; une tentative d'accès à un autre
  espace redirige vers un écran explicite plutôt qu'une erreur technique
  ([capture](rapports/captures/etape-3/acces-refuse-mobile.png)).
- **Compte** (`/compte`) : téléphone, rôles attribués, NPI masqué et statut de sa vérification,
  appareils connectés (chacun peut être déconnecté à distance).
- **Provenance des chiffres** : chaque indicateur agrégé affiche sa source et sa fiabilité
  (déclaratif ou vérifié sur le terrain) — jamais un chiffre présenté sans origine.
