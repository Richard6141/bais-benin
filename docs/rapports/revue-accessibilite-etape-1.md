# Revue d'accessibilité et de cohérence — étape 1 (design system)

- Branche : `feature/design-system`
- Date : 24 septembre 2026
- Périmètre : `src/styles/tokens.css`, `src/components/ui/*`, `src/components/{data-display,feedback,layout}/*`, `src/features/design-system/*`, page `/design-system`.
- Référentiel : WCAG 2.2 niveau AA. Critères cités : 1.4.3 (contraste du texte, 4,5:1 ; 3:1 pour le texte large), 1.4.11 (contraste des composants d'interface et des éléments graphiques porteurs de sens, 3:1), 2.5.8 (taille de cible, 24 × 24 px minimum) et, en complément, 2.5.5 niveau AAA (44 × 44 px) que la charte du projet (docs/07 §9 et commentaire de `tokens.css`) retient comme règle interne pour le tactile.
- Méthode : ratios calculés à partir des valeurs hexadécimales de `tokens.css` selon la formule de luminance relative du WCAG ; les fonds semi-transparents (`bg-watch/15`, `bg-critical/12`, `dark:bg-forest/30`…) sont composés sur le fond réel avant calcul. La valeur `red-300` de Tailwind 4 est prise à `#ffa2a2`. Aucune mesure sur écran : la revue est statique.

## 1. Synthèse

Le thème clair est globalement sain : tout le texte courant, les boutons, les liens et cinq badges sur six respectent le niveau AA. Trois familles de problèmes ressortent :

1. **Le thème sombre réutilise les couleurs sémantiques claires** (`--info`, `--success`, `--watch`, `--warning`, `--critical`) sans redéfinition dans `.dark`. Les titres d'alertes, les tendances des tuiles, la jauge de confiance et les messages d'erreur descendent entre 1,6:1 et 4,1:1. C'est le seul point bloquant en volume.
2. **La couleur `--watch` (`#b7791f`) est trop claire pour porter du texte**, dans les deux thèmes : 3,6:1 sur blanc, 3,1:1 sur le badge.
3. **Les éléments non textuels porteurs de sens** (bordures de champs, pastilles de fiabilité, jauge vide, anneau de focus) sont sous 3:1. Les pastilles de fiabilité sont doublées d'un libellé et d'une texture, ce qui limite l'impact ; les bordures de champs et l'anneau de focus ne le sont pas.

Sur les cibles tactiles, les composants respectent le minimum AA de 24 px sauf les cases à cocher, boutons radio et boutons de fermeture des fenêtres (16 px). La règle interne de 44 px n'est tenue par aucun contrôle en taille par défaut.

## 2. Contrastes mesurés

### 2.1 Thème clair

Fonds : `--background` `#f6f3ee`, `--card` `#ffffff`, `--muted` `#f1ede6`.

| Usage | Couleur | Fond | Ratio | Verdict |
|---|---|---|---|---|
| Texte principal (`foreground`) | `#0b1f2a` | `#f6f3ee` | 15,26 | AA |
| Texte principal sur carte | `#0b1f2a` | `#ffffff` | 16,89 | AA |
| `muted-foreground` sur fond de page | `#5b5f66` | `#f6f3ee` | 5,80 | AA |
| `muted-foreground` sur carte | `#5b5f66` | `#ffffff` | 6,42 | AA |
| `muted-foreground` sur `muted` (onglets, squelettes) | `#5b5f66` | `#f1ede6` | 5,50 | AA |
| Onglet inactif (`text-foreground/60`) sur `muted` | `#677175` | `#f1ede6` | 4,29 | **Échec** |
| Bouton `default` : `primary-foreground` sur `primary` | `#f6f3ee` | `#0f4c5c` | 8,59 | AA |
| Bouton `default` au survol (`primary/90`) | `#f6f3ee` | `#265d6b` | 6,63 | AA |
| Bouton `secondary` : `ink` sur `stone-100` | `#0b1f2a` | `#f1ede6` | 14,47 | AA |
| Bouton `outline` : `foreground` sur `background` | `#0b1f2a` | `#f6f3ee` | 15,26 | AA |
| Boutons `outline` et `ghost` au survol : `accent-foreground` sur `accent` | `#0a3642` | `#e3edf0` | 10,89 | AA |
| Bouton `destructive` : blanc sur `critical` | `#ffffff` | `#8b1e2d` | 9,05 | AA |
| Lien (`text-primary`) sur fond de page | `#0f4c5c` | `#f6f3ee` | 8,59 | AA |
| Lien (`text-primary`) sur carte | `#0f4c5c` | `#ffffff` | 9,51 | AA |
| Surtitre `eyebrow` (`text-xs`, `text-primary`) | `#0f4c5c` | `#f6f3ee` | 8,59 | AA |
| Badge `default` | `#f6f3ee` | `#0f4c5c` | 8,59 | AA |
| Badge `secondary` | `#0b1f2a` | `#f1ede6` | 14,47 | AA |
| Badge `success` : `forest` sur `forest-soft` | `#1f5a3c` | `#e4efe8` | 6,89 | AA |
| Badge `info` : `info` sur `gulf-soft` | `#1e5a8a` | `#e3edf0` | 6,11 | AA |
| Badge `watch` : `watch` sur `watch/15` (carte) | `#b7791f` | `#f4ebdd` | 3,08 | **Échec** |
| Badge `watch` : `watch` sur `watch/15` (fond de page) | `#b7791f` | `#ede1cf` | 2,82 | **Échec** |
| Badge `warning` : `laterite` sur `laterite-soft` | `#b7410e` | `#f6e6dd` | 4,58 | AA (limite) |
| Badge `critical` : `critical` sur `critical/12` | `#8b1e2d` | `#f1e4e6` | 7,31 | AA |
| Badge `offline` : `offline` sur `offline/15` | `#5b5f66` | `#e6e7e8` | 5,18 | AA |
| Alerte `info` : titre sur carte | `#1e5a8a` | `#ffffff` | 7,28 | AA |
| Alerte `success` : titre sur carte | `#1f5a3c` | `#ffffff` | 8,12 | AA |
| Alerte `watch` : titre sur carte | `#b7791f` | `#ffffff` | 3,64 | **Échec** |
| Alerte `warning` : titre sur carte | `#b7410e` | `#ffffff` | 5,56 | AA |
| Alerte `critical` : titre sur `critical/6` | `#8b1e2d` | `#f8f2f2` | 8,17 | AA |
| Alerte : description `muted-foreground` sur carte | `#5b5f66` | `#ffffff` | 6,42 | AA |
| Message d'erreur (`text-destructive`) sur fond de page | `#8b1e2d` | `#f6f3ee` | 8,17 | AA |
| Tendance `text-success` (tuile d'indicateur) | `#1f5a3c` | `#ffffff` | 8,12 | AA |
| Tendance `text-warning` (tuile d'indicateur) | `#b7410e` | `#ffffff` | 5,56 | AA |
| Bandeau hors connexion : `paper` sur `offline` | `#ffffff` | `#5b5f66` | 6,42 | AA |
| Info-bulle : `background` sur `foreground` | `#f6f3ee` | `#0b1f2a` | 15,26 | AA |

Éléments non textuels (seuil 3:1, critère 1.4.11) :

| Usage | Couleur | Fond | Ratio | Verdict |
|---|---|---|---|---|
| Jauge de confiance, segment `watch` | `#b7791f` | `#ffffff` | 3,64 | AA |
| Jauge de confiance, segments `info`, `success`, `critical` | — | `#ffffff` | 7,28 à 9,05 | AA |
| Jauge de confiance, segment vide (`muted-foreground/20`) | `#dedfe0` | `#ffffff` | 1,33 | **Échec** |
| Bordure des champs (`--input`, `stone-300`) sur fond de page | `#cfc7ba` | `#f6f3ee` | 1,51 | **Échec** |
| Bordure des champs sur carte | `#cfc7ba` | `#ffffff` | 1,68 | **Échec** |
| Case à cocher et bouton radio non cochés (bordure `--input`) | `#cfc7ba` | `#ffffff` | 1,68 | **Échec** |
| Bordure générale (`--border`, `stone-200`) | `#e2dcd2` | `#f6f3ee` | 1,23 | Hors critère (décorative) |
| Anneau de focus (`ring/50`) sur fond de page | `#83a0a5` | `#f6f3ee` | 2,52 | **Échec** |
| Pastille de fiabilité `DECLARED` (`stone-400`) | `#a9a196` | `#ffffff` | 2,55 | Échec, atténué par le libellé et les hachures |
| Pastille `AGENT_VERIFIED` (`chart-1/45`) | `#93aeb6` | `#ffffff` | 2,34 | Échec, atténué par le libellé |
| Pastille `ESTIMATED` (`watch/60`) | `#d4af79` | `#ffffff` | 2,06 | Échec, atténué par le libellé |
| Pastille `SYNTHETIC` (`stone-300`) | `#cfc7ba` | `#ffffff` | 1,68 | Échec, atténué par le libellé et le pointillé |

### 2.2 Thème sombre

Fonds : `--background` `#0b1f2a`, `--card` `#112b37`, `--muted` `#183643`.

| Usage | Couleur | Fond | Ratio | Verdict |
|---|---|---|---|---|
| Texte principal (`chalk`) sur fond de page | `#f6f3ee` | `#0b1f2a` | 15,26 | AA |
| Texte principal sur carte | `#f6f3ee` | `#112b37` | 13,32 | AA |
| `muted-foreground` sur fond de page | `#a9b7bd` | `#0b1f2a` | 8,20 | AA |
| `muted-foreground` sur carte | `#a9b7bd` | `#112b37` | 7,16 | AA |
| `muted-foreground` sur `muted` | `#a9b7bd` | `#183643` | 6,19 | AA |
| Bouton `default` : `ink` sur `primary` | `#0b1f2a` | `#5aa9bb` | 6,29 | AA |
| Bouton `secondary` | `#f6f3ee` | `#183643` | 11,52 | AA |
| Bouton `outline` (`bg-input/30`) | `#f6f3ee` | `#132b37` | 13,28 | AA |
| Bouton `destructive` : blanc sur `destructive/60` | `#ffffff` | `#7c2e3d` | 9,07 | AA |
| Lien (`text-primary`) sur fond de page | `#5aa9bb` | `#0b1f2a` | 6,29 | AA |
| Lien (`text-primary`) sur carte | `#5aa9bb` | `#112b37` | 5,49 | AA |
| Badge `success` : `chart-3` sur `forest/30` | `#5fa77f` | `#153939` | 4,37 | **Échec** (limite) |
| Badge `info` : `chart-5` sur `info/30` | `#6f9fd0` | `#153950` | 4,35 | **Échec** (limite) |
| Badge `watch` : `chart-4` sur `watch/15` | `#d9a24a` | `#2a3733` | 5,45 | AA |
| Badge `warning` : `chart-2` sur `laterite/30` | `#e07a45` | `#43322b` | 4,07 | **Échec** |
| Badge `critical` : `red-300` sur `critical/35` | `#ffa2a2` | `#3c2634` | 7,20 | AA |
| Badge `offline` : `stone-300` sur `offline/15` | `#cfc7ba` | `#1c333e` | 7,87 | AA |
| Alerte `info` : titre `#1e5a8a` sur carte | `#1e5a8a` | `#112b37` | 2,02 | **Échec** |
| Alerte `success` : titre `#1f5a3c` sur carte | `#1f5a3c` | `#112b37` | 1,82 | **Échec** |
| Alerte `watch` : titre `#b7791f` sur carte | `#b7791f` | `#112b37` | 4,05 | **Échec** |
| Alerte `warning` : titre `#b7410e` sur carte | `#b7410e` | `#112b37` | 2,65 | **Échec** |
| Alerte `critical` : titre `#8b1e2d` sur `critical/6` | `#8b1e2d` | `#182a36` | 1,63 | **Échec** |
| Message d'erreur (`text-destructive`) sur fond de page | `#c8384a` | `#0b1f2a` | 3,31 | **Échec** |
| Tendance `text-success` (tuile d'indicateur) | `#1f5a3c` | `#112b37` | 1,82 | **Échec** |
| Tendance `text-warning` (tuile d'indicateur) | `#b7410e` | `#112b37` | 2,65 | **Échec** |
| Bandeau hors connexion | `#ffffff` | `#5b5f66` | 6,42 | AA |
| Info-bulle : `ink` sur `chalk` | `#0b1f2a` | `#f6f3ee` | 15,26 | AA |
| Survol `accent` | `#cfe6ec` | `#1c4250` | 8,32 | AA |

Éléments non textuels (seuil 3:1) :

| Usage | Couleur | Fond | Ratio | Verdict |
|---|---|---|---|---|
| Jauge de confiance, segment `info` | `#1e5a8a` | `#112b37` | 2,02 | **Échec** |
| Jauge de confiance, segment `success` | `#1f5a3c` | `#112b37` | 1,82 | **Échec** |
| Jauge de confiance, segment `watch` | `#b7791f` | `#112b37` | 4,05 | AA |
| Jauge de confiance, segment `critical` | `#8b1e2d` | `#112b37` | 1,63 | **Échec** |
| Bordure des champs (`--input`) | `#274755` | `#0b1f2a` | 1,70 | **Échec** |
| Bordure générale (`--border`) | `#1f3a47` | `#0b1f2a` | 1,41 | Hors critère (décorative) |
| Pastille `OFFICIAL` (`forest`) | `#1f5a3c` | `#112b37` | 1,82 | Échec, atténué par le libellé |
| Pastille `ESTIMATED` (`watch/60`) | `#755a29` | `#112b37` | 2,28 | Échec, atténué par le libellé |
| Pastilles `DECLARED`, `SYNTHETIC`, `FIELD_VERIFIED` | — | `#112b37` | 5,49 à 8,80 | AA |

## 3. Cibles tactiles

Tailles rendues avec la police par défaut (16 px), sans zoom.

| Contrôle | Fichier | Taille actuelle | AA 2.5.8 (24 px) | Règle interne (44 px) |
|---|---|---|---|---|
| `Button` `default` et `icon` | `src/components/ui/button.tsx` | 36 px | Conforme | Non |
| `Button` `sm` et `icon-sm` | idem | 32 px | Conforme | Non |
| `Button` `xs` et `icon-xs` | idem | 24 px | Conforme (limite) | Non |
| `Button` `lg` et `icon-lg` | idem | 40 px | Conforme | Non |
| `Input`, `SelectTrigger` (`default`) | `input.tsx`, `select.tsx` | 36 px | Conforme | Non |
| `Textarea` | `textarea.tsx` | 64 px min. | Conforme | Oui |
| `Checkbox` | `checkbox.tsx` | 16 px | **Non** (sauf si l'étiquette est cliquable et l'espacement suffisant) | Non |
| `RadioGroupItem` | `radio-group.tsx` | 16 px | **Non** (même réserve) | Non |
| `Switch` `default` | `switch.tsx` | 18 × 32 px | **Non** en hauteur | Non |
| Bouton de fermeture `Dialog` et `Sheet` | `dialog.tsx`, `sheet.tsx` | 16 px (icône seule, aucune classe de taille) | **Non** | Non |
| `TabsTrigger` | `tabs.tsx` | 35 px (liste à 36 px) | Conforme | Non |
| `DropdownMenuItem`, `SelectItem` | `dropdown-menu.tsx`, `select.tsx` | ≈ 32 px | Conforme | Non |
| Lien de navigation d'en-tête | `site-header.tsx` | ≈ 36 px | Conforme | Non |
| Ancres de la navigation de section | `design-system/page.tsx` | ≈ 32 px | Conforme | Non |
| `ThemeToggle` (`size="icon"`) | `theme-toggle.tsx` | 36 px | Conforme | Non |
| Boutons de l'espace agriculteur (démonstration) | `buttons-section.tsx` | 56 px | Conforme | Oui |

Dans les formulaires de démonstration, chaque case à cocher et bouton radio est associé à une étiquette cliquable, ce qui satisfait l'exception « cible équivalente » du critère 2.5.8. Le composant seul, hors étiquette, reste sous le minimum.

## 4. Attributs ARIA et sémantique

Conforme, à conserver :

- `Alert` porte `role="alert"` ; la couleur est doublée par la bordure gauche, l'icône et le titre.
- `ConfidenceMeter` : `role="meter"` avec `aria-valuemin`, `aria-valuemax`, `aria-valuenow` et `aria-valuetext` ; libellé et explication toujours visibles.
- `OfflineBanner` : `role="status"` et `aria-live="polite"`.
- `CropGlyph` et `Monogram` : `role="img"` avec `aria-label`.
- `ReliabilityBadge` : la pastille est `aria-hidden`, le libellé porte le sens ; `aria-label` uniquement quand le libellé est masqué.
- `DemoSection` : `aria-labelledby` vers le titre de section ; la page suit la hiérarchie h1, h2, h3.
- Champ en erreur de la section formulaires : `aria-invalid` et `aria-describedby` vers le message.
- Icônes décoratives systématiquement `aria-hidden`.

Écarts :

- **`ThemeToggle` combine `aria-pressed` et un libellé qui change** (« Passer au thème clair » / « Passer au thème sombre »). Avec `aria-pressed`, le libellé doit rester stable (« Thème sombre », état pressé ou non) ; sinon un lecteur d'écran annonce « Passer au thème clair, pressé ». Retenir l'un ou l'autre.
- **Boutons de fermeture de `Dialog` et `Sheet` : texte masqué « Close »** en anglais, hérité de shadcn (`dialog.tsx` ligne 68, `sheet.tsx` ligne 73). Le `CommandDialog` porte de même la description « Search for a command to run... » (`command.tsx` ligne 31). Ces textes sont lus par les lecteurs d'écran.
- **`Skeleton` n'indique pas un chargement** : aucun `aria-busy` sur le conteneur ni texte masqué. Ajouter `aria-busy="true"` et un `<span className="sr-only">Chargement…</span>` au conteneur qui affiche les squelettes (à l'usage, pas dans le composant).
- **`StatTile` : la relation étiquette / valeur n'est pas explicite.** Le libellé est un `<p>` et la valeur un `<span>` ; un lecteur d'écran lit deux fragments séparés. Envelopper la tuile dans un `<dl>` (`<dt>` libellé, `<dd>` valeur) ou donner un `aria-labelledby` au conteneur.
- **`TrendLine` : le sens de la tendance n'est porté que par l'icône (`aria-hidden`) et la couleur.** Le texte « +3,4 % » ne dit pas si c'est une amélioration. Ajouter un texte masqué (« en hausse », « en baisse », « stable »).
- **`EmptyState` fixe un `<h3>`** quelle que soit la profondeur d'insertion ; dans une page sans h2 précédent, la hiérarchie saute un niveau. Prévoir une prop `headingLevel` ou rendre un `<p>` renforcé.
- **`Table` : les en-têtes de colonne n'ont pas de `scope="col"`.** Toléré pour un tableau simple, mais à ajouter dans `TableHead` par défaut pour les futurs tableaux à double entrée.
- **`SiteHeader` : le lien « Design system » n'a pas d'état courant** (`aria-current="page"`) quand la page est active.

## 5. Ordre de focus et navigation clavier

- L'ordre du DOM suit l'ordre visuel dans toutes les sections ; aucun `tabIndex` positif.
- Les fenêtres (`Dialog`, `Sheet`, `DropdownMenu`, `Select`, `Popover`) reposent sur Radix : piège de focus, fermeture à la touche Échap et retour du focus au déclencheur sont assurés.
- **Contenu masqué par les barres collantes** : l'en-tête (64 px) et la navigation de sections (≈ 40 px) sont `sticky`. Les sections ont `scroll-mt-24`, mais un élément atteint au clavier (Tab) à l'intérieur d'une section peut se retrouver sous ces barres, ce qui contrevient au critère 2.4.11 (focus non masqué). Ajouter `scroll-padding-top: 7rem` sur `html` dans `globals.css`.
- **Navigation de sections défilante horizontalement** (`overflow-x-auto`) : les ancres hors écran sur mobile restent atteignables au clavier, mais le défilement ne suit pas le focus sur tous les navigateurs. Ajouter `focus-visible:scroll-mx-4` ou passer la liste en retour à la ligne sur mobile.
- L'anneau de focus (`ring/50`, soit `#83a0a5` sur `#f6f3ee`) est à 2,5:1 : visible mais sous le seuil de 3:1 du critère 2.4.13 (apparence du focus, AAA) et de 1.4.11 pour l'indicateur. Passer l'anneau à `ring-ring` plein (8,6:1) avec `ring-offset-2`.

## 6. Textes et langue

- `dialog.tsx` et `sheet.tsx` : « Close » ; `command.tsx` : « Search for a command to run... ». À traduire (« Fermer », « Rechercher une commande… »).
- `data-section.tsx` ligne 59 : « vs 2024-2025 » ; écrire « par rapport à 2024-2025 » ou « contre 2024-2025 ».
- `overlays-section.tsx` ligne 100 : « Info-bulle et popover » ; « popover » n'a pas d'équivalent normalisé, « fenêtre contextuelle » est l'usage.
- « Design system » (titre de page, en-tête) et « Bénin Agricultural Intelligence System » sont des noms propres du projet, acceptables. Prévoir néanmoins « Système de design » dans les textes courants si la charte l'exige.
- `feedback-section.tsx` : « Skeleton » n'apparaît pas à l'écran (nom de composant), rien à changer.
- `site-footer.tsx` : les deux phrases sont correctes ; vérifier que le pied de page est présent sur toutes les pages publiques (il ne l'est que sur l'accueil et `/design-system`).
- Espaces insécables : « 41 exploitations », « 36 °C », « 4 m », « 3,2 ha » sont rendus avec des espaces simples ; en français typographique, une espace insécable précède l'unité et le signe « % ». Les nombres formatés par `Intl.NumberFormat("fr-FR")` en portent déjà ; les libellés écrits à la main n'en portent pas. Point mineur.

## 7. Corrections proposées

### Bloquantes

| # | Correction | Fichier | Valeur actuelle | Valeur proposée |
|---|---|---|---|---|
| B1 | Redéfinir les cinq couleurs sémantiques dans le thème sombre : les titres d'alertes, les tendances, la jauge et les pastilles les lisent directement | `src/styles/tokens.css`, bloc `.dark` | absentes (héritées de `:root`) | `--info: #8fc3d9` (7,7:1 sur carte), `--success: #5fa77f` (5,1:1), `--watch: #d9a24a` (6,5:1), `--warning: #e07a45` (4,9:1), `--critical: #f08a95` (6,2:1) |
| B2 | Foncer `--watch` en thème clair pour que le texte des badges et titres d'alerte « vigilance » atteigne 4,5:1 | `src/styles/tokens.css`, `:root` | `--watch: #b7791f` | `--watch: #8a5a12` (5,9:1 sur carte, 5,0:1 sur `watch/15`) ; garder `#b7791f` pour `--chart-4` si l'on veut préserver la teinte des graphiques |
| B3 | Message d'erreur en thème sombre sous 4,5:1 (`text-destructive` sur fond de page) | `src/styles/tokens.css`, `.dark` | `--destructive: #c8384a` (3,3:1 en texte) | Séparer fond et texte : garder `--destructive: #c8384a` pour les fonds et ajouter `--destructive-text: #e8788a` (6,0:1) utilisé par `FormMessage`, `Alert` `destructive` et le message de `forms-section.tsx` ; ou baisser `--destructive` à `#e05a6a` si un seul jeton est voulu (les boutons passent alors en texte `ink`) |
| B4 | Bordure des champs sous 3:1 dans les deux thèmes, y compris cases à cocher et boutons radio non cochés | `src/styles/tokens.css` | `--input: var(--stone-300)` clair, `#274755` sombre | Clair : `--input: #7d766d` (`stone-500`, 3,9:1 sur fond de page, 4,3:1 sur carte) ; sombre : `--input: #45707f` (3,1:1). Alternative moins visible : garder la teinte et passer la bordure à 2 px, ce qui ne change pas le ratio et ne suffit pas au critère |
| B5 | Textes masqués en anglais lus par les lecteurs d'écran | `src/components/ui/dialog.tsx` ligne 68, `src/components/ui/sheet.tsx` ligne 73, `src/components/ui/command.tsx` ligne 31 | « Close », « Search for a command to run... » | « Fermer », « Rechercher une commande… » |
| B6 | Boutons de fermeture de `Dialog` et `Sheet` à 16 px | `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx` | `DialogPrimitive.Close` sans classe de taille | Ajouter `size-9 inline-flex items-center justify-center` (36 px) ou, sur mobile, `size-11` (44 px) ; ou remplacer par `<Button variant="ghost" size="icon" asChild>` |

### Recommandées

| # | Correction | Fichier | Valeur actuelle | Valeur proposée |
|---|---|---|---|---|
| R1 | Passer les contrôles de formulaire à 44 px sur mobile, conformément à la charte (`--size-touch-min`) | `src/components/ui/button.tsx` (`default`, `icon`), `input.tsx`, `select.tsx` (`SelectTrigger` `default`) | `h-9` / `size-9` (36 px) | `h-11 md:h-9` et `size-11 md:size-9` ; garder `sm` et `xs` pour les barres d'outils denses de l'espace ministériel uniquement |
| R2 | Agrandir la zone de frappe des cases à cocher, boutons radio et interrupteurs | `checkbox.tsx`, `radio-group.tsx`, `switch.tsx` | `size-4` (16 px), `h-[1.15rem] w-8` | Conserver le rendu à 16 px mais étendre la cible : `before:absolute before:-inset-3` avec `relative` sur la racine (44 px de zone cliquable), ou imposer par convention une étiquette `Label` cliquable avec `py-2` |
| R3 | Onglet inactif sous 4,5:1 | `src/components/ui/tabs.tsx`, `TabsTrigger` | `text-foreground/60` | `text-muted-foreground` (5,5:1 sur `muted`) |
| R4 | Segment vide de la jauge de confiance invisible (1,3:1) | `src/components/feedback/confidence-meter.tsx` | `bg-muted-foreground/20` | `bg-muted-foreground/45` clair (≈ 3,0:1) ; ou `border border-muted-foreground bg-transparent` qui tient dans les deux thèmes |
| R5 | Pastilles de fiabilité sous 3:1 (`DECLARED`, `AGENT_VERIFIED`, `ESTIMATED`, `SYNTHETIC` en clair ; `OFFICIAL`, `ESTIMATED` en sombre) | `src/components/data-display/reliability-badge.tsx` | `border-stone-400`, `bg-chart-1/45`, `bg-watch/60`, `border-stone-400` | Ajouter `border-stone-500` en clair et, en sombre, `dark:bg-chart-3 dark:border-chart-3` pour `OFFICIAL`, `dark:bg-chart-4/70 dark:border-chart-4` pour `ESTIMATED`. Le libellé reste la garantie principale |
| R6 | Anneau de focus à 2,5:1 | `src/components/ui/button.tsx`, `input.tsx`, `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`, `select.tsx`, `tabs.tsx`, `badge.tsx` (classe partagée `focus-visible:ring-ring/50`) | `ring-[3px] ring-ring/50` | `ring-2 ring-ring ring-offset-2 ring-offset-background` ; centraliser dans une classe utilitaire `focus-ring` de `globals.css` pour ne le définir qu'une fois |
| R7 | Focus masqué par les barres collantes | `src/app/globals.css`, règle `html` | `scroll-behavior: smooth` seul | Ajouter `scroll-padding-top: 7rem` |
| R8 | `ThemeToggle` : libellé changeant avec `aria-pressed` | `src/components/layout/theme-toggle.tsx` | `aria-label` variable + `aria-pressed` | Libellé fixe « Thème sombre » avec `aria-pressed={isDark}` |
| R9 | Squelettes muets pour les technologies d'assistance | `src/features/design-system/feedback-section.tsx` (conteneur des `Skeleton`) et convention d'usage | aucun attribut | `aria-busy="true"` sur le conteneur et `<span className="sr-only">Chargement en cours</span>` |
| R10 | `StatTile` : lier libellé et valeur ; annoncer le sens de la tendance | `src/components/data-display/stat-tile.tsx` | `<p>` + `<span>` ; icône `aria-hidden` seule | `<dl>` / `<dt>` / `<dd>` ou `aria-labelledby` ; texte masqué « en hausse » / « en baisse » / « stable » dans `TrendLine` |
| R11 | Badges `success`, `info` et `warning` en thème sombre légèrement sous 4,5:1 (4,4 ; 4,4 ; 4,1) | `src/components/ui/badge.tsx` | `dark:bg-forest/30`, `dark:bg-info/30`, `dark:bg-laterite/30` | Baisser l'opacité des fonds à `/20` (le texte gagne ≈ 0,4 point) ou éclaircir les textes : `dark:text-[#8fc3d9]` pour `info` ; pour `success` et `warning`, `dark:text-chart-3` et `dark:text-chart-2` restent bons sur carte pleine (5,1 et 4,9) donc `dark:bg-card` en fond suffit |
| R12 | Badge `warning` clair à 4,58:1, sans marge | `src/styles/tokens.css`, `:root` | `--laterite: #b7410e` | Si la teinte doit servir de texte courant, `#a33a0b` (5,5:1 sur `laterite-soft`) ; sinon laisser, le ratio est conforme |
| R13 | Anglicismes dans les textes de démonstration | `src/features/design-system/data-section.tsx` ligne 59 ; `overlays-section.tsx` ligne 100 | « vs 2024-2025 » ; « popover » | « par rapport à 2024-2025 » ; « fenêtre contextuelle » |
| R14 | `TableHead` sans `scope` | `src/components/ui/table.tsx` | `<th>` | `<th scope="col">` par défaut |
| R15 | Lien de navigation actif non signalé | `src/components/layout/site-header.tsx` | `Link` sans état | `aria-current="page"` quand le chemin correspond (composant client avec `usePathname`) |
| R16 | `EmptyState` fige le niveau de titre | `src/components/feedback/empty-state.tsx` | `<h3>` | prop `headingLevel` (2 à 4), défaut 3 |

## 8. Corrections appliquées

Appliquées le 24 septembre 2026 sur la branche `feature/design-system`, dans les seuls fichiers `src/styles/tokens.css` et `src/components/ui/{button,input,select,checkbox,radio-group,switch,dialog,sheet}.tsx`. Vérification : Prettier, ESLint (`src/components`, `src/styles`) et la suite Vitest complète (9 fichiers, 64 tests) passent.

| # | Fichier | Changement | Ratio avant | Ratio après |
|---|---|---|---|---|
| B1 | `tokens.css`, bloc `.dark` | Ajout de `--info: #8fc3d9`, `--success: #5fa77f`, `--watch: #d9a24a`, `--warning: #e07a45`, `--critical: #f08a95`, avec un commentaire expliquant le choix | Titres d'alertes sur carte : 2,02 / 1,82 / 4,05 / 2,65 / 1,63 | 7,70 / 5,14 / 6,47 / 4,94 / 6,16 (titre `critical` sur `critical/6` : 5,62) ; tendances `success` et `warning` de `StatTile` : 5,14 et 4,94 ; jauge de confiance (non texte) : 7,70 / 5,14 / 6,47 / 6,16 ; pastille `ESTIMATED` sombre : 3,19 |
| B2 | `tokens.css`, `:root` | `--watch: #b7791f` → `#82540f` ; `--chart-4` conservé à `#b7791f` pour les graphiques. La valeur `#8a5a12` proposée initialement donnait 4,36 sur le badge `watch/15` posé sur le fond de page, d'où un cran plus sombre | Badge `watch` : 3,08 (carte), 2,82 (fond) ; titre d'alerte `watch` : 3,64 | Badge `watch` : 4,76 (fond de page), 5,11 (carte) ; titre d'alerte : 6,51 ; jauge `watch` clair (non texte) : 6,51. La pastille `ESTIMATED` (`watch/60`) reste à 2,61, couverte par son libellé (R5 non traitée) |
| B3 | `tokens.css`, bloc `.dark` | `--destructive: #c8384a` → `#e36b7a` ; `--destructive-foreground` passe de `chalk` à `ink` pour rester lisible sur un fond `destructive` plein | Message d'erreur sombre : 3,31 | Message d'erreur : 5,35 (fond de page), 4,67 (carte) ; bouton `destructive` sombre (blanc sur `destructive/60`) : 6,28 ; `ink` sur `destructive` plein : 5,35 |
| B4 | `tokens.css` | Clair : `--input: var(--stone-300)` → `var(--stone-500)` (`#7d766d`). Sombre : `--input: #274755` → `#4d7989`. La valeur `#45707f` proposée initialement donnait 2,72 sur les cartes sombres | Clair : 1,51 (fond), 1,68 (carte). Sombre : 1,70 | Clair : 4,05 (fond), 4,48 (carte). Sombre : 3,55 (fond), 3,10 (carte). Le fond des boutons `outline` sombres (`input/30`) garde 10,8 pour le texte |
| B5, B6 | `dialog.tsx`, `sheet.tsx` | Bouton de fermeture : `inline-flex size-9 items-center justify-center rounded-md`, décalé à `top-1.5 right-1.5` pour garder l'icône à sa place ; texte masqué « Close » → « Fermer » | Cible 16 px, libellé en anglais | Cible 36 px, libellé en français |
| R1 | `button.tsx`, `input.tsx`, `select.tsx` | `Button` `default` : `h-11 md:h-9` ; `Button` `icon` : `size-11 md:size-9` ; `Input` : `h-11 md:h-9` ; `SelectTrigger` `default` : `h-11 md:h-9`. Tailles `xs`, `sm`, `lg` et `icon-*` inchangées. `Textarea` non modifié : son `min-h-16` (64 px) dépasse déjà 44 px | 36 px partout | 44 px sous 768 px, 36 px au-delà |
| R2 | `checkbox.tsx`, `radio-group.tsx`, `switch.tsx` | `Checkbox` et `RadioGroupItem` : `size-4` → `size-5` (coche `size-4`, point `size-2.5`) ; `Switch` `default` : `h-6 w-10`, pouce `size-5` ; taille `sm` inchangée | 16 px ; 18 × 32 px | 20 px ; 24 × 40 px. Le minimum AA de 24 px reste atteint par l'étiquette cliquable associée |

Corrections restantes, non appliquées ici : R3 à R16 (onglet inactif, segment vide de la jauge, pastilles de fiabilité, anneau de focus, `scroll-padding-top`, `ThemeToggle`, squelettes, `StatTile`, badges sombres `success` / `info` / `warning`, anglicismes de démonstration, `scope="col"`, `aria-current`, niveau de titre de `EmptyState`) ainsi que le message « Search for a command to run... » de `command.tsx`, hors du périmètre confié.

## 9. Hors périmètre de cette revue

- Aucune mesure réelle sur écran mobile en plein soleil ; les ratios sont théoriques.
- Les couleurs de séries (`cropColors`, échelles séquentielle et divergente) ne sont pas utilisées comme texte et n'ont pas été évaluées ; elles le seront avec les premiers graphiques et cartes.
- La page d'accueil (`src/features/landing`) n'a pas été relue.
