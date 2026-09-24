# Design system — guide d'usage des composants

> Rédigé par : Expert front-end et design system.
> Statut : version 1.0 — étape 1 de la phase 2. Ce guide décrit comment utiliser les jetons et les composants livrés dans `src/components` et `src/styles`. Les principes, la palette et les intentions de marque sont fixés dans le document 07 ; ce guide ne les répète pas, il dit comment les appliquer dans le code. La page `/design-system` en est la démonstration vivante.

## 1. Principes et organisation

### 1.1 Renvoi aux principes

Le document 07 (identité visuelle et design system) fixe les décisions de fond : palette issue du territoire, typographie Inter et JetBrains Mono, grille de 4 px, ombres presque absentes, mouvement sobre, accessibilité WCAG 2.2 AA, et les six espaces utilisateurs avec leurs métaphores. Trois règles en découlent et traversent tout ce guide :

- un chiffre affiché porte toujours sa source et son niveau de fiabilité ;
- aucune information n'est portée par la couleur seule ;
- l'espace agriculteur est l'utilisateur de référence : ce qui n'y fonctionne pas ne fonctionne pas.

### 1.2 Organisation des dossiers

| Dossier | Contenu | Exemples |
|---|---|---|
| `src/components/ui` | Composants shadcn/ui personnalisés. Primitives génériques sans vocabulaire métier, construites sur Radix UI et `class-variance-authority`. | `button.tsx`, `dialog.tsx`, `form.tsx`, `table.tsx` |
| `src/components/data-display` | Affichage de données métier : indicateurs, provenance, fiabilité, pictogrammes de cultures. | `stat-tile.tsx`, `reliability-badge.tsx`, `source-caption.tsx`, `crop-glyph.tsx` |
| `src/components/feedback` | Retours à l'utilisateur : confiance de l'assistant, états vides, état réseau. | `confidence-meter.tsx`, `empty-state.tsx`, `offline-banner.tsx` |
| `src/components/layout` | Structure de page : en-tête de page, en-tête et pied de site, bascule de thème. | `page-header.tsx`, `site-header.tsx`, `theme-toggle.tsx` |
| `src/components/providers` | Fournisseurs de contexte montés une fois dans la racine de l'application. | `theme-provider.tsx`, `pwa-provider.tsx` |
| `src/components/motion` | Enveloppes d'animation respectant `prefers-reduced-motion`. | `reveal.tsx` |
| `src/components/brand` | Éléments de marque. | `monogram.tsx` |

Les sections de démonstration de la page `/design-system` vivent dans `src/features/design-system` et ne sont pas des composants réutilisables.

### 1.3 Où placer un nouveau composant

1. **Il n'a aucun vocabulaire métier** (un bouton, un menu, un onglet) : il va dans `src/components/ui`. S'il existe dans shadcn/ui, on l'ajoute avec la CLI shadcn puis on l'adapte aux jetons ; on ne recopie pas un composant depuis une autre bibliothèque.
2. **Il affiche une donnée du domaine** (fiabilité, source, culture, indicateur) : `src/components/data-display`.
3. **Il informe l'utilisateur d'un état** (réseau, confiance, absence de données, synchronisation) : `src/components/feedback`.
4. **Il structure une page** : `src/components/layout`.
5. **Il n'est utile qu'à une fonctionnalité** (un formulaire de déclaration de récolte, un panneau de tournée) : il reste dans `src/features/<fonctionnalité>` et ne remonte dans `src/components` que lorsqu'une deuxième fonctionnalité en a besoin.

Chaque composant partagé porte un attribut `data-slot` (et `data-variant` lorsqu'il a des variantes), un test unitaire lorsqu'il contient de la logique, et une démonstration dans la section correspondante de `/design-system`.

### 1.4 Règle des dépendances : les fonctionnalités n'importent jamais Prisma

Les frontières entre couches sont vérifiées par ESLint (`eslint-plugin-boundaries`, configuration dans `eslint.config.mjs`). La politique est « tout interdit sauf autorisation » :

- `components` ne peut importer que `components`, `lib`, `types`, `styles` : un composant partagé ne connaît ni les fonctionnalités, ni les modules métier, ni la base de données ;
- `features` peut importer `features`, `components`, `modules`, `services`, `lib`, `types`, `styles`, mais **jamais `database` ni `generated`** : une fonctionnalité ne touche pas Prisma, elle passe par les modules métier (`src/modules`) qui seuls accèdent aux dépôts de données ;
- `modules` ne peut importer ni Next, ni React, ni l'interface : le domaine reste indépendant du cadre technique.

Concrètement, une page ou un composant de fonctionnalité qui a besoin d'une donnée appelle une fonction d'un module (par exemple une action serveur ou un service du module `registry`), reçoit un objet typé, et le passe aux composants. Toute importation de `@/database/*` ou de `@/generated/*` depuis `src/features` ou `src/components` est une erreur de lint bloquante.

## 2. Jetons

### 2.1 Deux fichiers, une seule source de vérité

- `src/styles/tokens.css` déclare les variables CSS dans `:root` (thème clair) et `.dark` (thème sombre). C'est la source de vérité pour tout ce qui est rendu par le navigateur.
- `src/styles/tokens.ts` recopie les valeurs de couleur sous forme de constantes JavaScript pour les bibliothèques qui ne lisent pas les variables CSS : MapLibre, graphiques, exports PNG. Toute modification d'une couleur se fait dans les deux fichiers, et la section « Jetons » de `/design-system` permet de vérifier visuellement la concordance.
- `src/app/globals.css` expose les variables à Tailwind CSS 4 dans un bloc `@theme inline`, ce qui produit les classes utilitaires (`bg-primary`, `text-watch`, `border-stone-200`, `shadow-card`, `ease-brand`).

### 2.2 Couleurs de marque et neutres

Ces variables portent la palette du document 07 et ne changent pas entre les thèmes ; elles servent aux visualisations et aux composants de marque. Classes Tailwind : `bg-gulf`, `text-laterite`, `bg-stone-100`, etc.

| Variable | Valeur | Rôle |
|---|---|---|
| `--ink` | `#0b1f2a` | Texte principal, fond du thème sombre |
| `--gulf`, `--gulf-strong`, `--gulf-soft` | `#0f4c5c`, `#0a3642`, `#e3edf0` | Primaire (golfe de Guinée), pressé, fond doux |
| `--laterite`, `--laterite-soft` | `#b7410e`, `#f6e6dd` | Accent (latérite du Nord), fond doux |
| `--forest`, `--forest-soft` | `#1f5a3c`, `#e4efe8` | Validation, fond doux |
| `--chalk`, `--paper` | `#f6f3ee`, `#ffffff` | Fond de page, fond des cartes |
| `--stone-50` à `--stone-900` | de `#faf8f5` à `#18222a` | Neutres chauds : bordures, textes secondaires, désactivés |

### 2.3 Variables sémantiques lues par shadcn/ui

Les composants de `src/components/ui` ne référencent que ces variables. Elles changent avec le thème.

| Variable | Usage | Thème clair | Thème sombre |
|---|---|---|---|
| `--background` / `--foreground` | Fond de page et texte courant | `chalk` / `ink` | `ink` / `chalk` |
| `--card` / `--card-foreground` | Cartes, tuiles, panneaux | `paper` / `ink` | `#112b37` / `chalk` |
| `--popover` / `--popover-foreground` | Menus, infobulles, sélecteurs | `paper` / `ink` | `#112b37` / `chalk` |
| `--primary` / `--primary-foreground` | Action principale, liens, focus | `gulf` / `chalk` | `#5aa9bb` / `ink` |
| `--secondary` / `--secondary-foreground` | Action secondaire, fonds discrets | `stone-100` / `ink` | `#183643` / `chalk` |
| `--muted` / `--muted-foreground` | Fonds atténués, textes secondaires | `stone-100` / `stone-600` | `#183643` / `#a9b7bd` |
| `--accent` / `--accent-foreground` | Survol, sélection | `gulf-soft` / `gulf-strong` | `#1c4250` / `#cfe6ec` |
| `--destructive` / `--destructive-foreground` | Suppression, erreur de saisie | `critical` / `paper` | `#e36b7a` / `ink` |
| `--border` | Bordures de 1 px | `stone-200` | `#1f3a47` |
| `--input` | Bordure des champs (3:1 minimum sur le fond de page et sur les cartes) | `stone-500` | `#4d7989` |
| `--ring` | Anneau de focus | `gulf` | `#5aa9bb` |
| `--radius` | Rayon de base (0,625 rem), décliné en `sm`, `md`, `lg`, `xl` | identique | identique |

### 2.4 Couleurs sémantiques produit

Elles portent les niveaux d'alerte et les états du produit. Les valeurs claires sont calibrées pour du texte sur fond clair et tombent sous 3:1 sur les cartes sombres ; le bloc `.dark` les redéfinit donc avec des valeurs éclaircies qui tiennent 4,5:1 minimum sur `--card`. Les classes Tailwind (`text-watch`, `bg-info/15`) suivent automatiquement le thème.

| Variable | Signification | Thème clair | Thème sombre | Classes |
|---|---|---|---|---|
| `--info` | Information, niveau d'alerte INFO | `#1e5a8a` | `#8fc3d9` | `text-info`, `bg-info/15` |
| `--success` | Succès, validation | `#1f5a3c` | `#5fa77f` | `text-success` |
| `--watch` | Vigilance, niveau d'alerte WATCH, données estimées | `#82540f` | `#d9a24a` | `text-watch` |
| `--warning` | Avertissement, niveau d'alerte WARNING | `#b7410e` | `#e07a45` | `text-warning` |
| `--critical` | Critique, niveau d'alerte CRITICAL | `#8b1e2d` | `#f08a95` | `text-critical` |
| `--offline` | Hors connexion, synchronisation en attente | `#5b5f66` | `#5b5f66` | `bg-offline` |

La valeur claire de `--watch` est plus sombre que la couleur de série `--chart-4` (`#b7791f`), conservée pour les graphiques : le texte de vigilance doit atteindre 4,5:1 sur le fond de page, une série de graphique non. Le détail des ratios mesurés est dans le rapport `docs/rapports/revue-accessibilite-etape-1.md`, section 8.

### 2.5 Échelles de données

| Jeton | Où | Contenu | Usage |
|---|---|---|---|
| `--chart-1` à `--chart-5` | CSS et Tailwind (`bg-chart-1`) | Cinq couleurs de séries, adaptées au thème sombre | Graphiques à peu de séries, badges de fiabilité |
| `sequentialScale` | `tokens.ts` | 7 paliers du plus clair au golfe profond | Densité, hectares, production sur les cartes choroplèthes |
| `divergingScale` | `tokens.ts` | 7 paliers, latérite pour le déficit, craie au centre, golfe pour l'excédent | Écart à la normale (pluie, rendement) |
| `cropColors` | `tokens.ts` | Couleur fixe par culture majeure (12 codes), distinctes en deutéranopie et protanopie | Même couleur pour une culture dans tout le produit |
| `reliabilityColors` | `tokens.ts` | Une couleur par niveau de fiabilité | Cartes et graphiques, en cohérence avec `ReliabilityBadge` |

### 2.6 Tailles de contrôles, ombres, mouvement

| Jeton | Valeur | Usage |
|---|---|---|
| `--size-control-sm` / `-md` / `-lg` / `-xl` | 2 rem / 2,5 rem / 2,75 rem / 3,5 rem | Hauteurs de contrôles ; `xl` (56 px) est la taille de l'espace agriculteur |
| `--size-touch-min` | 2,75 rem (44 px) | Cible tactile minimale (WCAG 2.5.8). Les contrôles `default` (`Button`, `Input`, `SelectTrigger`) mesurent 44 px sous 768 px et 36 px à partir du point de rupture `md` |
| `--shadow-card` | ombre de 1 px très légère | Tuiles et cartes posées sur le fond de page (`shadow-card`) |
| `--shadow-raised` | ombre douce de 4 px | Éléments survolés ou détachés (`shadow-raised`) |
| `--shadow-overlay` | ombre portée de 16 px | Fenêtres modales, feuilles latérales (`shadow-overlay`) |
| `--motion-fast` / `-base` / `-slow` | 120 ms / 180 ms / 220 ms | Durées de transition |
| `--motion-ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Courbe unique, exposée en `ease-brand` |

`globals.css` neutralise toutes les animations et transitions lorsque l'utilisateur a activé `prefers-reduced-motion`. Les composants n'ont donc pas à gérer ce cas eux-mêmes, sauf ceux qui animent en JavaScript (voir `Reveal`).

### 2.7 Comment consommer les jetons

- **Dans un composant React rendu par le navigateur** : uniquement des classes Tailwind sémantiques (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-watch/15`). Jamais de valeur hexadécimale en dur, jamais de `style={{ color: … }}` pour une couleur de la palette.
- **Dans MapLibre, un graphique ou un export image** : importer `brandColors`, `semanticColors`, `sequentialScale`, `divergingScale`, `cropColors` ou `reliabilityColors` depuis `@/styles/tokens`. Les bibliothèques de cartographie et de graphiques reçoivent des chaînes, pas des variables CSS.
- **Une couleur qui n'existe pas dans les jetons** est un signal : soit le besoin se ramène à un jeton existant, soit il faut ajouter le jeton dans les deux fichiers et l'exposer dans `globals.css`, avec une justification dans la section « Jetons » de `/design-system`.
- **Thème sombre** : les composants doivent rester lisibles dans les deux thèmes. Les variables sémantiques shadcn et les couleurs produit sont toutes redéfinies dans `.dark` ; un composant qui utilise `text-watch` ou `border-l-critical` est donc lisible dans les deux thèmes sans variante. Une variante `dark:` ne reste nécessaire que pour un fond teinté (`bg-laterite-soft` devient `dark:bg-laterite/30` dans `Badge`), car les couleurs de marque, elles, ne changent pas avec le thème.

## 3. Fiches des composants

Chaque fiche donne le chemin d'import, les propriétés principales, les variantes, un exemple court, les règles d'usage propres au produit et les points d'accessibilité. Les composants de `src/components/ui` acceptent en plus toutes les propriétés de l'élément HTML ou du composant Radix sous-jacent, ainsi que `className`, fusionné par `cn`.

### 3.1 Button

- **Import** : `import { Button, buttonVariants } from "@/components/ui/button";`
- **Propriétés** : `variant`, `size`, `asChild` (rend l'enfant à la place du bouton, pour un lien Next stylé en bouton), `disabled`, `type`.
- **Variantes** : `default` (action principale, fond primaire), `secondary`, `outline`, `ghost`, `link`, `destructive`.
- **Tailles** : `default` (44 px sous 768 px, 36 px à partir de `md`), `xs` (24 px), `sm` (32 px), `lg` (40 px), `icon` (44 px puis 36 px, comme `default`), `icon-xs`, `icon-sm`, `icon-lg`. Les tailles `xs`, `sm` et `lg` ne changent pas avec la largeur d'écran : sur mobile, elles n'atteignent la cible tactile de 44 px que si leur zone cliquable est agrandie par le conteneur.

```tsx
<Button>Enregistrer la déclaration</Button>
<Button variant="outline" size="sm">Annuler</Button>
<Button asChild><Link href="/carte">Ouvrir la carte</Link></Button>
<Button className="h-14 w-full text-base">Déclarer ma récolte</Button>
```

- **Règles** : une seule action `default` par écran ; `destructive` réservé aux suppressions irréversibles et toujours précédé d'une confirmation (`Dialog`) ; sur l'espace agriculteur, la hauteur passe à 56 px et la largeur à 100 % (`className="h-14 w-full text-base"`), comme dans la section « Boutons » de `/design-system` ; le libellé est un verbe à l'infinitif suivi de l'objet (« Déclarer ma récolte »), jamais « OK » ou « Valider » seul.
- **Accessibilité** : anneau de focus de 3 px sur `focus-visible` ; un bouton icône seul reçoit obligatoirement `aria-label` ; le contenu désactivé garde son contraste lisible (opacité 50 %) et n'est jamais le seul moyen de comprendre pourquoi l'action est impossible.

### 3.2 Champs de saisie : Input, Label, Textarea, Select, Checkbox, Switch, RadioGroup

- **Imports** : `@/components/ui/input`, `@/components/ui/label`, `@/components/ui/textarea`, `@/components/ui/select` (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectGroup`, `SelectLabel`, `SelectItem`), `@/components/ui/checkbox`, `@/components/ui/switch`, `@/components/ui/radio-group` (`RadioGroup`, `RadioGroupItem`).
- **Propriétés** : celles de l'élément natif (`type`, `inputMode`, `placeholder`, `rows`, `disabled`) ; `Select` et `Switch` acceptent `size="default" | "sm"` ; `Checkbox`, `Switch` et `RadioGroup` sont contrôlés par `checked` / `value` et `onCheckedChange` / `onValueChange`.
- **Tailles** : `Input` et `SelectTrigger` (`size="default"`) mesurent 44 px sous 768 px et 36 px à partir de `md`, comme `Button` ; `SelectTrigger` `size="sm"` reste à 32 px ; `Textarea` a une hauteur minimale de 64 px ; `Checkbox` et `RadioGroupItem` mesurent 20 px (coche 16 px, point 10 px) ; `Switch` `default` mesure 24 × 40 px avec un pouce de 20 px, `sm` 14 × 24 px.

```tsx
<div className="grid gap-2">
  <Label htmlFor="surface">Superficie (ha)</Label>
  <Input id="surface" type="number" inputMode="decimal" placeholder="0" />
</div>

<Select value={unit} onValueChange={setUnit}>
  <SelectTrigger className="w-40"><SelectValue placeholder="Unité" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="KG">kg</SelectItem>
    <SelectItem value="BAG_100KG">sac de 100 kg</SelectItem>
  </SelectContent>
</Select>

<RadioGroup value={season} onValueChange={setSeason}>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="GS" id="gs" /><Label htmlFor="gs">Grande saison</Label>
  </div>
</RadioGroup>
```

- **Règles** : tout champ a un `Label` visible relié par `htmlFor` ; un `placeholder` n'est jamais le seul libellé ; les nombres utilisent `inputMode="decimal"` ou `"numeric"` pour ouvrir le bon clavier sur mobile ; les unités locales (sac, bassine, tas) sont proposées dans un `Select` adjacent et la conversion reste explicite ; `Switch` sert à un réglage à effet immédiat, `Checkbox` à un consentement ou une sélection soumise avec le formulaire ; en dehors d'un `Form`, l'état d'erreur se signale avec `aria-invalid`.
- **Accessibilité** : bordure et anneau passent en `destructive` sur `aria-invalid` ; les cases à cocher et boutons radio mesurent 20 px et leur zone cliquable inclut le libellé associé par `htmlFor`, ce qui atteint la cible de 44 px ; les bordures de champs (`--input`) tiennent 3:1 sur le fond de page et sur les cartes dans les deux thèmes ; sur l'espace agriculteur, passer les contrôles en `h-14` et le texte en 16 px minimum.

### 3.3 Form (react-hook-form et Zod)

- **Import** : `import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage, useFormField } from "@/components/ui/form";` avec `useForm` de `react-hook-form`, `zodResolver` de `@hookform/resolvers/zod` et `z` de `zod`.
- **Rôle** : relie un schéma Zod, l'état du formulaire et les attributs d'accessibilité. `FormItem` génère un identifiant ; `FormLabel`, `FormControl`, `FormDescription` et `FormMessage` s'y rattachent automatiquement (`htmlFor`, `aria-describedby`, `aria-invalid`).
- **Le motif `z.input` / `z.output`** : un champ numérique arrive du DOM sous forme de chaîne. Le schéma déclare explicitement la conversion avec `.pipe(z.coerce.number())`, ce qui donne deux types : celui que saisit l'utilisateur (`z.input`, des chaînes) et celui qui sort de la validation (`z.output`, des nombres). `useForm` reçoit les deux, et `handleSubmit` livre le type validé. C'est le motif de `src/features/design-system/harvest-declaration-demo.tsx`, à reprendre tel quel.

```tsx
const schema = z.object({
  crop: z.string().min(1, "Choisissez une culture"),
  quantity: z
    .string()
    .min(1, "Indiquez une quantité")
    .pipe(z.coerce.number({ error: "Indiquez une quantité valide" }).positive()),
  consent: z.boolean().refine((v) => v, { message: "Le consentement est nécessaire" }),
});
type Input = z.input<typeof schema>;
type Output = z.output<typeof schema>;

const form = useForm<Input, undefined, Output>({
  resolver: zodResolver(schema),
  defaultValues: { crop: "", quantity: "", consent: false },
});

<Form {...form}>
  <form onSubmit={form.handleSubmit((values) => save(values))} noValidate>
    <FormField
      control={form.control}
      name="quantity"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Quantité récoltée</FormLabel>
          <FormControl>
            <Input type="number" inputMode="decimal" {...field} value={field.value ?? ""} />
          </FormControl>
          <FormDescription>En kilogrammes.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
    <Button type="submit">Enregistrer</Button>
  </form>
</Form>
```

- **Règles** : le même schéma Zod sert au formulaire et à l'action serveur, dans le module métier, pour que les messages d'erreur soient identiques des deux côtés ; `noValidate` sur la balise `form` pour laisser Zod produire les messages ; un `Select` ou une `Checkbox` s'enveloppe dans `FormControl` pour recevoir les attributs d'accessibilité ; les messages d'erreur sont des phrases en français qui disent quoi faire (« Indiquez une quantité »), pas « champ invalide » ; sur l'espace agent, sauvegarder à chaque champ (brouillon local) plutôt qu'à la soumission.
- **Accessibilité** : `FormMessage` est relié au contrôle par `aria-describedby`, le libellé passe en `destructive` via `data-error`, le focus va au premier champ en erreur après soumission (comportement de react-hook-form).

### 3.4 Card

- **Import** : `import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@/components/ui/card";`
- **Structure** : `CardHeader` accueille `CardTitle`, `CardDescription` et un `CardAction` optionnel aligné à droite ; `CardContent` porte le corps ; `CardFooter` les actions.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Exploitation de Djougou-Nord</CardTitle>
    <CardDescription>3 parcelles, 4,2 ha déclarés</CardDescription>
    <CardAction><ReliabilityBadge level="FIELD_VERIFIED" /></CardAction>
  </CardHeader>
  <CardContent>…</CardContent>
  <CardFooter><SourceCaption source="ATDA Donga" date="12 sept. 2026" /></CardFooter>
</Card>
```

- **Règles** : fond `paper` sur page `chalk`, bordure de 1 px, ombre `card` ; pas de carte dans une carte ; une carte qui présente un chiffre unique doit être un `StatTile`.
- **Accessibilité** : `CardTitle` est un `div` ; lorsqu'il structure la page, l'envelopper d'un titre de niveau approprié (`<h2>`) ou passer `asChild` selon le contexte.

### 3.5 Dialog

- **Import** : `import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";`
- **Propriétés** : `open` / `onOpenChange` pour un usage contrôlé ; `DialogContent` accepte `showCloseButton`.

```tsx
<Dialog>
  <DialogTrigger asChild><Button variant="destructive">Supprimer la parcelle</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Supprimer la parcelle P-03 ?</DialogTitle>
      <DialogDescription>Les déclarations de cultures associées seront archivées.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
      <Button variant="destructive">Supprimer</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- **Règles** : réservé aux confirmations et aux saisies courtes ; un flux de plusieurs étapes se fait dans une page ou une `Sheet` ; `DialogTitle` et `DialogDescription` sont obligatoires ; l'action destructive est à droite, l'annulation à gauche ; jamais de `Dialog` sur l'espace agriculteur pour une saisie, seulement pour une confirmation.
- **Accessibilité** : Radix gère le piège de focus, la fermeture par Échap et `aria-labelledby` / `aria-describedby` ; le bouton de fermeture mesure 36 px, porte le libellé masqué « Fermer » et se place dans le coin supérieur droit ; ne pas le retirer (`showCloseButton={false}`) sans fournir une autre sortie clavier.

### 3.6 Sheet

- **Import** : `import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from "@/components/ui/sheet";`
- **Propriétés** : `SheetContent` accepte `side="right" | "left" | "top" | "bottom"` (droite par défaut).

```tsx
<Sheet>
  <SheetTrigger asChild><Button variant="outline">Filtres</Button></SheetTrigger>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Filtrer les exploitations</SheetTitle>
      <SheetDescription>Commune, culture, niveau de fiabilité.</SheetDescription>
    </SheetHeader>
    …
  </SheetContent>
</Sheet>
```

- **Règles** : panneau latéral pour les filtres, le détail d'un élément de carte ou de tableau, la navigation mobile ; `side="bottom"` sur mobile pour les feuilles proches du pouce (mode « une main » de l'espace agent) ; rayon de 16 px sur les feuilles mobiles.
- **Accessibilité** : mêmes garanties que `Dialog`, y compris le bouton de fermeture de 36 px libellé « Fermer » ; le titre est obligatoire.

### 3.7 DropdownMenu

- **Import** : `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuShortcut } from "@/components/ui/dropdown-menu";`
- **Propriétés** : `DropdownMenuItem` accepte `variant="destructive"` et `inset` ; `DropdownMenuContent` accepte `align` et `sideOffset`.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem>Exporter en CSV</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive">Archiver</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

- **Règles** : menu d'actions secondaires sur une ligne de tableau ou une carte ; au plus sept entrées ; les actions destructives en dernier, séparées ; absent de l'espace agriculteur (une action par écran).
- **Accessibilité** : navigation aux flèches, fermeture par Échap, le déclencheur icône porte `aria-label`.

### 3.8 Popover

- **Import** : `import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverHeader, PopoverTitle, PopoverDescription } from "@/components/ui/popover";`

```tsx
<Popover>
  <PopoverTrigger asChild><Button variant="outline" size="sm">Provenance</Button></PopoverTrigger>
  <PopoverContent>
    <PopoverHeader>
      <PopoverTitle>Source de l'indicateur</PopoverTitle>
      <PopoverDescription>MAEP / DSA, campagne 2024-2025, 55 % de données vérifiées.</PopoverDescription>
    </PopoverHeader>
  </PopoverContent>
</Popover>
```

- **Règles** : contenu riche ouvert au clic (détail de provenance sur le tableau de bord ministériel, mini-formulaire, légende) ; pour un texte court au survol, préférer `Tooltip`.
- **Accessibilité** : le contenu est atteignable au clavier et se ferme par Échap ; ne pas y placer d'information indispensable sans autre accès.

### 3.9 Tooltip

- **Import** : `import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";`

```tsx
<Tooltip>
  <TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Synchroniser"><RefreshCw /></Button></TooltipTrigger>
  <TooltipContent>Synchroniser les données de la tournée</TooltipContent>
</Tooltip>
```

- **Règles** : une phrase courte, pas de contenu interactif ; jamais l'unique porteur d'une information (le survol n'existe pas au tactile) ; sur le tableau de bord ministériel, le survol d'un chiffre affiche sa provenance, mais celle-ci reste disponible dans un `Popover` ou un `SourceCaption`.
- **Accessibilité** : s'affiche aussi au focus clavier ; le déclencheur doit être focalisable.

### 3.10 Table

- **Import** : `import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from "@/components/ui/table";`

```tsx
<Table>
  <TableCaption>Exploitations de la commune de Copargo, campagne 2025-2026.</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>Exploitation</TableHead>
      <TableHead className="text-right">Superficie (ha)</TableHead>
      <TableHead>Fiabilité</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell className="font-mono">BJ-DON-002-000123</TableCell>
      <TableCell className="tabular text-right">4,2</TableCell>
      <TableCell><ReliabilityBadge level="AGENT_VERIFIED" /></TableCell>
    </TableRow>
  </TableBody>
</Table>
```

- **Règles** : le conteneur défile horizontalement sur petit écran ; chiffres alignés à droite avec la classe `tabular` ; codes en `font-mono` ; une colonne de fiabilité ou un `SourceCaption` sous le tableau ; corps de texte à 14 px sur les tableaux denses du ministère, jamais moins ; le composant `DataTable` (tri, filtres, densité, export) prévu au document 07 se construira au-dessus de ces primitives.
- **Accessibilité** : `TableCaption` décrit le tableau ; les en-têtes sont de vrais `th` ; une ligne cliquable contient un lien ou un bouton explicite plutôt qu'un gestionnaire sur `tr`.

### 3.11 Tabs

- **Import** : `import { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from "@/components/ui/tabs";`
- **Variantes** : `TabsList` accepte `variant="default"` (fond atténué) ou `"line"` (soulignement) ; `Tabs` accepte `orientation="vertical"`.

```tsx
<Tabs defaultValue="parcelles">
  <TabsList variant="line">
    <TabsTrigger value="parcelles">Parcelles</TabsTrigger>
    <TabsTrigger value="cultures">Cultures</TabsTrigger>
  </TabsList>
  <TabsContent value="parcelles">…</TabsContent>
  <TabsContent value="cultures">…</TabsContent>
</Tabs>
```

- **Règles** : au plus cinq onglets ; les libellés sont des noms, pas des verbes ; pas d'onglets sur l'espace agriculteur.
- **Accessibilité** : navigation aux flèches gérée par Radix ; chaque `TabsContent` est relié à son déclencheur.

### 3.12 Badge

- **Import** : `import { Badge, badgeVariants } from "@/components/ui/badge";`
- **Variantes génériques** : `default`, `secondary`, `outline`, `ghost`, `link`, `destructive`.
- **Variantes sémantiques** : `info`, `success`, `watch`, `warning`, `critical`, `offline`, alignées sur les niveaux d'alerte et les états du produit, avec fond doux et texte coloré, ajustées pour le thème sombre.

```tsx
<Badge variant="success">Exploitation vérifiée</Badge>
<Badge variant="watch">Vigilance sécheresse</Badge>
<Badge variant="offline">3 saisies en attente</Badge>
```

- **Règles** : un badge porte un état ou une catégorie, jamais une action ; le libellé dit l'état en toutes lettres ; pour le niveau de fiabilité d'une donnée, utiliser `ReliabilityBadge` et non un `Badge` coloré.
- **Accessibilité** : le texte suffit à comprendre l'état sans la couleur ; un badge icône seul porte `aria-label`.

### 3.13 Alert

- **Import** : `import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";`
- **Variantes** : `default`, `info`, `success`, `watch`, `warning`, `critical`, `destructive`. Le fond reste clair ; la couleur porte sur la bordure gauche de 4 px, l'icône et le titre, pour rester lisible en plein soleil. `critical` ajoute un fond très légèrement teinté.

```tsx
<Alert variant="warning">
  <CloudRain />
  <AlertTitle>Déficit hydrique sur Malanville</AlertTitle>
  <AlertDescription>
    <p>Cumul de pluie sur 30 jours inférieur de 40 % à la normale. 1 240 exploitations concernées.</p>
  </AlertDescription>
</Alert>
```

- **Règles** : la variante suit le niveau d'alerte du domaine (INFO, WATCH, WARNING, CRITICAL) ; le titre nomme le fait et la zone ; la description donne le chiffre, sa source et l'action attendue ; `destructive` est réservé aux erreurs techniques du formulaire ou du système ; le composant `AlertCard` (gravité, zone, exploitations touchées, action) prévu au document 07 se construira au-dessus.
- **Accessibilité** : `role="alert"` est posé par le composant, ce qui annonce le contenu aux lecteurs d'écran à l'apparition ; réserver donc `Alert` aux messages qui méritent une annonce, et utiliser un simple texte pour une note permanente.

### 3.14 Skeleton

- **Import** : `import { Skeleton } from "@/components/ui/skeleton";`

```tsx
<div className="flex flex-col gap-3">
  <Skeleton className="h-4 w-1/3" />
  <Skeleton className="h-8 w-24" />
</div>
```

- **Règles** : reproduire la silhouette du contenu attendu (une tuile, trois lignes de tableau), pas un bloc gris uniforme ; ne pas dépasser deux secondes sans message ; sur une connexion lente, préférer afficher les données locales avec un `OfflineBanner` ou un indicateur de synchronisation.
- **Accessibilité** : le conteneur en chargement porte `aria-busy="true"` ; l'animation est neutralisée par `prefers-reduced-motion`.

### 3.15 StatTile

- **Import** : `import { StatTile, type StatTrend } from "@/components/data-display/stat-tile";`
- **Propriétés** : `label` (obligatoire), `value` (nombre formaté en français ou chaîne), `unit`, `trend` (`{ value, label?, positiveIsGood? }`, variation relative en pourcentage), `source`, `sourceDate`, `reliability`, `icon`, `className`.

```tsx
<StatTile
  label="Exploitations enregistrées"
  value={48_312}
  trend={{ value: 3.4, label: "sur 30 jours" }}
  source="Registre BAIS"
  sourceDate="24 sept. 2026"
  reliability="AGENT_VERIFIED"
/>
<StatTile label="Alertes critiques" value={7} trend={{ value: -12, positiveIsGood: false }} source="Moteur d'alertes" reliability="ESTIMATED" />
```

- **Règles** : c'est le seul composant autorisé pour afficher un indicateur chiffré isolé ; `source` et `reliability` sont techniquement optionnels pour permettre les états de chargement, mais une tuile publiée sans les deux est une anomalie de revue ; `positiveIsGood` doit être `false` pour les compteurs d'alertes, de doublons ou de retards ; les nombres sont passés en `number` pour bénéficier du formatage français.
- **Accessibilité** : la tendance combine icône, signe et couleur ; la valeur utilise des chiffres tabulaires.

### 3.16 ReliabilityBadge

- **Import** : `import { ReliabilityBadge, reliabilityLabels, type Reliability } from "@/components/data-display/reliability-badge";`
- **Propriétés** : `level` (`DECLARED`, `AGENT_VERIFIED`, `FIELD_VERIFIED`, `OFFICIAL`, `ESTIMATED`, `SYNTHETIC`), `showLabel` (vrai par défaut), `className`.

```tsx
<ReliabilityBadge level="FIELD_VERIFIED" />
<ReliabilityBadge level="DECLARED" showLabel={false} />
```

- **Règles** : l'énumération est celle du document 08 ; la pastille porte une texture en plus de la couleur (hachures pour le déclaré, aplat moyen pour la vérification par agent, aplat plein pour le terrain, pointillé pour le synthétique) ; les libellés français sont centralisés dans `reliabilityLabels` et ne se réécrivent pas ailleurs ; sur une carte ou un graphique, utiliser `reliabilityColors` de `tokens.ts` pour rester cohérent.
- **Accessibilité** : sans libellé visible, le composant pose `aria-label` et `title` ; l'attribut `data-reliability` permet les tests et les styles ciblés.

### 3.17 SourceCaption

- **Import** : `import { SourceCaption } from "@/components/data-display/source-caption";`
- **Propriétés** : `source` (obligatoire), `date`, `className`.

```tsx
<SourceCaption source="ATDA Donga, relevé terrain" date="12 sept. 2026" />
```

- **Règles** : sous tout graphique, tableau ou bloc de chiffres qui n'est pas déjà un `StatTile` ; la date est celle de la donnée (`source_date`), pas celle de l'affichage ; le libellé de source est lisible par un citoyen (« MAEP / DSA » plutôt qu'un identifiant technique).

### 3.18 ConfidenceMeter

- **Import** : `import { ConfidenceMeter, type ConfidenceLevel } from "@/components/feedback/confidence-meter";`
- **Propriétés** : `level` (`HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT`), `score` (0 à 1, affiché en pourcentage aux utilisateurs avancés), `className`.

```tsx
<ConfidenceMeter level="MEDIUM" score={0.62} />
```

- **Règles** : affiché sous chaque réponse de l'assistant ; le libellé et l'explication sont toujours rendus, la jauge seule est interdite ; au niveau `INSUFFICIENT`, l'assistant ne formule pas de recommandation et l'interface propose de contacter un agent ; `score` n'est montré qu'aux espaces ministère et coopérative.
- **Accessibilité** : rôle `meter` avec `aria-valuemin`, `aria-valuemax`, `aria-valuenow` et `aria-valuetext` ; les quatre barres sont `aria-hidden`.

### 3.19 EmptyState

- **Import** : `import { EmptyState } from "@/components/feedback/empty-state";`
- **Propriétés** : `title` (obligatoire), `description`, `icon`, `action`, `className`.

```tsx
<EmptyState
  icon={<MapPinned />}
  title="Aucune parcelle relevée"
  description="Tracez la première parcelle depuis l'application de tournée."
  action={<Button>Relever une parcelle</Button>}
/>
```

- **Règles** : motif de grille en fond, jamais d'illustration de personnage ; un titre court, une explication d'une phrase, au plus une action ; distinguer « aucune donnée » (état vide) de « données non chargées » (`Skeleton`) et de « erreur » (`Alert`).

### 3.20 OfflineBanner

- **Import** : `import { OfflineBanner, useIsOnline } from "@/components/feedback/offline-banner";`
- **Propriétés** : aucune ; le composant lit l'état réseau du navigateur et ne rend rien lorsque la connexion est présente. `useIsOnline` expose le même état aux autres composants.

```tsx
<OfflineBanner />
```

- **Règles** : monté une fois par gabarit d'espace, sous l'en-tête ; le message rassure (« vos saisies sont conservées sur cet appareil ») et ne bloque rien ; l'indicateur de synchronisation détaillé (`SyncIndicator`, prévu au document 07) le complètera.
- **Accessibilité** : `role="status"` et `aria-live="polite"` ; côté serveur la connexion est supposée présente, le bandeau n'apparaît qu'après hydratation, ce qui évite un éclair au chargement.

### 3.21 PageHeader

- **Import** : `import { PageHeader } from "@/components/layout/page-header";`
- **Propriétés** : `title` (obligatoire, rendu en `h1`), `eyebrow` (surtitre en capitales), `description`, `actions`, `className`.

```tsx
<PageHeader
  eyebrow="Commune de Copargo"
  title="Tableau de bord"
  description="Chiffres clés, carte et alertes de la campagne 2025-2026."
  actions={<Button variant="outline">Exporter</Button>}
/>
```

- **Règles** : un seul `PageHeader` par page, en tête de `main` ; le titre est un nom ; les actions sont au plus deux ; le surtitre nomme le territoire ou l'espace.

### 3.22 ThemeToggle

- **Import** : `import { ThemeToggle } from "@/components/layout/theme-toggle";`
- **Propriétés** : aucune ; s'appuie sur `next-themes` via `ThemeProvider`.

```tsx
<ThemeToggle />
```

- **Règles** : présent uniquement dans les en-têtes des espaces qui autorisent le thème sombre (voir section 4) ; l'icône n'est rendue qu'après hydratation pour éviter une icône fausse côté serveur.
- **Accessibilité** : bouton icône avec `aria-label` dynamique et `aria-pressed`.

### 3.23 CropGlyph

- **Import** : `import { CropGlyph, CROP_CODES, CROP_GLYPH_LABELS, type CropCode } from "@/components/data-display/crop-glyph";`
- **Propriétés** : `code` (l'un des 21 codes de cultures de la phase 1, alignés sur `src/database/seed/reference/crops.ts`), `size` (`24` ou `48`), `title` (libellé accessible de remplacement), `className`.

```tsx
<CropGlyph code="MAIZE" />
<span className="text-laterite"><CropGlyph code="YAM" size={48} /></span>
```

- **Règles** : pictogramme monochrome en `currentColor`, la couleur vient de la classe de texte du parent ; deux tailles seulement, 24 px en interface et 48 px sur l'espace agriculteur ; l'absence de glyphe pour un code est une erreur de compilation, ce qui oblige à dessiner le pictogramme avant d'ajouter une culture ; pour colorer une culture sur une carte, utiliser `cropColors` de `tokens.ts`.
- **Accessibilité** : `role="img"` et `aria-label` avec le nom français par défaut.

### 3.24 Monogram

- **Import** : `import { Monogram } from "@/components/brand/monogram";`
- **Propriétés** : `title` (« BAIS » par défaut), `className`.

```tsx
<Monogram className="size-10" />
```

- **Règles** : grille traversée d'une diagonale latérite, deux tons, aucun symbole agricole ; ne pas le recolorer ; le nom de marque définitif relève du Ministère et le composant sera renommé avec lui.
- **Accessibilité** : `role="img"` et `aria-label`.

## 4. Règles produit

### 4.1 Chaque chiffre porte sa source et sa fiabilité

Un indicateur passe par `StatTile` ; un graphique, un tableau ou une carte porte un `SourceCaption` et, lorsque la fiabilité varie d'une ligne à l'autre, une colonne ou une légende `ReliabilityBadge`. La date affichée est celle de la donnée. Sur le tableau de bord ministériel, le survol d'un chiffre ouvre sa provenance, mais celle-ci reste lisible sans survol. Un composant qui affiche un nombre sans provenance est refusé en revue.

### 4.2 Niveaux d'alerte

Les alertes du domaine ont quatre niveaux : `INFO`, `WATCH`, `WARNING`, `CRITICAL`. Ils se traduisent par les variantes de même nom d'`Alert` et de `Badge`, par les couleurs `--info`, `--watch`, `--warning`, `--critical`, et par les classes `text-info`, `text-watch`, `text-warning`, `text-critical`. Le niveau se lit toujours dans le texte (titre ou badge), jamais dans la couleur seule. Une alerte `CRITICAL` peut recevoir une pulsation lente ; c'est la seule animation d'état admise, et elle est neutralisée par `prefers-reduced-motion`.

### 4.3 Niveaux de confiance de l'assistant

Quatre niveaux, `HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT`, rendus exclusivement par `ConfidenceMeter`, toujours avec libellé et explication. Au niveau `INSUFFICIENT`, aucune recommandation n'est affichée et l'interface oriente vers un agent.

### 4.4 Espace agriculteur

Une seule colonne, une action par écran, boutons pleine largeur de 56 px (`h-14 w-full text-base`), corps de texte à 16 px minimum, contraste 7:1, pictogrammes de cultures à 48 px, chiffres en très grand, aucune terminologie administrative. Pas de `Tabs`, pas de `DropdownMenu`, pas de `Tooltip` porteur d'information, pas de `Dialog` de saisie. Aucune animation décorative. Le thème est toujours clair.

### 4.5 Thème sombre

Le thème sombre est réservé à l'espace ministère (centre de contrôle, écran large, mode projection). Les autres espaces restent en thème clair et n'affichent pas `ThemeToggle`. Les composants doivent néanmoins tous rester corrects en thème sombre, ce que la page `/design-system` permet de vérifier en basculant le thème.

### 4.6 Espace agent terrain

Formulaires en étapes avec sauvegarde à chaque champ, actions en bas d'écran (mode « une main », `Sheet` en `side="bottom"`), bandeau réseau permanent (`OfflineBanner`), retour visuel de précision GPS. Tout doit fonctionner hors connexion.

## 5. Comment vérifier

- **Visuellement** : lancer `pnpm dev` et ouvrir `/design-system`. La page présente sept sections (jetons, pictogrammes, boutons, formulaires, fenêtres et menus, alertes et états, données) et permet de basculer le thème pour contrôler le rendu sombre. Toute évolution d'un composant partagé doit y être visible.
- **Tests unitaires** : `pnpm test` exécute le projet Vitest `unit`, qui couvre notamment `Alert`, `StatTile`, `ReliabilityBadge`, `CropGlyph`, `ConfidenceMeter`, `OfflineBanner` et le formulaire de démonstration. Un composant partagé qui contient de la logique (formatage, état, accessibilité conditionnelle) reçoit un test à côté de lui.
- **Tests de bout en bout** : `pnpm test:e2e tests/e2e/design-system.spec.ts` parcourt la page avec Playwright, vérifie la présence des sept sections et les interactions principales.
- **Qualité globale** : `pnpm check` enchaîne le lint (dont les frontières entre couches), la vérification des types et les tests unitaires. Une importation interdite (Prisma depuis une fonctionnalité, React depuis un module) fait échouer cette commande.
