# Charte « portail officiel »

- Objet : aligner l'interface sur les portails de l'administration béninoise (service-public.bj, agriculture.gouv.bj, gouv.bj), à la demande de l'utilisateur : un rendu institutionnel, plat, sans effet décoratif.
- Relevé des portails (25 septembre 2026, pages rendues dans un navigateur) : Montserrat en corps de 16 px et en titres gras ; bleu marine d'autorité (`#0a3764` sur service-public.bj) en bandeau et en bouton plein ; cartes blanches à bordure fine et angles de 4 à 5 px ; listes à filets ; liens soulignés ; aucun dégradé ; identité portée par les armoiries et le nom de l'institution.
- Complète `docs/recherche/plateformes-officielles-ui.md` (24 septembre 2026), dont elle révise deux choix : Montserrat passe aussi en corps de texte (c'est ce que rendent aujourd'hui les portails), et le bleu marine remplace le bleu-vert comme couleur d'action.

## Identité

- **Seule marque : celle du ministère.** Aucun logo propre à la plateforme (consigne de l'utilisateur). Bloc `MinistryLockup` (`src/components/brand/ministry-lockup.tsx`) : armoiries, « Ministère de l'Agriculture, de l'Élevage et de la Pêche », filet aux trois couleurs du drapeau en aplats, « République du Bénin ». Version claire pour le pied de page (`inverted`).
- Icônes de l'application et de l'onglet : armoiries sur fond blanc (`scripts/generate-icons.mjs`).
- Le nom de la plateforme reste dans les titres de page et le manifeste (texte), jamais comme logo.

## Jetons (`src/styles/tokens.css`)

| Rôle | Valeur |
|---|---|
| Action, en-tête, liens | `--primary` = marine `#0a3764` (survol et pied de page `#082b4f`, fond doux `#e8eef6`) |
| Titres | `--heading` `#0a2a4a`, graisse 700 |
| Texte | `--foreground` `#1d2530`, secondaire `#525d69` |
| Neutres | gris froids `--stone-*` (`#eef2f6` fonds de bande, `#dbe2ea` bordures) |
| États | succès `#287d3c`, vigilance `#82540f`, alerte `#b7410e`, critique `#8b1e2d`, information `#1e5a8a` |
| Drapeau | `--flag-green`, `--flag-yellow`, `--flag-red` : réservés au filet du bloc du ministère |
| Angles | 2, 3, 4 et 6 px (`sm`, `md`, `lg`, `xl`) ; plus de formes très arrondies |
| Ombres | aucune sur les cartes (la bordure délimite) ; légère pour ce qui flotte (menus, boîtes de dialogue) |

Typographie : Montserrat 400, 500, 600 et 700 pour tout le texte (`src/app/layout.tsx`), JetBrains Mono pour les codes et coordonnées. Corps à 16 px ; libellés de navigation en capitales de 12 px, graisse 600.

## Composants

| Élément | Règle |
|---|---|
| En-tête public | bande blanche (bloc du ministère, « Se connecter ») puis barre de navigation marine en capitales |
| En-tête des espaces | bande blanche (bloc du ministère) puis barre marine : nom de l'espace, compte, déconnexion |
| Pied de page | aplat marine foncé, bloc du ministère en clair, liens, barre « © République du Bénin · Ministère… » |
| En-tête de page | fil d'Ariane gris (« Accueil › rubrique ») au lieu d'un sur-titre coloré ; titre gras ; filet |
| Navigations d'espace | onglets en capitales soulignés, sans pictogrammes sur ordinateur ; barre basse à pictogrammes sur téléphone |
| Cartes et tuiles | bordure fine, angles de 4 px, sans ombre |
| Étiquettes (badges, filtres) | rectangles à angles de 2 px, jamais en pastille |
| Formulaires en étapes | « Étape 2 sur 3 : Libellé » en toutes lettres et barre plate segmentée |
| État vide | encadré bordé sur fond gris léger, sans motif ni illustration |
| Graphiques en barres | aplats à angles droits |

## À éviter

- Sur-titres colorés au-dessus des titres, formules d'accroche (« en quelques secondes », « deux minutes »), pastilles numérotées décoratives, fiches flottantes à ombre portée, grands blancs sans filet ni bande.
- Dégradés, transparences sur photographie, animations d'entrée.
- Bandeau tricolore en en-tête : le drapeau n'apparaît que dans le filet du bloc du ministère.
