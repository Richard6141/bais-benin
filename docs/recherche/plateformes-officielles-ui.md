# Interfaces des plateformes officielles béninoises : typographie, couleurs, composants

- Date de consultation : 24 septembre 2026, depuis Cotonou (réseau fixe).
- Méthode : lecture du HTML servi et des feuilles de style liées de chaque portail (déclarations `font-family`, `@font-face`, tailles, couleurs hexadécimales les plus fréquentes, règles des boutons). Aucune capture d'écran ni mesure sur appareil : l'appréciation de la lisibilité mobile repose sur les tailles et les graisses déclarées.
- Objet : choisir pour BAIS des polices « bien pensées et lisibles », libres de droits, cohérentes avec ce que l'État béninois publie, et fixer les éléments d'identité institutionnelle à reprendre ou à éviter.

## 1. Relevé site par site

| Portail | URL | État | Polices déclarées | Taille de base | Palette dominante | Boutons, formulaires | Éléments institutionnels |
|---|---|---|---|---|---|---|---|
| Portail national des services publics | https://service-public.bj/ | Accessible. Application Angular (titre « Citizen Portal », `lang="en"` alors que le contenu est en français). | Pile système Bootstrap 4 : `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif` ; `Montserrat, sans-serif` sur quelques titres ; police d'icônes maison `bji` et Material Design Icons. Aucune police de texte auto-hébergée. | `1rem` (16 px) ; classes fréquentes à `.875rem` (14 px) et `12px`. | Bleu marine `#0a3764` (`--primary`, `.btn-primary`), orange `#f0a945`, vert `#287d3c`, rouge `#da1414`, gris Bootstrap `#212529`, `#6c757d`, `#dee2e6`. | Boutons Bootstrap 4, rayon `.25rem`, aplat marine, texte blanc. Formulaires Bootstrap standard. Intégration des passerelles de paiement KKiaPay, FedaPay, TrésorPay, BjPay. | Pas de bandeau tricolore, pas d'armoiries dans le HTML. Identité portée par le bleu marine et l'orange. |
| Gouvernement | https://www.gouv.bj/ | Accessible. Gabarit maison « os-style » partagé avec sgg.gouv.bj et asin.bj. | `var(--font-name), montserrat, sans-serif, calibri, arial, tahoma, verdana` ; la variable `--font-name` n'est pas définie dans les feuilles servies, donc Montserrat s'applique si installée, sinon la police système. Aucun `@font-face`, aucun appel à Google Fonts : la police n'est pas embarquée. | `14px` déclaré, titres en `em` (1,1 à 1,7). | Bleu `#023e79`, gris clair `#efefef`, accents réseaux sociaux ; 17 dégradés `linear-gradient` (fonds de sections et survols). | Boutons carrés (`border-radius: 0`) avec voile sombre au survol. | Armoiries en image (`/images/armoiries.jpg`) et pages « Les armoiries », « Le drapeau » ; pied de page « © Présidence de la République du Bénin ». Pas de bandeau tricolore comme composant. |
| Présidence | https://presidence.bj/ | Accessible (Symfony, `lang="fr"`). | Auto-hébergées : **Avenir** (graisses 300 à 900, police propriétaire), **Montserrat** (300 à 700), **Baskervville** (serif, titres éditoriaux). Icônes Font Awesome 5. | Non déclarée sur `body` ; titres `1.875rem` et `2.25rem`. | Bleus `#0073bb`, `#00578d`, `#1d4a89`, gris `#303030`, `#d0d0d0` ; vert `#11845a` et rouge `#e3321d` dans le HTML (éléments du drapeau) ; 6 dégradés. | Rayons `3px` et `10px`. | Pied de page institutionnel, couleurs du drapeau utilisées avec parcimonie. |
| Ministère de l'Économie et des Finances | https://www.finances.bj/ | **Inaccessible** : redirection vers une page « Account Suspended » de l'hébergeur (PlanetHoster). | — | — | — | — | — |
| Direction générale des Impôts | https://impots.bj/ | **Inaccessible** : même page « Account Suspended ». | — | — | — | — | — |
| ANIP, site institutionnel | https://anip.bj/ | Accessible (WordPress, `lang="fr-FR"`). | Google Fonts : **Signika** (100 à 700) et **Montserrat** (100 à 700), plus Roboto 400/500 ; `'Montserrat', sans-serif` en règle inline dominante. | `16px` sur le corps, `12px` sur les mentions, titres 20 à 26 px. | Jaune-orangé `#efb412`, `#ffb236`, vert `#008d68`, rose `#ff5062`, gris `#6c757d`. | Boutons WordPress, rayon `4px`. | Logo ANIP en SVG ; mention des armoiries dans le HTML ; pied de page avec liens Présidence, Ministère du Numérique, ANSSI ; numéro vert 7054, WhatsApp, courriel. |
| ANIP, e-services | https://eservices.anip.bj/ | Accessible (Nuxt, Bootstrap 5, `lang="fr"`). | Auto-hébergée : **GothamPro** (100 à 900, italiques comprises ; police propriétaire de Hoefler & Co), repli `"Montserrat", sans-serif`, puis pile système. | `var(--bs-body-font-size)` (1 rem par défaut) ; classes fréquentes `.875rem` et `14px`. | Marine `#0a3764` (`--bs-primary`), bleu `#2098d1`, orange `#f0a945`, gris `#e1e1e1`, `#2c3e50`. | `.btn-primary` marine `#0a3764`, survol `#092f55` ; rayons Bootstrap (`--bs-border-radius-lg`). 391 occurrences de `linear-gradient`, pour l'essentiel héritées de Bootstrap et d'un sélecteur de dates. | Même bleu marine et même orange que service-public.bj : c'est la palette de fait des téléservices de l'État. |
| Portail du Numérique (numerique.gouv.bj) | https://numerique.gouv.bj/ redirige (301) vers https://innovation.gouv.bj/ | Accessible (`lang="fr"`, Bootstrap 4). | Auto-hébergée : **GothamPro** (toutes graisses), `body { font-family: "GothamPro", sans-serif; font-size: 0.9rem; font-weight: 350 }`. Icônes Font Awesome 5 Pro. | `0.9rem` (14,4 px) et graisse 350 : texte fin et petit. | Marine `#093e73` (`.btn-primary`), bleu `#2098d1`, jaune `#ffd400`, gris Bootstrap ; 18 dégradés. | Boutons carrés (`border-radius: 0`, 35 occurrences), aplat marine, survol `#062b50`. | Pas de bandeau tricolore ni d'armoiries dans le HTML. |
| ASIN | https://asin.bj/ | Accessible. Même gabarit « os-style » que gouv.bj. | `var(--font-name), montserrat, sans-serif…` et une variante `aquawax, montserrat, …` (Aquawax : police propriétaire, non embarquée). | `14px`. | Bleus `#1f4878`, `#1a588f`, `#023e79`, gris `#efefef`. | Identiques à gouv.bj. | Pied de page « © Agence des Systèmes d'Information et du Numérique - 2023 », liens Gouvernement, ARCEP, APDP. |
| Secrétariat général du Gouvernement | https://sgg.gouv.bj/ | Accessible. Gabarit « os-style ». | Comme gouv.bj (Montserrat non embarquée). | `14px`. | Comme gouv.bj. | Formulaire de recherche documentaire (type, dates, mots clés). | Armoiries en image, pied de page « © Présidence de la République du Bénin - 2026 ». |
| Ministère de l'Agriculture, de l'Élevage et de la Pêche | https://agriculture.gouv.bj/ | Accessible (Bootstrap 5, `lang="fr"`). | Google Fonts : **Montserrat** chargée en graisse 100 seulement (`css2?family=Montserrat:wght@100`), puis `"Montserrat", sans-serif !important` : le navigateur synthétise les autres graisses. | `1rem` ; nombreuses classes à `14px`, `13px`, `11px`. | Palette Bootstrap 5 par défaut (`#0d6efd`, `#198754`, `#dc3545`, `#ffc107`) : aucune couleur propre au ministère dans les feuilles. | Boutons Bootstrap, rayons `.25rem` et `2px`. | Pas de bandeau tricolore ni d'armoiries dans le HTML. |
| Ministère de la Santé | https://sante.gouv.bj/ | Accessible (Bootstrap 5, gabarit « marina », `lang="fr"`). | Google Fonts : **Montserrat**, toutes graisses et italiques (18 fichiers demandés). Icônes Font Awesome 5 et 6, Flaticon. | `var(--bs-body-font-size)` ; classes fréquentes `.875em`, `14px`, `13px`, `12px`. | Palette Bootstrap 5 plus le **vert du drapeau `#008751`** (6 occurrences). | Boutons Bootstrap, rayon `4px`. | Logo ministère blanc sur fond sombre, pied de page avec adresse postale et mentions légales. |

Synthèse des observations :

- **Montserrat est la police de fait de l'État béninois** : déclarée sur sept portails sur neuf accessibles, en titre ou en corps. Deux téléservices récents (innovation.gouv.bj, eservices.anip.bj) sont passés à **GothamPro**, police propriétaire dont Montserrat est le repli déclaré. La Présidence ajoute Avenir (propriétaire) et Baskervville (serif libre) pour l'éditorial.
- **Aucun portail n'a de police dédiée aux chiffres** ni de chiffres tabulaires ; les tableaux de service-public.bj et de sgg.gouv.bj alignent les nombres à droite avec la police du corps.
- **Les tailles de base sont petites** : 14 px (gabarit gouv.bj, ASIN, SGG), 14,4 px en graisse 350 (innovation.gouv.bj), 16 px seulement sur service-public.bj et anip.bj. Sur un Android d'entrée de gamme, 14 px en Montserrat fine passe sous le seuil de confort.
- **La palette commune des téléservices est le bleu marine `#0a3764` avec un orange `#f0a945`** (service-public.bj, eservices.anip.bj), variante `#093e73` sur innovation.gouv.bj et `#023e79` sur le gabarit gouv.bj. Les couleurs du drapeau (`#008751`, `#fcd116`, `#e8112d`) apparaissent peu : vert sur sante.gouv.bj, vert et rouge sur presidence.bj, jamais en bandeau tricolore.
- **Composants récurrents** : boutons en aplat uni à angles droits ou faiblement arrondis (0 à 4 px), formulaires Bootstrap sans fioriture, pied de page « © Présidence de la République du Bénin » avec mentions légales, armoiries en image sur les sites de la Présidence et du SGG. Les dégradés sont présents sur les gabarits éditoriaux (fonds de sections), absents des boutons des téléservices.
- **Chargement** : anip.bj, agriculture.gouv.bj et sante.gouv.bj appellent Google Fonts à chaque visite ; innovation.gouv.bj et eservices.anip.bj auto-hébergent GothamPro en dix-huit fichiers ; le gabarit gouv.bj ne charge aucune police et s'appuie sur ce qui est installé.

## 2. Recommandation pour BAIS

### 2.1 Polices

Contraintes : licence libre (SIL Open Font License), rendu net sur Android bas de gamme en 2G ou 3G (donc peu de fichiers, chargement auto-hébergé), parenté visible avec les portails de l'État, chiffres lisibles dans les tableaux, les tuiles et les cartes.

| Rôle | Police | Licence | Justification |
|---|---|---|---|
| Titres, marque, navigation | **Montserrat** (graisses 600 et 700 seulement) | OFL 1.1 | C'est la police commune des portails béninois : elle rattache BAIS à la famille gouv.bj sans reprendre une charte protégée. Réservée aux titres, sa largeur ne pénalise pas la densité. |
| Texte d'interface, formulaires, corps | **Inter** (graisses 400, 500, 600) | OFL 1.1 | Déjà en place dans le projet. Hauteur d'x élevée, chasse étroite, formes ouvertes : lisible à 14 px là où Montserrat exige 16 px. C'est aussi la police de repli la plus proche de GothamPro, retenue par les deux téléservices les plus récents de l'État. |
| Chiffres (tuiles, tableaux, cartes, graphiques) | **Inter** avec `font-variant-numeric: tabular-nums` et jeu stylistique `cv11` (chiffre 1 à empattement) | — | Pas de police supplémentaire à charger : Inter porte des chiffres tabulaires et des variantes qui distinguent 1, l et I, ce qu'aucun portail officiel ne fait aujourd'hui. |
| Codes, identifiants, coordonnées | **JetBrains Mono** (graisse 400) | OFL 1.1 | Déjà en place ; sert aux codes `BJ-DON-002`, aux coordonnées GPS et aux extraits techniques. |

Solutions écartées :

- **GothamPro et Avenir** : propriétaires, licence web payante, redistribution interdite ; leur emploi par innovation.gouv.bj et presidence.bj ne crée aucun droit pour BAIS.
- **Montserrat en corps de texte** : chasse large, hauteur d'x moyenne, graisses fines mal rendues sur écrans à faible densité ; les portails qui l'utilisent en corps compensent mal (innovation.gouv.bj en 14,4 px graisse 350).
- **Signika** (anip.bj) : bonne lisibilité mais une seule fonderie, peu de graisses utiles, aucun autre portail ne l'emploie.
- **Public Sans, Source Sans 3, Noto Sans** : alternatives libres honorables ; Inter les vaut en lisibilité et est déjà intégrée, changer n'apporterait rien.

### 2.2 Éléments d'identité institutionnelle à reprendre

- **Pied de page institutionnel** sur chaque page publique : nom complet de la plateforme, ministère de rattachement (MAEP), mention « République du Bénin », liens « Mentions légales », « Politique de confidentialité », « Accessibilité », année. C'est le seul composant présent sur tous les portails accessibles.
- **Une couleur d'autorité unique** en aplat pour l'action principale, comme le marine `#0a3764` des téléservices. BAIS garde son golfe `#0f4c5c` (proche en valeur, distinct en teinte) : même logique de bouton plein à texte clair, sans dégradé.
- **Le vert du drapeau `#008751` comme couleur de validation** (usage de sante.gouv.bj) plutôt que comme couleur de marque : BAIS peut aligner `--success` sur cette valeur si le contraste tient (voir 3).
- **Rayons faibles** (4 px) sur les boutons et champs, dans l'esprit des téléservices, plutôt que des formes très arrondies.
- **Armoiries** : à n'utiliser que si le MAEP fournit le fichier officiel et l'autorise ; ne pas reproduire une image récupérée sur gouv.bj. En attendant, le monogramme BAIS et la mention textuelle « République du Bénin » suffisent.

### 2.3 Ce qu'il faut éviter

- Le **bandeau tricolore** vert-jaune-rouge en en-tête : aucun portail ne l'emploie, et il entre en conflit avec les couleurs sémantiques d'alerte (vert, jaune, rouge) que BAIS utilise pour la vigilance et le risque.
- Les **dégradés de fond** des gabarits éditoriaux (gouv.bj, innovation.gouv.bj) : consigne du projet, et lisibilité en plein soleil.
- Les **corps de 12 à 14 px** en police fine, généralisés sur les portails : base à 16 px sur mobile, 14 px minimum pour le texte secondaire, 13 px pour les légendes.
- Le **chargement de Google Fonts à la volée** et les familles complètes (18 fichiers sur sante.gouv.bj) : auto-héberger via `next/font`, trois graisses par famille au plus.
- **Plusieurs polices d'icônes** (Font Awesome 5 et 6, Flaticon, icônes maison sur le même site) : Lucide seule, en SVG.
- Le `lang="en"` de service-public.bj : `lang="fr"` partout, les lecteurs d'écran prononcent sinon le français avec les règles anglaises.

## 3. Proposition concrète pour `src/styles` et `src/app/layout.tsx`

Sans modification du code dans cette note ; à appliquer par la session qui tient la branche.

1. **`src/app/layout.tsx`** : ajouter Montserrat à côté d'Inter et JetBrains Mono, en limitant les graisses.

   ```ts
   import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";

   const inter = Inter({
     variable: "--font-inter",
     subsets: ["latin", "latin-ext"],
     weight: ["400", "500", "600"],
     display: "swap",
   });

   const montserrat = Montserrat({
     variable: "--font-montserrat",
     subsets: ["latin", "latin-ext"],
     weight: ["600", "700"],
     display: "swap",
   });
   ```

   et ajouter `montserrat.variable` à la classe de `<html lang="fr">`.

2. **`src/app/globals.css`**, bloc `@theme inline` : déclarer la famille de titres et les tailles.

   ```css
   --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
   --font-heading: var(--font-montserrat), var(--font-inter), ui-sans-serif, sans-serif;
   --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;

   /* Échelle typographique : 16 px de base, 14 px secondaire, 13 px légende (jamais 12). */
   --text-xs: 0.8125rem;
   --text-xs--line-height: 1.25rem;
   --text-sm: 0.875rem;
   --text-sm--line-height: 1.375rem;
   --text-base: 1rem;
   --text-base--line-height: 1.5rem;
   ```

   et dans `@layer base` :

   ```css
   h1, h2, h3, h4 {
     font-family: var(--font-heading);
     font-weight: 600;
     letter-spacing: -0.01em;
   }
   .tabular {
     font-variant-numeric: tabular-nums;
     font-feature-settings: "cv11", "ss01", "tnum";
   }
   ```

   Les composants `PageHeader`, `CardTitle`, `DialogTitle`, `SheetTitle`, `AlertTitle` et `DemoSection` prennent alors Montserrat sans changement de classe ; le corps, les boutons, les badges et les formulaires restent en Inter.

3. **`src/styles/tokens.css`** : aucune nouvelle variable de police ; ajouter seulement un commentaire de provenance à côté de `--success` si la valeur est alignée sur le vert du drapeau.

   ```css
   /* Vert du drapeau (#008751) : 4,6:1 sur blanc, insuffisant sur --chalk (4,1:1). */
   /* --success reste #1f5a3c en thème clair ; #008751 réservé aux aplats (jauge, pastilles). */
   ```

   Contrastes vérifiés : `#008751` sur `#ffffff` donne 4,6:1 (texte AA sur carte), sur `#f6f3ee` 4,1:1 (échec pour du texte). Le vert du drapeau convient donc aux éléments graphiques, pas au texte sur le fond de page.

4. **Graisses** : Inter 400 pour le corps, 500 pour les libellés et boutons, 600 pour les valeurs mises en avant ; Montserrat 600 pour les titres courants, 700 pour le titre de page et la marque. Aucune graisse inférieure à 400 (les 300 et 350 des portails sont la première cause de leur faible lisibilité mobile).

5. **Poids de chargement** : Inter en trois graisses et Montserrat en deux, sous-ensemble latin étendu, soit cinq fichiers WOFF2 d'environ 25 à 35 ko chacun, servis depuis l'origine avec `display: swap`. C'est inférieur au seul GothamPro d'innovation.gouv.bj.

## 4. Sources

Toutes consultées le 24 septembre 2026.

- https://service-public.bj/ et https://service-public.bj/styles.ebcb9fc8d2b65201bc46.css
- https://www.gouv.bj/ , https://www.gouv.bj/css/os-style.css , https://www.gouv.bj/css/style.css
- https://presidence.bj/ et https://presidence.bj/build/app.fac6f699.css
- https://www.finances.bj/ (page « Account Suspended »)
- https://impots.bj/ (page « Account Suspended »)
- https://anip.bj/
- https://eservices.anip.bj/ et https://eservices.anip.bj/_nuxt/entry.BHh6KhxI.css
- https://numerique.gouv.bj/ (redirection 301 vers https://innovation.gouv.bj/) et https://innovation.gouv.bj/css/site.css
- https://asin.bj/ , https://asin.bj/css/os-style.css , https://asin.bj/css/style.css
- https://sgg.gouv.bj/ et ses feuilles `os-style.css`, `style.css`, `m-style.css`
- https://agriculture.gouv.bj/ et ses feuilles `bootstrap.min.css`, `style2.css`, `responsive2.css`
- https://sante.gouv.bj/ et ses feuilles sous `/marina/css/`
- Licences : Montserrat, Inter et JetBrains Mono sont publiées sous SIL Open Font License 1.1 (https://openfontlicense.org/) ; GothamPro (Hoefler & Co) et Avenir (Linotype / Monotype) sont des polices commerciales.
