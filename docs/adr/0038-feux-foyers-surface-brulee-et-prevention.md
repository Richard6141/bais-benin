# ADR-0038 — Feux : foyer de feux par commune, surface brûlée par Sentinel-2 et prévention de saison

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0014, ADR-0022, ADR-0031

## Contexte

Depuis l'ADR-0022, les feux actifs de la NASA (FIRMS) sont lus toutes les 30 minutes. La règle `FIRE_NEAR_PARCELS_V1` prévient les producteurs dont une parcelle est à moins de 1 km d'un feu, ainsi que les agents qui les ont enregistrés. Le chantier K rend cette alerte plus utile :

- le moteur d'alertes et l'affichage sont traités par ailleurs (distance, direction, gravité selon la distance) ;
- cet ADR traite les trois suites utiles au ministère : la réponse coordonnée quand les feux se multiplient dans une commune, la mesure des dégâts après le feu, et la prévention avant la saison.

Toutes les trois reposent sur ce que FIRMS voit vraiment. Il faut donc d'abord le dire.

## Ce que FIRMS permet, et comment le dire

**Ce que voient les satellites**

- **Passages** :
  - trois satellites VIIRS (Suomi NPP, NOAA-20, NOAA-21) passent chacun vers 1 h 30 et 13 h 30 ;
  - MODIS (Terra et Aqua) passe vers 10 h 30, 13 h 30, 22 h 30 et 1 h 30.
  - Cela fait une dizaine d'observations par jour, groupées en début d'après-midi et au milieu de la nuit. Un feu allumé à 15 h et éteint à 21 h peut n'être vu par aucun satellite.
- **Délai** : FIRMS publie environ 3 heures après le passage. S'ajoutent 30 minutes au plus pour notre lecture et 10 minutes pour l'envoi des messages. Une alerte arrive donc 3 à 4 heures après le passage, jamais en temps réel.
- **Pixel** :
  - 375 m pour VIIRS (jusqu'à environ 800 m en bord de fauchée), 1 km pour MODIS ;
  - la position donnée est le centre du pixel : le feu peut être n'importe où dans ce carré ;
  - une distance « à 600 m de votre parcelle » est donc juste à quelques centaines de mètres près.
- **Ce qui est détecté** :
  - une source de chaleur, pas un incendie. En saison sèche, la plupart des détections au Bénin sont des brûlis volontaires : défrichement, résidus de récolte, feux pastoraux et de chasse, feux précoces de gestion ;
  - s'y ajoutent quelques fausses alertes : sites industriels chauds, reflets.
- **Ce qui échappe** :
  - un feu court entre deux passages, un feu couvant, un feu sous des nuages épais ou sous sa propre fumée ;
  - l'absence de détection ne prouve pas l'absence de feu.

**Les phrases à employer à l'écran et dans les messages**

- « Feu détecté par satellite (NASA FIRMS), pas un constat de terrain. »
- « Vu par satellite vers 13 h 30, il y a 4 heures. »
- « Position connue à quelques centaines de mètres près. »
- « Il peut s'agir d'un brûlis volontaire : vérifiez sur place si vous pouvez le faire sans danger. »
- « Aucun feu détecté ne veut pas dire aucun feu : nuages, fumée ou feu court entre deux passages. »

Une alerte ne dit jamais « incendie » ni « votre champ brûle ». Elle dit « feu détecté près de ».

## Décision

### 1. Foyer de feux dans une commune : réponse coordonnée

**Nouvel indicateur `fire_count_near_parcels`**

- Il compte les **foyers distincts** détectés dans les 24 dernières heures, en confiance nominale ou haute, à moins de 1 km d'une parcelle enregistrée active de la commune.
- Deux détections à moins de 750 m l'une de l'autre (deux pixels VIIRS) forment un même foyer, quel que soit le passage. Le même feu vu à 1 h 30 puis à 13 h 30 compte donc une seule fois.

**Nouvelle règle `FIRE_CLUSTER_COMMUNE_V1`**

- Catégorie FIRE, niveau commune, gravité CRITICAL, période de 12 heures.
- Condition : `fire_count_near_parcels >= 3`.
- Elle est éditable et simulable comme toute règle du moteur : seuil, texte, conseil.
- Message : « {commune} : {fire_foyers} foyers de feux détectés par satellite en 24 heures près de parcelles cultivées. »
- Conseil : prévenir la mairie et les sapeurs-pompiers (118), coordonner les agents, ne jamais envoyer personne face au feu.

**Destinataires**

- Les producteurs exposés, comme en ADR-0022.
- En plus, dans l'application : tous les agents dont le périmètre couvre la commune (commune ou département), et les comptes du ministère.
- Le moteur garde **une seule alerte active par commune et par catégorie**. Une alerte de feu déjà active et aussi grave, levée par une autre règle de feu, occupe donc la place. L'élargissement se fait alors dans le plan de diffusion : dès que la condition « foyer » tient dans la commune, toute alerte FIRE active de la commune reçoit aussi les agents de la commune et le ministère. La réponse coordonnée ne dépend pas de la règle qui a levé l'alerte.
- Un producteur déjà prévenu par l'alerte remplacée ne reçoit pas de second message WhatsApp ou SMS, sauf si un feu est désormais à moins de 500 m de sa parcelle. Cette montée en gravité doit toujours lui parvenir.
- Le texte et la gravité envoyés à chaque producteur restent ceux du feu le plus proche de sa parcelle, calculés à l'envoi. Les agents et le ministère reçoivent l'alerte de commune telle quelle.

### 2. Après le feu : surface brûlée par Sentinel-2 et déclaration de sinistre

**Parcelles mesurées.** Seules les parcelles **réellement exposées** sont mesurées :

- contour relevé (le centre seul ne permet pas de mesurer une surface) ;
- à moins de 500 m d'une détection de confiance nominale ou haute (un demi-pixel VIIRS et l'erreur de position) ;
- 0,25 ha au moins, soit 6 pixels de 20 m (en dessous, la mesure n'a pas de sens).

**Déclenchement**

- **À la demande** : un agent sur une exploitation de son périmètre, ou le ministère.
- **Sur alerte** : les parcelles exposées d'une alerte de feu levée.
- Jamais en passe systématique.
- La mesure est faite au moins 10 jours après la détection, pour disposer d'un passage après le feu, et au plus tard 30 jours après.

**Méthode : l'indice de brûlage normalisé (NBR)**

- Sentinel-2 L2A, bandes B8A (proche infrarouge) et B12 (infrarouge moyen) à 20 m. Nuages, ombres et eau sont masqués par la couche de classification de scène (SCL).
- Pour chaque pixel, deux valeurs : la dernière image nette dans les 20 jours avant la détection, et la première image nette dans les 15 jours après.
- `NBR = (B8A − B12) / (B8A + B12)`, puis `dNBR = NBR avant − NBR après`.
- Seuils de Key et Benson (2006), repris par UN-SPIDER :

  | dNBR | Lecture |
  | --- | --- |
  | moins de 0,10 | non brûlé |
  | 0,10 à 0,27 | brûlé possible |
  | 0,27 à 0,66 | brûlé |
  | au-delà de 0,66 | brûlé sévère |

- **Surface brûlée** : une fourchette. Le bas compte les pixels à 0,27 ou plus, le haut ceux à 0,10 ou plus, rapportés à la surface de la parcelle.
- Sous 60 % de pixels nets, la parcelle est notée « image insuffisante ».
- **Limite connue** : en saison sèche, une récolte ou une végétation qui sèche fait aussi baisser le NBR. D'où les fenêtres courtes, le seuil de 0,27 pour « brûlé », et la mesure réservée aux parcelles voisines d'une détection.

**Une requête Statistical par parcelle**

- La requête renvoie l'histogramme des classes en entiers 8 bits, sur les passages des deux fenêtres, soit environ 7 passages.
- **Coût estimé**, par la formule mesurée en ADR-0031 (plancher de 0,01 unité par passage) : `7 × 0,01 × 4/3 ≈ 0,09` unité par parcelle, arrondi à **0,1 unité**. Une mesure réelle sur 5 parcelles doit le confirmer avant toute activation.
- **Ordres de grandeur** : 5 à 50 parcelles exposées par foyer de feux, soit 0,5 à 5 unités.
- **Plafond mensuel** : `FIRE_BURN_MONTHLY_UNIT_CAP`, 100 unités par défaut, soit environ 1 000 parcelles. Au-delà, les demandes attendent le mois suivant.

**Interrupteur `FIRE_BURN_READS`**

- Désactivé par défaut. Aucune passe Copernicus réelle sans l'accord de l'utilisateur.
- En développement et en démonstration, la fixture produit une surface brûlée synthétique, marquée comme telle.

**Déclaration de sinistre**

- **Proposition** : dès qu'une parcelle a au moins 0,1 ha ou 10 % de sa surface estimés brûlés (bas de la fourchette), une déclaration est proposée. Elle est rattachée à l'exploitation, à la parcelle, à la détection et à la mesure, et porte la mention « estimation satellite, à confirmer sur le terrain ».
- **Validation sur place par l'agent** :
  - **confirmée** : avec la surface brûlée constatée, la culture et son stade ;
  - **écartée** : par exemple, brûlis volontaire du producteur, ou pas de dégât.
- **Suites** :
  - la déclaration confirmée est visible du producteur et du ministère, qui l'exporte en CSV pour les programmes d'assistance et les assureurs ;
  - chaque étape est inscrite au journal d'audit ;
  - la déclaration est une pièce, pas un paiement : rien n'est versé automatiquement.

### 3. Saison des feux : message de prévention hebdomadaire

**Période et cible**

- **Saison** : du 1er novembre au 30 avril, soit la saison sèche, où tombent l'essentiel des détections. Hors saison, la tâche ne fait rien.
- **Communes à forte densité de feux** :
  - la densité est le nombre de détections de confiance nominale ou haute pour 100 km² sur la saison passée (novembre à avril) ;
  - sont retenues les communes du tiers le plus touché, avec au moins 5 détections pour 100 km².
  - La lecture en continu n'a commencé qu'en septembre 2026. Tant que la saison passée n'est pas en base, la tâche prend la saison en cours depuis le 1er novembre. Un import de l'archive FIRMS (données hors dépôt) peut remplir la saison passée.

**Envoi**

- Une fois par semaine, le lundi, aux producteurs de ces communes qui ont donné leur accord WhatsApp.
- Le message passe par la file des messages aux producteurs (nouveau type `FIRE_PREVENTION`), avec ses garde-fous : accord vérifié à l'envoi, silence de 21 h à 6 h, trois essais au plus. Un seul message par producteur et par semaine.
- Texte : « Saison des feux : faites vos pare-feu autour des champs et des greniers, ne brûlez pas par grand vent, prévenez vos voisins avant un brûlis. Feu dangereux : 118. »

**Pas par le moteur d'alertes.** Une règle de prévention en catégorie FIRE prolongerait de 7 jours toute alerte de feu active de la commune (une alerte par commune et par catégorie). Et un conseil de saison n'est pas une alerte.

**Interrupteur `FIRE_PREVENTION_MESSAGES`, désactivé par défaut** : l'activer, c'est envoyer de vrais messages à de vrais producteurs. C'est la décision de l'utilisateur.

## Alternatives écartées

- **Une catégorie d'alerte à part pour le foyer de feux** : deux alertes actives en parallèle pour les mêmes feux, deux messages pour les mêmes producteurs.
- **La surface brûlée MODIS (MCD64A1)** : pixel de 500 m, publiée plusieurs semaines après le mois. Trop grossière pour une parcelle et trop tardive pour une assistance.
- **Mesurer toutes les parcelles d'une commune touchée** : un coût sans rapport avec les parcelles réellement exposées, et des faux brûlés dus aux récoltes.
- **La prévention par le moteur d'alertes** : voir §3.

## Conséquences

- **Base de données** :
  - un indicateur de règle et une règle par défaut, sans migration ;
  - une table des mesures de surface brûlée et une table des déclarations de sinistre ;
  - un type de message producteur.
- **Variables et tâches** :
  - variables `FIRE_BURN_READS`, `FIRE_BURN_MONTHLY_UNIT_CAP` et `FIRE_PREVENTION_MESSAGES`, toutes deux interrupteurs désactivés par défaut ;
  - deux tâches planifiées : les mesures de surface brûlée, chaque jour, et la prévention, le lundi.
- **Écrans** :
  - pour l'agent, les déclarations à valider dans son périmètre ;
  - pour le ministère, la liste et l'export des déclarations.
- **À décider par l'utilisateur** :
  - la mesure réelle sur 5 parcelles puis l'activation de `FIRE_BURN_READS` ;
  - l'activation de `FIRE_PREVENTION_MESSAGES` ;
  - l'import de l'archive FIRMS de la saison passée.
