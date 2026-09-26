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

**Agricultrices et agriculteurs** : à la première connexion, un compte d'agriculteur est créé et le
NPI y est lié, en attente de vérification par l'ANIP. Si l'agent de la commune vous a déjà
enregistré avec ce numéro, le compte est relié à votre fiche. Aux connexions suivantes, le numéro
doit être présenté avec ce même NPI.

**Agents, ministère, coopératives et acheteurs** : la connexion ne crée jamais ces comptes. Ils
sont ouverts par l'administration avec le NPI et le numéro de la personne (ADR-0013) ; on se
connecte ensuite par le même formulaire.

Hors production, quand un code de démonstration est configuré, la liste des comptes de
démonstration s'affiche sous le formulaire : le bouton « Utiliser » remplit le NPI et le numéro,
et le code de démonstration affiché remplace le message WhatsApp.

---

## Agricultrice / agriculteur

Espace pensé pour un téléphone d'entrée de gamme, en réseau intermittent.

**Se déplacer dans l'espace.** Sur téléphone, une barre en bas de l'écran donne l'accueil, vos
champs, vos alertes et le signalement d'un problème ; le bouton « Plus » ouvre toutes les autres
rubriques. Sur ordinateur, les mêmes rubriques sont en onglets en haut de la page.

1. **Accueil** (`/agriculteur`) : une phrase dit la situation du jour (alertes de votre commune,
   demandes en cours), puis trois gestes : déclarer une récolte, signaler un problème, demander
   de l'aide. Suivent vos surfaces et votre campagne en bref.
2. **Mes champs** (`/agriculteur/champs`) : chaque parcelle, sa surface déclarée et mesurée, ce
   qui y pousse cette campagne, et un bouton qui l'ouvre sur la carte.
3. **Déclarer une récolte** : choisissez la culture proposée pour la campagne en cours (les
   cultures et parcelles viennent de votre exploitation, pas d'une saisie libre), indiquez la
   quantité et l'unité locale (sac de 50 ou 100 kg, tas, bassine ou régime), les pertes
   éventuelles. La déclaration part immédiatement si vous êtes en ligne ; l'écran propose ensuite
   de voir vos récoltes ou de revenir à l'accueil.
4. **Météo** (`/agriculteur/meteo`) : prévisions et alertes en cours pour votre commune.
5. **Alertes** (`/agriculteur/alertes`) : stress hydrique ou excès de pluie signalé pour votre
   zone et vos cultures, avec ce qu'il faut faire.
6. **Historique** (`/agriculteur/historique`) : vos récoltes déclarées, campagne par campagne.

Après un signalement ou une demande d'aide, l'écran propose la suite : suivre ce que vous venez
d'envoyer, en envoyer un autre ou revenir à l'accueil.

Capture : [accueil, mobile](rapports/captures/etape-5/agriculteur-accueil-mobile.png),
[déclarer une récolte, mobile](rapports/captures/etape-5/agriculteur-recolte-mobile.png),
[météo, mobile](rapports/captures/etape-6/agriculteur-meteo-mobile.png),
[fiche d'alerte, mobile](rapports/captures/etape-6/agriculteur-alerte-fiche-mobile.png).

---

## Agent de terrain

Le seul espace pensé pour fonctionner **hors ligne** : premier lancement en réseau, puis
enregistrement, vérification et synchronisation même en zone blanche.

**Se déplacer dans l'espace.** Sur téléphone, la barre du bas garde la tournée : accueil,
exploitations, enregistrer, à vérifier. Le bouton « Plus » ouvre les autres rubriques (alertes,
signalements, demandes, tableau de bord, assistant, synchronisation). Sur ordinateur, les
rubriques courantes sont en onglets et les autres dans le menu « Plus ».

**L'accueil** (`/agent`) dit la situation de votre commune en une phrase, puis « À faire
maintenant » : les alertes à relayer, les signalements à constater, les demandes à traiter, les
exploitations à vérifier, chacune avec son nombre et un lien direct. Suivent vos chiffres, les
dernières mises à jour et le fil d'activité en direct.

1. **Premier lancement** (`/agent/premier-lancement`) : télécharge le référentiel (communes,
   cultures, campagnes) et vos exploitations assignées pour un usage hors ligne. À faire une fois,
   en réseau, avant une tournée de terrain.
2. **Enregistrer une exploitation** (`/agent/enregistrer`) : parcours guidé en plusieurs étapes
   (producteur, exploitation, parcelle avec relevé GPS ou tracé à main levée, culture). Fonctionne
   hors ligne ; chaque saisie part dans une file d'attente locale (l'« outbox »). Dès que
   l'exploitation est reçue par le serveur, sa fiche s'ouvre d'elle-même et propose l'étape
   suivante : relever le contour de la première parcelle.
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
   Quatre chiffres en tête, puis un onglet à la fois : à vérifier, production, écarts, campagnes.
7. **Alertes** (`/agent/alertes`) : à relayer de vive voix aux producteurs sans téléphone.
8. **Demandes** (`/agent/demandes`) : une seule boîte pour les demandes d'aide adressées à l'État
   et les questions transmises depuis l'assistant. Chaque demande dit son origine ; les filtres
   « À traiter », « En cours » et « Toutes » donnent leur nombre.

**Se déconnecter sur un appareil partagé** : le bouton « Se déconnecter » vide les données mises
en cache de votre compte sur cet appareil (registre local, pages hors ligne). S'il reste des
saisies non envoyées dans la file d'attente, un message le signale avant de continuer, car elles
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
exploitations ») plutôt que d'afficher des zéros trompeurs. En attendant, il propose la carte de
la production de votre zone et la vérification de l'attestation d'un membre. Cette liaison est
prévue dans une étape ultérieure.

Capture : [espace coopérative, état vide](rapports/captures/etape-7/cooperative-desktop.png).

---

## Acheteur

L'espace acheteur (`/acheteur`) propose ce qui existe aujourd'hui : voir sur la carte où se
cultive un produit, vérifier l'attestation d'un producteur (`/verifier`) et consulter le palmarès
publié. La recherche de récoltes vérifiées par volume et les demandes d'achat ne sont pas encore
construites ; l'espace le dit, sans les promettre. Il sera complété sans changer d'adresse ni de
connexion.

---

## Ministère (pilotage national)

Connexion par le parcours commun (NPI, numéro relié, code WhatsApp) ; le compte ministère est
ouvert par l'administration, jamais par la connexion elle-même. Une session ministère dure 12 heures au plus.

### Se repérer dans le pilotage

L'accueil du pilotage (`/pilotage`) commence par la situation du jour en une phrase (alertes
graves, feux, foyers à confirmer, demandes en attente) et « À faire maintenant », à côté du fil
d'activité en direct. Le bouton « Salle de situation » ouvre la veille en plein écran. Suivent
quatre chiffres clés et les onglets Production, Campagnes, Carte, Alertes et Qualité.

Le pilotage est rangé en quatre thèmes. Choisissez d'abord un thème, puis une rubrique dans la
ligne qui s'affiche dessous. Sur téléphone et tablette, une seule liste « Rubrique du pilotage »
regroupe toutes les rubriques par thème.

- **Situation** : Vue nationale, Veille, Territoires, Alertes, Signalements, Demandes.
- **Cultures** : État des cultures, Surfaces satellite, Prévisions.
- **Producteurs** : Classement, Groupes.
- **Administration** : Qualité, Règles, Assistant.

Quand vous ouvrez une fiche (une commune, une alerte, une règle), la rubrique d'où elle vient reste
allumée.

### Centre de veille

La page **Veille** (`/pilotage/veille`) montre la situation du pays en temps réel. Elle se met à
jour seule chaque minute, sans recharger la page. L'heure de la dernière mise à jour est affichée
en haut, à l'heure de Porto-Novo.

- En haut, quatre chiffres : les feux détectés en 24 heures, les alertes actives, les foyers à
  confirmer et les demandes d'aide reçues en 24 heures.
- Au centre, la carte. Les communes sont colorées selon leur alerte la plus grave. Les feux
  apparaissent en points. Les boutons « 24 heures » et « 7 jours » changent la période des feux.
- À gauche, « Parcelles exposées aux feux » : les communes où un feu est passé à moins de 1 km de
  parcelles enregistrées, avec le nombre de producteurs touchés. Puis « État des cultures » : les
  trois cultures les plus en difficulté. Puis « Fraîcheur des sources » : si les feux, la météo et
  les chiffres du tableau de bord sont à jour.
- À droite, « Alertes actives », « Foyers à confirmer » et « Signalements groupés » (plusieurs
  signalements du même problème dans une même commune cette semaine).

Pour les demandes d'aide, la page ne donne que des nombres. Le détail d'une demande reste aux
agents de la commune. Chaque bloc a une aide « ? ».

### Feux actifs sur la carte

Sur la carte (`/carte`), le réglage **Feux actifs** affiche les feux vus par les satellites de la
NASA : « Masqués », « Dernières 24 heures » ou « 7 derniers jours ». Les feux sont mis à jour
toutes les 30 minutes.

- La couleur du point dit la force du feu : jaune pour un feu faible, orange pour un feu moyen,
  rouge foncé pour un feu fort.
- Un clic sur un point donne l'heure de détection (heure de Porto-Novo), la commune, les
  satellites qui l'ont vu, la confiance et la puissance.
- La légende indique combien de feux ont été détectés au Bénin sur la période.

Quand un feu est détecté à moins de 1 km d'une parcelle enregistrée, une alerte « Feu de brousse »
est levée. Elle prévient les producteurs concernés, s'ils ont donné leur accord, et les agents qui
ont enregistré leurs exploitations. Une détection par satellite n'est pas un constat : un brûlis
volontaire ou une fumée d'usine peuvent aussi être vus.

### État des cultures

La page **État des cultures** (`/pilotage/etat-des-cultures`) dit comment pousse la végétation
sur les parcelles contrôlées par satellite, pour la campagne en cours.

- Chaque parcelle contrôlée est comparée aux parcelles de la même culture dans la même zone. Elle
  est classée « Bon », « Moyen » ou « Faible ». « À vérifier » signale une végétation sans rapport
  avec la culture déclarée : un agent doit passer voir.
- Les parts sont calculées sur la surface. Une parcelle cachée par les nuages, ou dont la saison
  n'est pas finie, n'est pas encore jugée.
- Cliquez sur une culture pour voir sa répartition par département. Un département de moins de
  5 parcelles observées n'est pas détaillé, pour qu'on ne puisse pas reconnaître un producteur.
- Tant que le calcul mensuel ne tourne pas avec le compte Copernicus du ministère, un bandeau
  prévient que les résultats sont des données de démonstration.
- L'encadré « Méthode » explique le calcul en quelques lignes.

### Surfaces par satellite

La page **Surfaces satellite** (`/pilotage/cultures`) compare les surfaces cultivées vues par
satellite à celles déclarées au registre, pour la campagne en cours.

> **Attention.** La page affiche « Surfaces en cours de calibrage, probablement surestimées : à ne
> pas citer ». Tant que cet avertissement est là, ces chiffres servent à orienter le travail des
> agents. Ils ne doivent être ni publiés ni cités.

- Filtrez par culture et par département.
- Quatre chiffres : la surface « Vue par satellite », la surface « Déclarée au registre », le
  « Taux d'enrôlement » (la part de la surface vue qui est déclarée) et la surface « À
  enregistrer » (vue mais pas encore déclarée).
- Le tableau « Communes où envoyer les agents en premier » classe les communes selon l'écart entre
  ce qui est vu et ce qui est déclaré. Un clic ouvre la fiche de la commune.
- La page a quatre onglets : « Surfaces », « Précision de la carte », « Par parcelle » et
  « Surfaces par parcelle ». L'onglet ouvert reste dans l'adresse.
- L'onglet « Précision de la carte » dit combien de parcelles vérifiées sont bien reconnues.
- L'onglet « Par parcelle » concerne les communes pilotes, où la culture est mesurée sur le contour
  de chaque parcelle :
  - la précision « Sur une commune nouvelle » : chaque commune est jugée par un modèle qui ne l'a
    jamais vue, avec sa marge d'erreur. C'est ce chiffre qu'il faut citer ;
  - l'accord avec les déclarations, culture par culture ;
  - les « Désaccords à vérifier » : un clic sur une parcelle l'ouvre sur la carte.
- L'onglet « Surfaces par parcelle » donne les surfaces par culture de ces parcelles. Il les met
  face à la carte des pixels de la commune.
- Les surfaces sont recalculées une fois par mois, pendant les huit premiers jours.
- Le bouton « Carte des cultures » ouvre la carte correspondante.

### Carte des cultures

Sur la carte (`/carte`), choisissez « Carte des cultures » dans le réglage **Fond de carte**.

- Chaque carré d'environ 400 m prend la couleur de ce qu'il porte : maïs et cultures annuelles,
  coton, riz, cultures pérennes, maraîchage, jachère et sol nu, forêt et savane, eau, bâti.
- La carte est déduite de la végétation des 12 derniers mois, vue par le satellite Sentinel-2. Un
  champ plus petit qu'un carré n'apparaît pas.
- Elle porte deux mentions : « En cours de calibrage, à ne pas citer » et « Estimation satellite,
  à confirmer ». Les agents confirment sur le terrain.
- Elle est calculée une fois par mois et visible par tous, même sans connexion. Tant qu'elle
  n'est pas prête, la légende l'indique (« Carte en préparation »).

### Fiche d'une parcelle depuis la carte

1. Sur la carte, rapprochez-vous d'un village : les champs apparaissent. Sur un grand écran, un
   message vous y invite tant que vous êtes trop loin.
2. Cliquez sur un champ. Sa fiche s'ouvre à côté de la carte. L'adresse de la page garde la
   parcelle : vous pouvez envoyer le lien à un collègue.

La fiche montre :

- le producteur, son exploitation, sa commune et l'état de vérification ; le téléphone s'affiche
  seulement pour les comptes qui ont le droit de contacter le producteur ;
- les superficies déclarée et mesurée, et le mode d'arrosage ;
- la culture de la campagne en cours, son stade et la date de semis ;
- les rendements des campagnes passées, comparés aux autres parcelles de la commune (à partir de
  5 parcelles comparables) ;
- la « Vue du satellite » : « Cohérente avec la déclaration », « À vérifier sur le terrain »,
  « Trop de nuages pour conclure » ou « Saison en cours », avec la courbe de végétation. « À
  vérifier » demande une visite. Ce n'est jamais une sanction ;
- les signalements faits sur la parcelle.

Si le contour recouvre une autre parcelle, la fiche le signale : doublon, erreur de relevé ou
conflit foncier, à vérifier sur place.

Le ministère voit les parcelles de tout le pays. Un agent ne voit que les exploitations qu'il a
enregistrées, un producteur que ses champs. Chaque fiche ouverte par le ministère est inscrite au
journal.

### Classement des producteurs

Le **Classement** (`/pilotage/palmares`) classe les producteurs d'une culture pour une campagne.
Le mot « palmarès » est réservé à ce qui est publié sur la page publique `/palmares`.

1. Choisissez la culture, la campagne, le département et le classement : « Production totale »
   ou « Rendement à l'hectare » (au moins 0,5 ha). Par défaut, seules les exploitations
   vérifiées comptent.
2. Choisissez le nombre de producteurs, puis cliquez sur « Afficher le classement ».

Le tableau donne le rang, la commune, la production, le rendement et le téléphone. La colonne
« Palmarès public » dit qui a accepté d'être nommé publiquement. « Exporter en CSV » donne le même
tableau pour un tableur. Chaque consultation est inscrite au journal.

**Publier un palmarès.** Le bouton « Publier », en tête de page, met en ligne sur la page publique
`/palmares` les lauréats qui ont donné leur accord depuis leur compte. Seuls sont publiés le nom,
la commune, le rang et la production, jamais le téléphone. Choisissez le nombre de lauréats
(100 au plus), puis « Publier sur la page publique ». La liste « Palmarès publiés » permet de
retirer un palmarès ; elle a son onglet, à côté du classement. Un producteur qui retire son accord disparaît aussitôt des palmarès publiés.

### Groupes de producteurs

Un groupe réunit les producteurs d'un classement, pour les suivre et leur écrire.

1. **Former un groupe.** En tête du classement, le bouton « Former un groupe » propose de former
   un groupe avec les producteurs affichés et suggère un nom. Modifiez-le si besoin, puis cliquez sur « Créer le
   groupe ». Le groupe garde les critères du classement.
2. **Retrouver un groupe.** La page **Groupes** (`/pilotage/groupes`) liste les groupes avec leur
   culture, leur zone, leur campagne et leur nombre de membres. Les groupes archivés sont en
   dessous.
3. **Consulter.** La fiche du groupe donne le nombre de membres, la production totale, le
   rendement moyen et la part des membres qui acceptent les messages WhatsApp. Le tableau des
   membres a un lien « Voir le champ » vers la carte.
4. **Exporter.** « Exporter (CSV) » donne la liste des membres avec leur téléphone, pour un
   tableur. Chaque export est inscrit au journal.
5. **Écrire aux membres.** Seuls les membres qui ont donné leur accord WhatsApp reçoivent le
   message : la page dit combien avant l'envoi. Le message fait 500 caractères au plus, sans lien
   ni adresse e-mail. Il part du numéro officiel, signé « BAIS, ministère de l'Agriculture », et
   jamais entre 21 h et 6 h. Le même message ne peut pas être renvoyé au même groupe dans les
   10 minutes. La liste « Messages envoyés » montre ce qui est parti, en attente ou non envoyé.
6. **Archiver.** « Archiver le groupe » le garde consultable, mais il ne peut plus recevoir de
   message.

### Autres rubriques

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
statistique »), y compris sur la carte publique `/carte` et l'API `/api/v1/territory/stats`, et
pas seulement dans les écrans réservés au ministère.

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

## Premiers pas

Chaque accueil d'espace (ministère, agent, producteur) propose une carte « Premiers pas » : la
suite des gestes à découvrir pour ce rôle, avec la progression (« 2 étapes sur 6 »).

- **Ministère** : lire la situation du jour, ouvrir la veille, descendre jusqu'à un champ, lire
  l'état des cultures, comparer satellite et registre, former un groupe des meilleurs
  producteurs, exporter une fiche.
- **Agent** : préparer la tournée sans réseau, enregistrer un producteur, retrouver une
  exploitation, vérifier une exploitation, répondre aux producteurs, synchroniser.
- **Producteur** : voir ses champs, lire ses alertes, déclarer une récolte, signaler un problème,
  demander de l'aide, obtenir son attestation.

Toucher une étape ouvre son écran : le reste de la page s'assombrit légèrement, l'élément à
toucher est entouré, et une bulle dit ce que l'étape apprend et mène à la suivante. Une étape est
cochée dès que son écran est ouvert. La progression reste sur l'appareil, pour ce compte ; elle
n'est pas envoyée au serveur. La carte se masque, se rouvre et se réduit à une ligne une fois le
parcours fait (« Recommencer le parcours »).

**Mode démonstration.** Avec un compte de démonstration seulement, un bandeau discret en haut de
chaque page de l'espace propose le scénario suivant, et « Recommencer » remet la progression à
zéro. Les données de démonstration elles-mêmes ne sont pas réinitialisées par ce bouton.

---

## Questions transverses

- **Accès refusé** : chaque espace est réservé à son rôle ; une tentative d'accès à un autre
  espace redirige vers un écran explicite plutôt qu'une erreur technique
  ([capture](rapports/captures/etape-3/acces-refuse-mobile.png)).
- **Compte** (`/compte`) : téléphone, rôles attribués, NPI masqué et statut de sa vérification,
  appareils connectés (chacun peut être déconnecté à distance).
- **Provenance des chiffres** : chaque indicateur agrégé affiche sa source et sa fiabilité
  (déclaratif ou vérifié sur le terrain) — jamais un chiffre présenté sans origine.
