# ADR-0022 — Feux actifs NASA FIRMS en quasi temps réel et centre de veille

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : Utilisateur (priorité du jour), chef d'équipe, Backend/Data

## Contexte

Les feux de brousse menacent récoltes, greniers et animaux, surtout en saison sèche. Le ministère
veut les voir en quasi temps réel, prévenir les producteurs dont les parcelles sont touchées, et
suivre la situation du pays sur un écran qui se met à jour seul.

La NASA publie les détections de feux actifs de ses satellites (FIRMS : VIIRS à 375 m sur Suomi
NPP, NOAA-20 et NOAA-21, MODIS à 1 km sur Terra et Aqua), quelques heures après chaque passage.

Vérification faite le 26 septembre 2026 par de vrais appels :
- les fichiers publics régionaux « Northern_and_Central_Africa » en 24 heures et 7 jours sont
  accessibles **sans clé** (HTTP 200, de 0,25 à 1,7 Mo pour 24 heures par capteur) ;
- l'API par zone ou par pays exige une clé (« Invalid MAP_KEY. »).

## Décision

- **Source** : les quatre fichiers publics 24 heures (SNPP, NOAA-20, NOAA-21, MODIS), lus
  toutes les 30 minutes par `/api/v1/fires/ingest` (`CRON_SECRET`, `vercel.json`,
  planificateur Docker). Aucune clé. Variables : `FIRE_PROVIDER` (`firms` ou `fixture`) et
  `FIRMS_BASE_URL`. Si l'on veut plus tard ne télécharger que le Bénin, l'API par zone
  demanderait une variable `FIRMS_MAP_KEY` (non implémentée).
- **Territoire** : lignes filtrées sur l'emprise du Bénin à la lecture, puis gardées seulement
  si elles tombent dans une commune (PostGIS) ; chaque détection est rattachée à sa commune.
- **Dédoublonnage entre satellites** : deux lignes à moins de 375 m (un pixel VIIRS) et du même
  passage (une heure au plus d'écart) sont une seule détection, avec la liste des capteurs, la
  confiance et la puissance radiative les plus fortes et l'heure la plus ancienne. VIIRS est
  traité avant MODIS pour garder la position la plus fine. Un fichier relu ne crée rien : chaque
  détection garde les clés des lignes fusionnées.
- **Stockage** (`fire_detection`) : position, commune, capteurs, confiance (faible, moyenne,
  haute ; MODIS ramené aux seuils FIRMS 30 et 80), puissance radiative (MW), température de
  brillance, jour ou nuit, heure d'acquisition en **UTC**, affichée à l'heure de Porto-Novo.
  Donnée publique, sans lien avec une personne ; conservée un an. Chaque passage est tracé
  (`fire_ingestion_run`) pour la fraîcheur de la source.
- **Alerte « feu de brousse »** : nouvel indicateur du langage de règles `fire_near_parcels`
  (exploitations dont une parcelle, par son contour ou son centre, est à moins de 1 km d'un feu
  de confiance moyenne ou haute détecté dans les dernières 24 heures) et règle par défaut
  `FIRE_NEAR_PARCELS` (au moins une exploitation, gravité avertissement, refroidissement 12 h),
  catégorie d'alerte `FIRE`, source `NASA_FIRMS`, fiabilité estimée. Elle est évaluée après
  chaque passage d'ingestion pour les communes des parcelles proches des feux nouveaux.
- **Destinataires** : les producteurs des exploitations touchées seulement (pas toute la
  commune), par le circuit existant et selon leurs consentements (WhatsApp, SMS, relais oral) ;
  les agents qui ont enregistré ces exploitations (ADR-0014). Le ministère voit toutes les
  alertes. Une exploitation touchée plus tard pendant le même épisode est ajoutée aux
  destinataires.
- **Carte** (`/carte`) : couche « Feux actifs », masquée, 24 heures ou 7 jours (dans l'adresse,
  `?feux=`), cercles colorés selon la puissance, fenêtre d'information au clic, au-dessus des
  communes et des parcelles, mention NASA FIRMS dans la légende, l'attribution et les crédits.
  GeoJSON public `/api/v1/fires`, en cache court.
- **Centre de veille** (`/pilotage/veille`, ministère seulement) : synthèse relue chaque minute
  et feux toutes les cinq minutes, sans recharger la page (`/api/v1/veille`). On y trouve :
  - les feux des dernières 24 heures ou des 7 derniers jours, sur la carte des communes
    colorées par l'alerte la plus grave ;
  - les communes aux parcelles exposées (producteurs et feux) ;
  - les alertes en cours et les foyers à confirmer ;
  - les signalements groupés par commune et type ;
  - les volumes nationaux des demandes d'assistance (jamais une demande) ;
  - la fraîcheur des sources.

## Conséquences

- Le délai de bout en bout suit celui de FIRMS (en général quelques heures après le passage),
  plus 30 minutes au plus pour l'ingestion et 10 minutes pour l'envoi des messages.
- Environ 4,7 Mo téléchargés par passage, soit près de 230 Mo par jour. La clé FIRMS le réduirait
  à quelques kilo-octets.
- Une détection n'est pas un constat : fumées d'usine, brûlis volontaires et reflets donnent des
  fausses alertes ; les détections de confiance faible ne déclenchent jamais d'alerte.
- Cas limite accepté : deux lignes du même feu de part et d'autre de la frontière peuvent être
  fusionnées sur une position hors du Bénin, et la détection est alors écartée.
- La simulation d'une règle de feu sur l'historique n'est pas encore proposée.
