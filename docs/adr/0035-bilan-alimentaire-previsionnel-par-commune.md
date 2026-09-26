# ADR-0035 — Bilan alimentaire prévisionnel par commune

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0020, ADR-0033, ADR-0034

## Contexte

Le ministère veut repérer, environ trois mois avant la récolte, les communes où la production vivrière attendue ne couvrira pas les besoins de la population, pour préparer stocks, appuis ou achats avant la soudure.

La plateforme sait déjà prévoir une production (ADR-0020). Mais cette prévision multiplie des **surfaces déclarées au registre** par des rendements : elle ne porte que sur les exploitations enregistrées, une petite part des terres de chaque commune. Rapprochée de toute la population, elle mettrait toutes les communes en déficit : l'alerte serait fausse partout.

## Décision

### 1. Production attendue d'une commune

Surface de la culture dans **toute la commune** × rendement de référence de l'ADR-0020 (celui des deux dernières campagnes closes, commune, département, pays ou rendement type). La surface vient, dans cet ordre :

1. **Enquête aréolaire** (ADR-0033) : dans les communes d'enquête, la surface estimée des **céréales, racines et tubercules réunies**, avec sa marge, si elle est au moins indicative (CV de 20 % au plus). Elle est répartie entre les cultures selon les points où l'agent les a vues dans la commune ; à défaut de tels points, selon leurs parts déclarées au registre.
   - Pourquoi réunies : avec 120 points par commune, chaque culture seule a un CV de 20 à 50 %. Réunies, elles en ont environ 10 %. Filtrer culture par culture ne laissait qu'une ou deux cultures par commune, et un bilan fait du seul riz annonçait un déficit qui n'existait pas.
   - La nouvelle cible « Céréales, racines et tubercules » apparaît aussi dans l'onglet Sondage.
2. **Statistiques officielles** (ADR-0034) : sinon, la dernière surface DSA connue pour la commune et la culture, avec sa campagne.
3. **Sinon, la commune n'est pas évaluée.** Le registre seul ne sert jamais de production communale.

La marge de la surface par sondage se reporte sur la production et sur le bilan.

Correction de l'ADR-0033, apparue sur la démonstration : une culture vue sur deux ou trois points que la carte voit aussi donne une variance nulle, donc un CV nul et un chiffre « à citer ». Désormais, **au moins 10 points où la culture est vue** sont exigés avant de citer ou d'utiliser une surface par sondage.

### 2. Cultures retenues

Céréales, racines et tubercules : maïs, sorgho, mil, riz, igname, manioc, patate douce. C'est la catégorie que FAOSTAT suit pour la part de l'énergie alimentaire (« céréales, racines et tubercules »). Légumineuses, oléagineux, plantain, cultures de rente et maraîchage n'entrent pas dans ce bilan.

### 3. De la production aux calories

Pour chaque culture : `(production − semences) × (1 − pertes) × extraction × part comestible × énergie`.

| Culture | Semences (kg/ha) | Pertes (%) | Extraction (%) | Part comestible | Énergie (kcal/100 g) |
| --- | --- | --- | --- | --- | --- |
| Maïs | 19 | 25 | 100 | 1,00 | 335 (01_014, maïs du Bénin, grain sec) |
| Sorgho | 14 | 10 | 100 | 1,00 | 345 (01_039) |
| Mil | 15 | 25 | 100 | 1,00 | 365 (01_017) |
| Riz paddy | 40 | 25, puis 3 sur le riz usiné | 67 (riz usiné) | 1,00 | 344 (01_037, riz blanc) |
| Igname | 2 999 | 10 | 100 | 0,83 | 126 (02_019) |
| Manioc | 0 | 13 | 100 | 0,84 | 142 (02_001) |
| Patate douce | 0 | 10 | 100 | 0,83 | 96 (02_022) |

- **Semences, pertes, extraction** : FAO, *Technical Conversion Factors for Agricultural Commodities*, page du Bénin (moyennes nationales 1992-1996). Les pertes couvrent le stockage et le transport jusqu'au ménage. Les semences de la campagne suivante sont estimées sur la surface de la campagne en cours.
- **Part comestible et énergie** : FAO/INFOODS, *Food Composition Table for Western Africa* (WAFCT 2019), feuille « NV_sum_39 », codes entre parenthèses.
- Le manioc et la patate douce se replantent par boutures : aucune semence n'est déduite.

### 4. Besoins

`population × besoin énergétique moyen × part des céréales, racines et tubercules × 365 jours`.

- **Population** : WorldPop Global2, R2025A v1, estimation contrainte 2026 à 100 m, additionnée par commune sur son contour. Licence CC BY 4.0, DOI 10.5258/SOTON/WP00839.
- **Besoin énergétique moyen** : 2 237 kcal par personne et par jour (FAOSTAT, indicateurs de sécurité alimentaire, Bénin, 2025, valeur estimée).
- **Part des céréales, racines et tubercules** dans l'énergie alimentaire : 72 % (FAOSTAT, Bénin, moyenne 2007-2009, dernière valeur publiée).

### 5. Couverture et alerte

`couverture = calories disponibles ÷ besoins`, avec sa fourchette (bornes basse et haute de la surface par sondage, ou quartiles des rendements de l'ADR-0020).

- **Couvert** : 100 % ou plus.
- **Tension** : entre 77,6 % et 100 %. 77,6 % est le rapport entre le besoin minimal (1 735 kcal, FAOSTAT 2025) et le besoin moyen : sous ce seuil, la production locale ne couvre même pas le minimum.
- **Déficit grave** : sous 77,6 %.
- **Incertain** : quand la fourchette chevauche un seuil, la commune est signalée « à confirmer ».

L'alerte se lit à partir de trois mois avant la récolte : dès que les surfaces de la campagne sont connues (enquête ou statistiques), le bilan se recalcule chaque nuit. Les communes en tension ou en déficit grave remontent en tête de la page.

### 6. Ce que le bilan ne dit pas

- Une commune n'est pas fermée : marchés, achats, ventes, transferts, stocks de l'année précédente et importations n'y sont pas. Le bilan mesure la **couverture des besoins par la production vivrière locale**, pas la faim.
- Les coefficients FAO de pertes datent de 1992-1996 et la part de 72 % de 2007-2009 : ce sont les dernières valeurs publiques. Ils seront remplacés par des valeurs plus récentes dès qu'elles seront disponibles, avec leur source.
- Le contrôle national : si FAOSTAT est importé (ADR-0034), le même calcul sur la production nationale de sa dernière année est affiché à côté. S'il est loin de 100 %, la méthode est à revoir avant toute alerte.

## Conséquences

- Nouvelle table `commune_population` (commune, année, population, source) et source `WORLDPOP` ; chiffres par commune calculés hors ligne par un script public et versionnés comme les référentiels.
- Coefficients dans le code, chacun avec sa source et son année, affichés sur la page de méthode.
- Page de pilotage : liste des communes par couverture, avec la source de chaque surface, les fourchettes, et les communes non évaluées faute de données.
- Sans enquête ni statistique officielle par commune, la plupart des communes restent « non évaluées » : c'est honnête et c'est la liste des données à obtenir.
