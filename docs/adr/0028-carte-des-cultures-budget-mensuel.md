# ADR-0028 — Carte des cultures : tenir moins de 1 200 PU par mois, sans perdre de précision

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0023 et ADR-0025

## Contexte

La première passe nationale réelle a coûté environ 1 967 PU pour les 77 communes, au lieu des 1 100 annoncés. La carte a coûté 378 PU au lieu de 120 à 300.

La formule de facturation se vérifie lot par lot (pixels du rectangle englobant / 512² × 4/3 × passages). Les passages sont 2,2 à 2,5 fois plus nombreux que prévu, même sur les petites communes du sud qui ne chevauchent aucune limite de trace (facteur 1,9). Le premier lot (670 PU) réunissait les douze plus grandes communes du pays, dans l'Alibori et l'Atacora.

Cause : depuis mars 2025, Sentinel-2A vole en campagne étendue, à 36° de Sentinel-2B, à côté de 2B et 2C. Il repasse sur une même trace à un autre jour modulo 5. La règle « un passage par mois et par trace » (ADR-0025, trace = jour modulo 5) le compte comme une seconde trace et garde un passage de plus.

Or ces passages supplémentaires bouchent les nuages de la saison des pluies. Simulation sur la règle réelle, avec des pixels synthétiques, du bruit et des nuages :

| Passages lus par mois | Précision |
|---|---|
| Actuel (2,2 en moyenne) | 86 % |
| Au plus 2 | 84 % |
| 1 | 72 % |
| 8 mois sur 12, au plus 2 | 82 % |

## Décision

La précision passe avant : tous les passages sont gardés. Le coût baisse par la fréquence et la taille, pas par le nombre de passages.

1. **Chaque commune est refaite tous les deux mois.** Les communes sont réparties en deux moitiés de coût égal, en alternant dans l'ordre de leur rectangle englobant, et une moitié est refaite chaque mois (`refresh_group`, `refreshGroupOf`). La classification lit toujours douze mois ; seule la fraîcheur passe à deux mois au plus. Une commune jamais calculée, ou d'une méthode antérieure, passe quel que soit le mois.
2. **La carte fait 800 px de large** au lieu de 1 000 (environ 470 m par pixel), et elle est refaite tous les deux mois. C'est 36 % d'unités en moins par calcul.
3. **Le contrôle de précision porte sur 150 parcelles par mois** au lieu de 300.

## Conséquences

| Poste | Par mois, en moyenne |
|---|---|
| Surfaces (moitié des communes) | environ 985 PU |
| Carte (240 PU tous les deux mois) | environ 120 PU |
| Précision (150 parcelles à 0,36 PU) | environ 55 PU |
| Total | environ 1 160 PU |

- La première passe après le passage à la méthode 3 (ADR-0027) refait les 77 communes d'un coup, soit environ 1 970 PU une fois. L'alternance ne joue qu'ensuite.
- Le radar riz (ADR-0026), s'il est activé, ajoute environ 2 PU par commune refaite, soit environ 80 PU par mois.
- Une clé de trace exacte (numéro d'orbite relative) supprimerait le passage en double de Sentinel-2A là où il n'apporte rien. Mais les métadonnées de tuile de Copernicus ne garantissent pas ce numéro, et le passage en double aide contre les nuages : la piste est écartée.
- Des pixels de 150 m dans le nord ont aussi été écartés : leur effet sur la précision ne peut pas se mesurer sans images réelles.
