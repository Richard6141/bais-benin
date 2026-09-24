# 07 — Identité visuelle et design system

> Rédigé par : UX/UI Designer, avec le Frontend et le Product Manager.
> Ce document fixe la direction artistique et les fondations du design system. Les composants seront implémentés à l'étape 0 par-dessus shadcn/ui.

## 1. Intention

Nous ne dessinons pas une application agricole ; nous dessinons **l'infrastructure de données d'un État moderne appliquée à son agriculture**. Le Bénin s'y reconnaît par son territoire et sa lumière, pas par des symboles touristiques. Trois mots guident chaque choix : **confiance, lisibilité, précision**.

Références assumées : la sobriété des services publics nordiques (Skatteverket, Digitaliseringsstyrelsen), la densité maîtrisée des tableaux de bord scientifiques (NASA Earthdata), la clarté des plateformes agricoles européennes (Telepac, Agridata), la rigueur cartographique de la visualisation de données de type Palantir.

## 2. Nom et marque

Nom de code technique : **BAIS**. Trois pistes de nom public à soumettre au Ministère :

1. **Terra Bénin** — le territoire, simple, mémorisable, prononçable dans toutes les langues nationales.
2. **AgriData Bénin** — descriptif, institutionnel, immédiatement compris.
3. **Sènan** — mot fon signifiant « la trace, la marque » : la donnée comme empreinte du réel. Plus singulier, à valider culturellement.

Le logotype est un **monogramme géométrique** : un carré de grille (la donnée) traversé d'une diagonale douce évoquant le relief nord-sud du pays, en deux tons. Pas d'épi de maïs, pas de houe, pas de soleil levant.

## 3. Palette

La palette part du territoire : **la terre latéritique du Nord**, **le vert sombre des galeries forestières de l'Ouémé**, **le bleu profond du golfe de Guinée**, **la craie des sols du plateau d'Abomey**. Elle est ensuite calibrée pour la donnée (contrastes, distinction daltonienne).

### Couleurs de marque et d'interface

| Jeton | Hex (clair) | Usage |
|---|---|---|
| `--color-ink` | `#0B1F2A` | texte principal, fond du centre de pilotage (mode sombre) |
| `--color-gulf` (primaire) | `#0F4C5C` | actions principales, liens, éléments actifs |
| `--color-gulf-strong` | `#0A3642` | survol, focus |
| `--color-laterite` (accent) | `#B7410E` | accent, alertes de niveau WARNING, mise en avant mesurée |
| `--color-forest` | `#1F5A3C` | validation, statut vérifié, séries « production » |
| `--color-chalk` | `#F6F3EE` | fond de page clair, chaleur discrète |
| `--color-paper` | `#FFFFFF` | surfaces |
| `--color-stone-100…900` | échelle neutre chaude | bordures, textes secondaires, désactivé |

### Couleurs sémantiques

| Jeton | Hex | Usage |
|---|---|---|
| `--color-info` | `#1E5A8A` | information, INFO |
| `--color-success` | `#1F5A3C` | succès, FIELD_VERIFIED |
| `--color-watch` | `#B7791F` | vigilance, WATCH |
| `--color-warning` | `#B7410E` | WARNING |
| `--color-critical` | `#8B1E2D` | CRITICAL, erreurs bloquantes |
| `--color-offline` | `#5B5F66` | état hors-ligne, données non synchronisées |

### Couleurs de données (cartes et graphiques)

- **Séquentielle (densité, ha, production)** : de `#E9EFEA` à `#0F4C5C` en 7 paliers, perceptuellement uniforme (interpolation Lab).
- **Divergente (écart à la normale, pluie)** : `#B7410E` → `#F6F3EE` → `#0F4C5C`.
- **Catégorielle (cultures)** : 12 teintes distinctes testées pour les daltonismes courants ; le maïs, le coton, le manioc, l'igname et le riz reçoivent des couleurs fixes dans tout le produit pour créer une mémoire visuelle.
- **Fiabilité** : DECLARED en hachures fines, AGENT_VERIFIED en aplat moyen, FIELD_VERIFIED en aplat plein. La texture porte l'information, pas seulement la couleur.

Mode sombre : réservé par défaut au centre de pilotage (projection, salle de crise) et disponible partout. Les couleurs de données conservent leur teinte, la luminance est réajustée.

## 4. Typographie

- **Interface** : Inter Variable (auto-hébergée, sous-ensemble latin étendu). Lisible à 14 px sur écran bas de gamme, rendu stable sous Android.
- **Données et chiffres** : Inter avec `font-variant-numeric: tabular-nums` partout où des nombres s'alignent ; JetBrains Mono pour les codes (`BJ-ATA-DJO-000123`) et les coordonnées.
- **Titres institutionnels** : Inter Display à graisse 600, interlettrage négatif léger. Pas de police serif de « prestige » : la confiance vient de la clarté.
- **Échelle** : 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 px ; corps de texte à 16 px sur mobile agriculteur (jamais moins), 14 px sur les tableaux denses du ministère.

## 5. Espace, forme, mouvement

- Grille de 4 px ; espacements 4, 8, 12, 16, 24, 32, 48, 64.
- Rayons : 6 px pour les contrôles, 10 px pour les cartes, 16 px pour les feuilles modales mobiles. Pas de coins très arrondis « application grand public ».
- Ombres presque absentes ; la hiérarchie vient des fonds (`chalk` / `paper`) et des bordures de 1 px `stone-200`.
- **Mouvement** (Motion) : durées 120 à 220 ms, courbes `ease-out` ; transitions de listes, apparition des panneaux latéraux, tracé progressif des séries sur les graphiques, pulsation lente sur une alerte CRITICAL. Respect de `prefers-reduced-motion`. Aucune animation décorative sur l'espace agriculteur (économie de batterie et de calcul).

## 6. Iconographie et illustration

- Icônes Lucide (cohérence shadcn), trait 1,75 px, taille 20 px en interface et 28 px sur l'espace agriculteur.
- Pictogrammes de cultures dessinés en interne : silhouettes géométriques monochromes (le maïs comme faisceau de trois traits, l'igname comme fuseau), déclinés en 24 et 48 px, utilisés comme repères pour les utilisateurs peu lettrés.
- Pas d'illustrations « flat » de personnages. Les états vides utilisent des motifs de grille et de relief.

## 7. Les six espaces : principes UX

| Espace | Métaphore | Décisions clés |
|---|---|---|
| **Agriculteur** | La carte d'identité de mon exploitation | Une seule colonne, boutons pleine largeur de 56 px, une action par écran, pictogrammes de cultures, lecture audio des alertes (synthèse vocale en français, langues nationales prévues), chiffres en très grand, aucune terminologie administrative |
| **Agent terrain** | La tournée | Fil des exploitations à visiter, formulaire en étapes avec sauvegarde à chaque champ, tracé GPS avec retour visuel de précision, bandeau permanent d'état de synchronisation, mode « une main » (actions en bas d'écran), fonctionnement complet hors-ligne |
| **Coopérative** | Le registre des membres | Tableau dense mais lisible, agrégats en tête, exports, invitation de membres |
| **Acheteur** | La halle | Recherche d'abord, résultats sur carte et en liste, badge « exploitation vérifiée » très visible, demande d'achat en trois champs |
| **Commune** | La mairie | Vue unique de la commune : chiffres clés, carte, alertes, agents actifs ; lecture seule, exports |
| **Ministère** | Le centre de contrôle | Écran large en mode sombre, tuiles d'indicateurs à gauche, carte nationale au centre, alertes et qualité des données à droite ; chaque chiffre porte sa provenance au survol ; descente département → commune en deux clics ; mode projection plein écran |

## 8. Composants du design system (au-dessus de shadcn/ui)

| Composant | Rôle |
|---|---|
| `StatTile` | indicateur + tendance + provenance + fraîcheur |
| `ReliabilityBadge` | pastille + texture selon `Reliability` |
| `SourceCaption` | ligne discrète « Source : ATDA terrain, 12 sept. 2026 » sous tout chiffre ou graphique |
| `ConfidenceMeter` | jauge à quatre niveaux pour l'assistant, avec explication au clic |
| `OfflineBanner` et `SyncIndicator` | état réseau, éléments en attente, dernier succès |
| `MapCanvas`, `LayerSwitcher`, `Legend`, `DrawParcelControl` | primitives cartographiques |
| `CropGlyph` | pictogramme de culture |
| `StepperForm` | formulaire en étapes avec reprise |
| `TerritoryPicker` | département → commune → arrondissement, avec recherche tolérante |
| `AreaInput`, `QuantityInput` | unités locales (ha, kg, sac de 100 kg, tas) converties automatiquement |
| `AlertCard` | gravité, zone, exploitations touchées, action |
| `DataTable` | tri, filtres, densité réglable, export |

## 9. Accessibilité

WCAG 2.2 AA : contraste 4,5:1 minimum (7:1 sur l'espace agriculteur), cibles tactiles de 44 px minimum, focus visible épais, navigation clavier complète au ministère, libellés explicites pour les lecteurs d'écran, aucune information portée uniquement par la couleur, langue déclarée, textes redimensionnables à 200 % sans perte.

## 10. Livrables de la phase 2 (étape 0)

Fichier de tokens (`src/styles/tokens.css`), configuration Tailwind alignée, thème shadcn régénéré, page de démonstration `/design` listant tous les composants dans les deux thèmes, tests de contraste automatisés.
