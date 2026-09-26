# Démonstration de BAIS à l'État : scénario de 15 minutes

Document de conduite de la démonstration. Il suit, écran par écran, la section 8 du plan d'action : le pays vu du ciel, la descente jusqu'au champ, les chiffres, l'action, le terrain et le producteur.

Chaque séquence donne l'écran à ouvrir, les gestes, la phrase à dire et le plan B si un service externe ne répond pas.

Version de septembre 2026. Les écrans cités ont été vérifiés dans le code de la branche `develop`.

## 1. Rôles et matériel

| Poste | Qui le tient | Matériel |
|---|---|---|
| Écran du ministère | Le présentateur | Ordinateur relié au vidéoprojecteur, navigateur à jour, plein écran |
| Téléphone de l'agent | Un second intervenant | Téléphone Android avec l'application installée, écran dupliqué si possible |
| Téléphone du producteur | Le second intervenant | Second téléphone, ou le même avec changement de compte |
| Secours | Le présentateur | Clé USB avec les captures d'écran et une vidéo de chaque séquence |

## 2. Comptes de démonstration

Ces comptes n'existent que sur l'instance de démonstration. Ils sont affichés sous le formulaire de connexion hors production. Aucun message n'est envoyé à leurs numéros.

| Rôle | NPI | Téléphone | Code |
|---|---|---|---|
| Ministère | 1000000000003 | 0190000003 | 246810 |
| Agent de terrain (Djougou) | 1000000000001 | 0190000001 | 246810 |
| Agricultrice (Djougou) | 1000000000002 | 0190000002 | 246810 |

Connexion : ouvrir `/connexion`, saisir le NPI et le numéro, toucher « Recevoir mon code sur WhatsApp », puis saisir le code.

Le code 246810 est la valeur de `OTP_DEMO_CODE` sur l'instance de démonstration. Il ne fonctionne jamais en production.

## 3. Préparation

### La veille

1. Relancer l'instance de démonstration et remettre les données dans leur état initial.
2. Se connecter une fois avec chaque compte pour vérifier le code.
3. Sur le téléphone de l'agent, ouvrir « Préparer le hors-ligne » (`/agent/premier-lancement`) et télécharger la commune de Djougou.
4. Vérifier que la carte affiche les images satellite et les feux. Faire les captures de secours de chaque écran cité ci-dessous.
5. Préparer dans le palmarès les critères de la séquence 4, pour ne pas les chercher devant l'assemblée.

### Une heure avant

1. Vérifier la connexion Internet de la salle. Prévoir un partage de connexion par téléphone.
2. Ouvrir les onglets dans l'ordre des séquences, déjà connectés avec le compte du ministère.
3. Ouvrir le centre de veille et vérifier que le fil « Activité » affiche « En direct ».
4. Mettre le téléphone de l'agent en mode avion seulement au début de la séquence 5.

### Onglets à ouvrir sur l'écran du ministère

1. `/carte`
2. `/pilotage/veille`
3. `/pilotage/territoires`
4. `/pilotage/cultures`
5. `/pilotage/palmares`
6. `/pilotage/alertes`

## 4. Déroulé

### Séquence 1. Le pays vu du ciel (2 minutes)

**Écran 1 : la carte agricole** (`/carte`)

Gestes :
1. Afficher tout le pays.
2. Activer la couche « Carte des cultures ».
3. Survoler la légende des cultures.

À dire :
> « Voici le Bénin vu par les satellites européens Copernicus. Chaque couleur est une culture. L'État voit depuis son bureau où l'on cultive le maïs, le coton, le riz, sans attendre la remontée des enquêtes. »

La carte porte la mention « Estimation satellite, à confirmer ». Il faut la lire à voix haute : c'est un gage de sérieux.

**Écran 2 : le centre de veille** (`/pilotage/veille`)

Montrer :
- le fil « Activité », marqué « En direct » ;
- les feux des dernières 24 heures ;
- les alertes actives et les foyers à confirmer ;
- la fraîcheur des sources.

À dire :
> « Le centre de veille rassemble ce qui arrive du terrain et du ciel : feux de brousse, alertes, signalements groupés, demandes des producteurs. Chaque fait s'affiche à son arrivée. »

Précision honnête à donner si la question vient :
> « Le satellite n'est pas une vidéo en direct. Les feux arrivent quelques heures après le passage du satellite. Les images de végétation, tous les cinq jours quand les nuages le permettent. »

**Plan B**
- Images satellite absentes (« Catalogue satellite momentanément injoignable ») : rester sur la carte des communes, puis montrer la capture de la carte des cultures.
- Feux absents : montrer le panneau « Fraîcheur des sources », qui dit l'heure de la dernière lecture. Dire que le service de la NASA est momentanément injoignable et que la plateforme le signale d'elle-même.
- Fil d'activité sur « Reconnexion » : recharger la page une fois, sinon passer à la suite.

### Séquence 2. Descendre jusqu'au champ (3 minutes)

**Écran : territoires puis carte** (`/pilotage/territoires`, puis `/carte`)

Gestes :
1. Dans « Territoires », choisir le Borgou, puis une commune (par exemple Tchaourou, commune pilote du modèle de cultures).
2. Montrer la fiche commune.
3. Sur la carte, filtrer le département du Borgou et la culture du coton, puis zoomer jusqu'aux parcelles.
4. Cliquer une parcelle de coton.

La fiche de la parcelle montre :
- le producteur, son code, son exploitation, son village et le statut de vérification ;
- son numéro de téléphone, cliquable pour l'appeler ;
- la superficie déclarée et la superficie mesurée sur le contour ;
- la méthode de relevé du contour ;
- la culture de la campagne en cours ;
- la « Vue du satellite » : la courbe de végétation de la saison, comparée au niveau attendu pour la culture ;
- les rendements des campagnes passées, comparés aux parcelles voisines de la même commune.

À dire :
> « Nous sommes dans un champ de coton du Borgou. Nous savons qui le cultive : le producteur est identifié par son numéro personnel d'identification, le NPI. Ce numéro est conservé chiffré et n'apparaît jamais à l'écran. Nous voyons comment la culture pousse cette saison, et ce que ce champ a rendu face à ses voisins. »

> « Si le contour de ce champ recouvre celui d'un autre, la fiche le signale. C'est souvent le premier signe d'un conflit foncier. »

**Variante à Djougou.** Zoomer sur Djougou et activer la couche « Champs détectés ». Environ 1 100 champs y sont déjà délimités par le satellite, dans un rayon de 10 km. L'agent n'a plus à dessiner : il touche le champ et l'attribue au producteur.

**Plan B**
- Fiche en erreur (« La fiche n'a pas pu être chargée ») : fermer la fiche et cliquer une autre parcelle. Sinon, montrer la capture.
- Courbe satellite absente : la parcelle n'a pas encore été lue. En choisir une autre dans une commune pilote.

### Séquence 3. Les chiffres qui tiennent (3 minutes)

**Écran : surfaces par satellite** (`/pilotage/cultures`)

Montrer :
- par culture, la surface vue par satellite et la surface déclarée au registre ;
- le taux d'enrôlement et les surfaces restant à enregistrer ;
- la section « Précision de la carte » : la culture déclarée des parcelles vérifiées, comparée à la classe vue par le satellite, et la précision globale.

À dire :
> « Chaque chiffre porte sa source et sa date. La précision de la carte est mesurée sur des parcelles vérifiées par les agents, jamais sur celles qui ont servi à l'entraîner. »

**Ce qu'il ne faut pas dire.** La passe nationale actuelle surestime les surfaces : elle compte environ 2 millions d'hectares de coton, contre 0,6 à 0,7 million dans les statistiques publiques. L'écran porte la mention « Estimation satellite, à confirmer ». Ne citer aucune surface nationale. Parler de méthode et de précision mesurée.

Réponse si la question vient :
> « La règle de classement a été corrigée. La prochaine passe nationale sera recalée sur un échantillon de terrain, avec une marge d'erreur pour chaque chiffre, selon la méthode de l'Agence spatiale européenne avec les instituts statistiques du Sénégal et du Mali. »

Écrans complémentaires, si le temps le permet : « État des cultures » (`/pilotage/etat-des-cultures`) et « Prévisions » (`/pilotage/previsions`).

**Plan B.** Tableau vide (« Non calculé ») : montrer la capture. Dire que le calcul se fait hors de la consultation, une fois par mois, dans un budget satellite fixé.

### Séquence 4. Agir (3 minutes)

**Écran 1 : le palmarès** (`/pilotage/palmares`)

Gestes :
1. Choisir le coton, la dernière campagne close et le département du Borgou.
2. Montrer le classement : rang, production, surface, rendement, vérification.
3. Toucher « Former un groupe » et nommer le groupe, par exemple « 100 meilleurs producteurs de coton du Borgou ».

À dire :
> « Par défaut, seules comptent les exploitations vérifiées par un agent : la prime doit aller au meilleur producteur, pas au meilleur déclarant. Ce classement nominatif est réservé au ministère. Chaque consultation est journalisée. »

**Écran 2 : le groupe** (`/pilotage/groupes/[id]`)

Montrer :
- les membres dans l'ordre du palmarès ;
- l'accord WhatsApp de chacun ;
- le lien « Voir le champ » ;
- la zone « Message WhatsApp aux membres ».

Écrire un message court, par exemple : « Réunion des lauréats le lundi 12 à Parakou, 10 heures. »

À dire :
> « Le message ne part qu'aux producteurs qui ont donné leur accord. Il ne contient ni lien ni adresse, pour qu'un compte compromis ne puisse pas diffuser de lien frauduleux depuis le numéro officiel. »

Point de vigilance : les producteurs du jeu de démonstration sont fictifs. La plateforme n'envoie jamais de message à une fiche de démonstration. Le message apparaît dans « Messages envoyés », mais aucun téléphone ne sonne. Pour qu'un téléphone reçoive le message devant l'assemblée, il faut ajouter au groupe un producteur réel, volontaire, ayant donné son accord [à compléter : numéro de test et accord écrit de la personne].

**Écran 3 : où envoyer les agents** (`/pilotage/cultures`, section « Communes où envoyer les agents en premier »)

À dire :
> « La plateforme classe les communes où les surfaces vues par le satellite sont les moins couvertes par le registre. C'est là que les agents vont en premier. »

**Écran 4 : l'alerte de sécheresse** (`/pilotage/alertes`)

Gestes :
1. Ouvrir l'alerte « Poche de sécheresse après semis » de Djougou.
2. Montrer la liste des exploitations concernées et le résumé de la diffusion : envoyés, lus, en échec, à prévenir de vive voix.

À dire :
> « Douze jours sans pluie après les semis à Djougou. La plateforme a trouvé les producteurs concernés. Ceux qui ont donné leur accord sont prévenus sur WhatsApp. Les autres le sont de vive voix par leur agent. »

**Plan B**
- WhatsApp injoignable : les messages restent en file et repartent seuls. Le montrer dans le résumé de la diffusion (« Non envoyés »).
- Palmarès vide : vérifier les critères (culture, campagne close, département). Sinon, ouvrir un groupe formé la veille.

### Séquence 5. Sur le terrain (3 minutes)

**Écran : le téléphone de l'agent**, compte agent de Djougou, mode avion activé.

Gestes :
1. Accueil de l'espace agent : montrer l'indicateur de saisies en attente.
2. « Enregistrer » (`/agent/enregistrer`) :
   - « Quel producteur ? » : « Nouveau producteur », nom et prénom ;
   - « Où se trouve l'exploitation ? » : « Depuis votre position » ;
   - « Quelle taille ? » : une parcelle de 1,5 ha ;
   - « Quelles cultures ? » : maïs ;
   - « Mode de faire-valoir » : propriétaire ;
   - toucher « Enregistrer ».
3. L'écran confirme : « Elle partira dès que le réseau reviendra. Vous pouvez continuer votre tournée. »
4. Couper le mode avion. Ouvrir « Synchronisation » et laisser partir la saisie.
5. Sur l'écran du ministère, revenir au centre de veille : « Exploitation enregistrée » apparaît dans le fil « Activité ».

À dire :
> « L'agent travaille sans réseau, au milieu du champ. Tout est gardé sur le téléphone. Dès que le réseau revient, la saisie part, et le ministère la voit arriver. »

Pour aller plus loin, si le temps le permet : ouvrir une exploitation déjà synchronisée, puis « Contour de parcelle » et « Proposer un contour ». Le satellite propose le contour du champ, l'agent le valide. Cette proposition demande du réseau.

**Plan B**
- Pas de réseau dans la salle au moment de synchroniser : utiliser le partage de connexion d'un autre téléphone.
- La saisie n'apparaît pas dans le fil : recharger le centre de veille. Sinon, montrer la vidéo de secours de la séquence.
- Position GPS introuvable en salle : choisir la commune à la main.

### Séquence 6. Pour le producteur (1 minute)

**Écran : le téléphone du producteur**, compte agricultrice de Djougou.

Gestes :
1. Accueil (`/agriculteur`) : ses cultures de la campagne et sa dernière récolte.
2. « Alertes » : l'alerte de sécheresse de Djougou, dans ses mots.
3. « Mon attestation » (`/agriculteur/attestation`) : toucher « Établir mon attestation ».
4. Scanner le code QR de l'attestation avec un autre téléphone : la page publique « Vérification d'attestation » s'ouvre, sans connexion.

À dire :
> « Le producteur voit ses champs, reçoit l'alerte qui le concerne et prouve qu'il cultive. Une banque, une assurance ou un programme de subvention vérifie l'attestation en scannant son code, sans compte et sans appeler personne. »

**Plan B.** Le code QR ne se lit pas à cause des reflets : saisir le numéro de l'attestation sur `/verifier`.

## 5. Conclusion (30 secondes)

> « Ce que vous avez vu fonctionne aujourd'hui sur des données de démonstration. Pour passer aux données réelles, trois accords sont nécessaires : l'ANIP pour vérifier le NPI des producteurs, l'ANDF pour rattacher les champs au foncier, et l'IGN pour les images fines. Les demandes sont prêtes. La déclaration à l'Autorité de protection des données personnelles aussi. »

## 6. Questions probables

| Question | Réponse |
|---|---|
| Les données personnelles sont-elles protégées ? | Le NPI est chiffré. Chaque lecture nominative est journalisée. Un agent ne voit que les exploitations qu'il a enregistrées. Les chiffres publiés masquent tout groupe de moins de 5 exploitations. Le dossier de conformité est prêt pour l'APDP. |
| Où sont hébergées les données ? | [à compléter : hébergement retenu pour la production]. Un hébergement hors du Bénin exige une autorisation de l'APDP. |
| Le NPI est-il vérifié auprès de l'ANIP ? | Pas encore. Le branchement est prêt côté plateforme. Il attend la convention avec l'ANIP par la plateforme d'interopérabilité X-Road. |
| Combien coûtent les images satellite ? | Les données Copernicus sont gratuites. Le calcul est plafonné par un budget mensuel fixe d'unités de traitement, suivi en continu. |
| Que se passe-t-il sans smartphone ? | L'agent relaie les alertes de vive voix. L'accès par SMS et par code court est prévu, une fois un opérateur choisi. |
| Le satellite peut-il se tromper ? | Oui. Il propose, l'agent confirme. La confiance est affichée, et la précision est mesurée sur le terrain. |

## 7. Écrans en cours de livraison

Ces écrans figurent dans le plan d'action mais ne sont pas encore sur `develop`. Ne pas les annoncer comme disponibles sans les avoir vérifiés sur l'instance le jour même.

| Écran | Remplacement pendant la démonstration |
|---|---|
| Salle de situation en plein écran | Centre de veille en plein écran du navigateur (touche F11) |
| Culture mesurée par le satellite, avec sa confiance, sur la fiche de parcelle | Section « Précision de la carte » des surfaces par satellite |
| Surfaces par culture avec marge d'erreur | Annoncer la méthode (séquence 3), sans chiffre |
| Toucher un champ détecté pour l'enregistrer | Couche « Champs détectés » et « Proposer un contour » |
| Message à un seul producteur depuis la fiche d'un champ | Appel par le numéro de la fiche, ou message au groupe |
