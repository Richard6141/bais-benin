# Licence et attribution des géométries administratives

Les deux fichiers `geoboundaries-ben-adm1.geojson` et `geoboundaries-ben-adm2.geojson` de ce dossier proviennent du projet geoBoundaries (William & Mary geoLab), jeu de données ouvert **gbOpen**, téléchargés le 24 septembre 2026 depuis l'API `https://www.geoboundaries.org/api/current/gbOpen/BEN/ADM1/` et `.../ADM2/` (champ `simplifiedGeometryGeoJSON`). Ils n'ont subi aucune modification après téléchargement.

## Licence

Le jeu gbOpen de geoBoundaries est diffusé sous licence **Creative Commons Attribution 4.0 International (CC BY 4.0)**, https://creativecommons.org/licenses/by/4.0/. L'utilisation, la redistribution et la modification sont libres à condition de créditer la source. Les métadonnées propres à ces deux couches indiquent en outre que leurs données d'origine sont du domaine public (voir « Provenance » ci-dessous), ce qui n'exempte pas de l'attribution demandée par geoBoundaries pour la version compilée.

## Attribution demandée par geoBoundaries

Toute publication, carte ou interface exploitant ces données doit citer :

> Runfola, D., Anderson, A., Baier, H., Crittenden, M., Dowker, E., Fuhrig, S., et al. (2020). geoBoundaries: A global database of political administrative boundaries. *PLoS ONE* 15(4): e0231866. https://doi.org/10.1371/journal.pone.0231866

Mention courte à afficher dans l'interface cartographique de BAIS : « Limites administratives : geoBoundaries (CC BY 4.0) ».

## Version et provenance des couches

| Couche | Identifiant geoBoundaries | Année représentée | Source d'origine (selon geoBoundaries) | Licence d'origine | Mise à jour source | Build geoBoundaries | Release | Entités |
|---|---|---|---|---|---|---|---|---|
| ADM1 (départements) | `BEN-ADM1-11314189` | 2012 | geoBoundaries, Wikimedia Commons | Domaine public | 2023-01-19 | 2023-12-12 | commit `9469f09` | 12 |
| ADM2 (communes) | `BEN-ADM2-17685819` | 2007 | Map Maker Ltd., Stanford Earthworks (`earthworks.stanford.edu/catalog/stanford-rq343zx0554`) | Domaine public | 2023-01-19 | 2023-12-12 | commit `9469f09` | 77 |

URL de téléchargement exactes :

- `https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BEN/ADM1/geoBoundaries-BEN-ADM1_simplified.geojson`
- `https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BEN/ADM2/geoBoundaries-BEN-ADM2_simplified.geojson`

## Limites connues

- Les deux couches proviennent de sources différentes et d'années différentes (2012 et 2007) ; elles ne sont pas topologiquement alignées entre elles. Le fichier `correspondance-communes.json` documente, pour chaque commune, la part de sa surface qui tombe dans le département attendu.
- Les libellés (`shapeName`) sont sans accents et contiennent quelques fautes de frappe dans la source (par exemple « Atlanique », « Kobli », « Akpo-Misserete »). Le libellé officiel de référence est celui du document `docs/08-donnees-et-sources.md`, tableau 2.1 ; la correspondance est fournie dans `correspondance-communes.json`.
- Ces géométries sont destinées à la démonstration et à l'affichage. Elles devront être remplacées par le référentiel certifié de l'IGN Bénin avant toute utilisation à valeur juridique ou foncière.
