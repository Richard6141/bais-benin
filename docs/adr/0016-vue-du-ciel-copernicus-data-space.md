# ADR-0016 — Vue du ciel : Sentinel-2 depuis le Copernicus Data Space Ecosystem, calcul côté Copernicus

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : Utilisateur (ministère), chef d'équipe

## Contexte

La carte agricole et le registre doivent montrer ce que voit le satellite : une image récente du
territoire, un indice de végétation (NDVI), puis la confrontation entre la culture déclarée sur
une parcelle et le couvert réellement observé. docs/02 et docs/09 réservaient déjà un port
`RemoteSensingProvider` pour cela.

Contraintes posées :

1. **Données Copernicus brutes, sans intermédiaire commercial** (décision de l'utilisateur) : ni
   Sentinel Hub commercial, ni Google Earth Engine, ni mosaïque revendue par un tiers.
2. **Pas de traitement raster local** : la machine de démonstration n'a qu'environ 2 Go de
   mémoire libre, un GDAL qui reprojette des scènes de 800 Mo n'est pas envisageable, et le
   déploiement Vercel (ADR-0006) n'a pas de disque durable.
3. **Quota gratuit du compte CDSE** : 10 000 requêtes et 10 000 unités de traitement par mois
   pour les API de traitement, 300 par minute.
4. **Provenance** : la licence Copernicus est libre et gratuite, avec attribution obligatoire
   (« Contains modified Copernicus Sentinel data »).

## Options examinées

| Option | Avantages | Inconvénients |
|---|---|---|
| Téléchargement des scènes (OData, S3 `eodata`) et calcul local du NDVI | Maîtrise totale | Scènes de 500 Mo à 1 Go, GDAL et reprojection en mémoire : exclu par la contrainte 2 |
| openEO sur CDSE | Standard ouvert, gratuit | Traitements asynchrones par lots : adapté aux séries, pas à des tuiles servies à la volée |
| API Process et Statistical du CDSE, catalogue STAC public | Calcul côté Copernicus, réponse synchrone (PNG ou JSON), catalogue sans compte | Quota mensuel à garder ; compte CDSE gratuit à créer |
| Sentinel Hub commercial, Google Earth Engine, mosaïques tierces | Plus simple, mosaïques sans nuages | Exclu par la contrainte 1 |

Les API de traitement retenues sont celles de l'infrastructure Copernicus Data Space Ecosystem
elle-même (`sh.dataspace.copernicus.eu`), ouvertes à tout compte CDSE gratuit. Elles lisent
directement les archives Sentinel-2 de Copernicus : aucun compte ni contrat chez un fournisseur
commercial n'est nécessaire.

## Décision

- **Catalogue STAC public** (`stac.dataspace.copernicus.eu/v1`, sans compte) : pour chacun des
  douze derniers mois, les scènes Sentinel-2 L2A dégagées (moins de 30 % de nuages, filtre CQL2)
  sur l'emprise du Bénin. Le sélecteur de mois de la carte en affiche le nombre ; le mois proposé
  par défaut est le plus récent qui couvre le pays. Le résumé est gardé six heures en mémoire,
  puis rafraîchi en arrière-plan.
- **Images (API Process)**, couleur naturelle et NDVI, calculées côté Copernicus à partir de la
  scène la moins nuageuse du mois (`mosaickingOrder: leastCC`). Le NDVI masque nuages, ombres et
  neige (classes SCL) ; ses classes de couleur viennent d'un seul jeton (`ndviScale`), partagé
  avec la légende. Deux niveaux :
  - une image d'ensemble du pays par couche et par mois (1 000 × 2 000 px environ, une requête),
    publique ;
  - des tuiles de 512 px du zoom 9 au zoom 13, réservées aux comptes connectés pour qu'un robot
    anonyme ne vide pas le quota.
- **Cache en base** (`satellite_tile`) : une image demandée une fois ne l'est plus. Un mois révolu
  ne change plus (cache définitif) ; le mois en cours expire au bout de deux jours pour prendre
  les nouveaux passages. Le service worker garde aussi les images sur l'appareil.
- **Garde-fou de quota** (`satellite_usage`) : chaque appel de traitement réserve d'abord sa place
  sous `SATELLITE_MONTHLY_REQUEST_BUDGET` (9 000 par défaut), dans la même requête SQL que
  l'incrément. Au-delà, seul le cache est servi jusqu'au mois suivant. Une tuile hors de l'emprise
  du Bénin n'est jamais demandée, ni un mois hors des douze proposés (refusé avant le cache et le
  quota : sinon un robot pourrait demander chaque mois de 1900 à 2099). L'image d'ensemble
  publique est en plus limitée à 60 demandes par adresse et par tranche de cinq minutes.
- **Statistiques NDVI par parcelle (API Statistical)**, pour la confrontation déclaration /
  satellite (phase 1, étape 2) : NDVI moyen par décade sur la géométrie de la parcelle, pixels
  nuageux exclus, une requête par parcelle et par saison, sous le même garde-fou.
- **Adaptateur fixture** (`SATELLITE_PROVIDER=fixture`) : séries NDVI synthétiques par régime de
  pluies, sans réseau, pour la démonstration et les tests ; il ne produit pas d'image.
- **Attribution** : la mention Copernicus accompagne chaque image (contrôle d'attribution de la
  carte, légende) et chaque valeur dérivée ; la source `COPERNICUS_S2` est ajoutée au référentiel
  des sources, fiabilité `ESTIMATED`.

Variables d'environnement (noms seulement, jamais de valeur dans le dépôt) :

| Variable | Rôle | Défaut |
|---|---|---|
| `SATELLITE_PROVIDER` | `cdse` ou `fixture` | `cdse` |
| `CDSE_CLIENT_ID` | Identifiant du client OAuth du compte CDSE | absent |
| `CDSE_CLIENT_SECRET` | Secret de ce client OAuth | absent |
| `SATELLITE_MONTHLY_REQUEST_BUDGET` | Plafond mensuel de requêtes de traitement | 9 000 |
| `CDSE_STAC_URL`, `CDSE_PROCESSING_URL`, `CDSE_TOKEN_URL` | Points d'accès, à ne changer qu'en cas de migration du CDSE | adresses publiques du CDSE |

Le client OAuth se crée dans le tableau de bord du CDSE (User Settings, OAuth clients) ; le
secret n'est affiché qu'une fois. Sans ces deux variables, la carte propose les mois (catalogue
public) mais pas les images.

## Conséquences

- Aucun calcul raster ne tourne chez BAIS : le serveur ne manipule que des PNG déjà rendus et du
  JSON de statistiques.
- Le quota gratuit borne l'usage : environ 9 000 tuiles ou statistiques par mois. Une campagne de
  confrontation sur toutes les parcelles relevées devra étaler ses requêtes sur plusieurs mois ou
  passer par un compte institutionnel du ministère (quota supérieur), sans changer le code.
- En saison des pluies, même la scène la moins nuageuse du mois peut couvrir une partie du sud :
  l'image couleur naturelle le montre tel quel ; le NDVI laisse ces zones transparentes.
- **Étape suivante, non livrée** : Sentinel-1 (radar, insensible aux nuages) pour suivre les
  cultures en pleine saison des pluies. Même port, même garde-fou ; collection `sentinel-1-grd`
  de l'API Process et indices radar (rapport VH/VV) à calibrer par culture. À ouvrir dans une ADR
  dédiée quand les profils NDVI de la saison sèche auront été confrontés au terrain.
