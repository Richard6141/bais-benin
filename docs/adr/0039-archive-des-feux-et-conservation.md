# ADR-0039 — Feux : import d'une saison passée (archive FIRMS) et conservation de trois ans

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0022, ADR-0038

## Contexte

La lecture des feux en continu (ADR-0022) n'a commencé qu'en septembre 2026. La prévention de la saison des feux (ADR-0038) compare les communes sur la saison sèche passée, de novembre 2025 à avril 2026, qui n'est pas en base. L'utilisateur a donné son accord pour charger les données réelles en ligne.

Vérifications faites le 27 septembre 2026, par de vrais appels :

- **Archives annuelles par pays, sans clé** : `https://firms.modaps.eosdis.nasa.gov/data/country/{source}/{année}/{source}_{année}_Benin.csv`, pour `modis`, `viirs-snpp` et `viirs-jpss1` (NOAA-20).
  - 2023 et 2024 sont en ligne (fichiers 2024 publiés le 23 juin 2025).
  - 2025 et 2026 ne le sont pas encore (404 pour toutes les sources).
  - NOAA-21 n'a pas d'archive annuelle.
  - Il n'y a pas de listing de répertoire.
- **API FIRMS** : `/api/area/csv/{MAP_KEY}/{jeu}/{emprise}/{jours}/{date}`, 5 jours au plus par requête (« Invalid day range. Expects [1..5] »).
  - Elle demande une clé MAP_KEY gratuite, liée à une adresse e-mail. Sans clé, elle répond « Invalid MAP_KEY. ».
  - `/api/data_availability` donne les dates couvertes par chaque jeu : traitement standard (SP) ou quasi temps réel (NRT).
- **Licence** : les données FIRMS suivent la politique de données ouvertes de la NASA pour les sciences de la Terre, sans restriction d'usage. Citation demandée : « We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Science Data and Information System (ESDIS). » La page Crédits cite déjà FIRMS.
- **Volume** : un essai sur la saison 2023-2024 (archives sans clé, rien écrit) lit 118 566 détections, qui donnent 90 908 feux après fusion entre satellites.

**Point bloquant.** L'ingestion efface à chaque passage les détections de plus de 365 jours (« conservée un an », ADR-0022). Une saison importée disparaîtrait donc peu à peu, et la saison de référence de la prévention avec elle.

## Décision

1. **Commande `pnpm db:reference:fires-archive [--season AAAA] [--dry-run]`**, depuis l'image tools.
   - Par défaut, elle prend la dernière saison sèche terminée : en septembre 2026, novembre 2025 à avril 2026.
   - **Avec `FIRMS_MAP_KEY`** (environnement du serveur seulement, jamais le dépôt) : l'API, par tranches de 5 jours, pour les quatre capteurs. Pour chaque tranche, le jeu en traitement standard s'il la couvre, sinon le quasi temps réel. Environ 37 requêtes par capteur, espacées de 250 ms, sous la limite de 5 000 requêtes par 10 minutes.
   - **Sans clé** : les archives annuelles des deux années de la saison. Si l'une manque, rien n'est écrit et la commande nomme les fichiers absents. Mieux vaut rien qu'une demi-saison.
2. **Même traitement que l'ingestion** :
   - même fusion entre satellites (même passage, moins de 375 m) ;
   - même rattachement aux communes (une détection hors frontière est écartée) ;
   - mêmes confiances ;
   - écriture par paquets de 500 lignes.
3. **Sources fixes écartées.** Les archives donnent un `type` : 0 pour un feu de végétation présumé, 2 pour une autre source fixe comme un site industriel. Seul le type 0 est gardé. Les fichiers en continu n'ont pas cette colonne et ne changent pas.
4. **Pas d'alerte, pas de passage d'ingestion.**
   - Aucune règle n'est évaluée : ce sont des feux passés.
   - Aucun passage n'est écrit : la fraîcheur affichée reste celle de la lecture en continu.
5. **Idempotente.** Une ligne déjà lue (même capteur, même heure, même position) n'est jamais comptée deux fois. Relancer la commande ne crée rien de plus.
6. **Conservation portée à trois ans** (décision du chef d'équipe). La saison 2023-2024 est la seule chargeable sans clé aujourd'hui : elle doit tenir jusqu'à l'arrivée de la clé FIRMS ou de l'archive 2025. Trois saisons font environ 270 000 lignes.
7. **Référence de la prévention** (ADR-0038 §3), dans l'ordre :
   - la saison sèche passée, si elle est complète en base ;
   - sinon, la dernière saison sèche complète en base, dans la limite des trois ans gardés ;
   - sinon, la saison en cours depuis le 1er novembre.

   Une saison est **complète quand ses six mois ont des feux en base**. Chaque mois de saison sèche compte des milliers de détections au Bénin : un mois vide veut dire « pas chargé », pas « pas de feu ». La plus ancienne détection ne suffit pas, parce qu'une saison importée suivie de la lecture en continu laisse un trou entre les deux.

   Le centre de veille du ministère le dit : « Référence : saison 2023-2024 (saison 2025-2026 pas encore en base) », avec l'état de l'interrupteur et les communes retenues.

## Conséquences

- La saison 2025-2026 ne peut être chargée aujourd'hui qu'avec une clé FIRMS. Créer la clé, avec l'adresse de son choix, est une décision de l'utilisateur. Sans clé, il faut attendre la publication des archives 2025 et 2026.
- La saison 2023-2024 commencera à s'effacer le 1er novembre 2026 (trois ans après son début), au moment même où la prévention en aura besoin. Elle deviendra alors incomplète et ne servira plus de référence : la prévention retombera sur la saison en cours, ce que le centre de veille dira. La clé FIRMS, ou l'archive 2025 si elle paraît d'ici là, évite ce cas.
- L'import tient en mémoire une saison entière, environ 120 000 lignes brutes : c'est à lancer depuis l'image tools, pas depuis l'application.
