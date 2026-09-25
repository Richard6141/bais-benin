# Rapport d'étape 7 — Tableau de bord de l'État

- Branche : `feature/state-dashboard` (fusionnée dans `develop`)
- Date : 25 septembre 2026
- Périmètre : tableau de bord national du ministère en agrégats uniquement, classements territoriaux, fiche commune, qualité des données, exports et fiche imprimable, version réduite pour l'agent, secret statistique.

## Terminé

- **Vue nationale** (`/pilotage`) : six indicateurs avec provenance et fiabilité (producteurs, exploitations, superficies déclarée et relevée, part vérifiée, production déclarée), production par culture, comparaison de campagnes, carte des communes, alertes en cours, qualité des données en un coup d'œil. Filtres dans l'adresse (campagne, culture, département, statut de vérification), partagés avec la carte.
- **Territoires** (`/pilotage/territoires`) : douze départements puis leurs communes, tableau triable accessible, total « Bénin ».
- **Fiche commune** (`/pilotage/communes/[code]`) : chiffres comparés aux moyennes départementale et nationale, cultures, couverture terrain (agents, visites récentes, dernière synchronisation), météo et alertes de l'étape 6.
- **Qualité des données** (`/pilotage/qualite`) : fraîcheur des statistiques, écarts entre superficies déclarée et relevée, exploitations déclarées non vérifiées par ancienneté, communes sans agent, doublons probables.
- **Exports** : CSV compatible avec un tableur français (BOM, séparateur « ; », virgule décimale), formules neutralisées, colonne de masquage, provenance par ligne, chaque export journalisé ; **fiche imprimable** A4.
- **Agent** : version réduite limitée à ses communes ; la coopérative voit un état vide explicite tant que les exploitations ne sont pas rattachées aux organisations.
- **Secret statistique** : toute case résumant moins de cinq exploitations est masquée (« moins de 5 »), avec masquage secondaire quand un total est affiché ; appliqué dans le module, jamais dans l'interface, y compris pour les exports.
- **Performance** : statistiques précalculées dans deux vues matérialisées rafraîchies sans blocage (après une synchronisation ou au plus tard toutes les heures, par la tâche planifiée), lecture en quelques dizaines de millisecondes sur le registre de démonstration.
- **Documentation** : `docs/modules/tableau-de-bord.md` (indicateurs, définitions, secret statistique et ses limites, performances), `docs/modules/pilotage-parcours-ux.md`.

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Unitaires (masquage des petits effectifs, agrégats et tendances, CSV, décision de rafraîchissement, composants, logique des pages, existant) | `pnpm test` | 485 tests OK (54 fichiers) |
| Intégration (comptes directs contre vues, rafraîchissement après une récolte, périmètre et masquage de l'agent, classement refusé à l'agent, commune hors périmètre, export et audit, rafraîchissements concurrents, existant) | `pnpm test:integration` | 73 tests OK (13 fichiers) |
| Bout en bout desktop et mobile (vue nationale et filtres, territoires et descente vers la commune, qualité, fiche imprimable, export CSV, refus anonyme et agricultrice, version agent, existant) | `pnpm test:e2e` | 97 tests OK, 5 ignorés volontairement (profil desktop ou mobile uniquement), deux exécutions complètes consécutives |
| Build, lint, types | `pnpm build`, `pnpm lint`, `pnpm typecheck` | OK |

## Résultat

OK.

## Captures

- [Vue nationale](captures/etape-7/pilotage-national-desktop.png)
- [Production par culture et comparaison de campagnes](captures/etape-7/pilotage-production-desktop.png)
- [Carte des communes](captures/etape-7/pilotage-carte-desktop.png)
- [Départements classés](captures/etape-7/pilotage-territoires-desktop.png)
- [Communes de la Donga](captures/etape-7/pilotage-communes-donga-desktop.png)
- [Fiche commune (Djougou)](captures/etape-7/pilotage-commune-fiche-desktop.png)
- [Qualité des données](captures/etape-7/pilotage-qualite-desktop.png)
- [Fiche imprimable](captures/etape-7/pilotage-fiche-impression.png)
- [Vue nationale, mobile](captures/etape-7/pilotage-national-mobile.png)
- [Tableau de bord de l'agent](captures/etape-7/agent-tableau-de-bord-desktop.png)
- [Tableau de bord de l'agent, mobile](captures/etape-7/agent-tableau-de-bord-mobile.png)
- [Coopérative (état vide)](captures/etape-7/cooperative-desktop.png)
- [Composants du tableau de bord, mobile](captures/etape-7/design-system-tableau-de-bord-mobile.png)

## Problèmes rencontrés et décisions

- **Superficie relevée par culture** : une parcelle en association compte pour chacune de ses cultures ; cette superficie n'est donc pas additive entre cultures et n'apparaît pas en total.
- **Rendement** : calculé sur la superficie des cultures qui ont une récolte déclarée, jamais sur toute la superficie cultivée ; une production non déclarée s'affiche « non déclarée », jamais 0.
- **Campagne sans récolte** : la campagne ouverte (2026-2027) n'a pas encore de récolte déclarée ; les barres montrent alors la superficie cultivée, et la page le dit.
- **Limites du secret statistique** : le masquage de case ne protège pas entièrement contre des différences entre deux filtres ou deux campagnes ; les pistes (combinaisons de filtres restreintes, arrondi aléatoire pour les exports publics, surveillance des séries de requêtes) sont documentées.
- **Carte MapLibre** : un appel de nettoyage sans identifiant de commune provoquait une erreur signalée en développement, sur la carte publique aussi ; corrigé.
- **Rechargement au retour du réseau** (trouvé pendant la vérification finale) : le composant qui gère le hors-ligne rechargeait par défaut la page à chaque retour du réseau. Sur un réseau rural intermittent, l'agent aurait perdu la saisie en cours de l'écran affiché, et un rechargement pendant un changement de page annulait la page demandée. Désactivé : le retour du réseau relance déjà la synchronisation, sans recharger.
- **Enregistrements concurrents d'une règle** : deux personnes du ministère modifiant la même règle en même temps pouvaient perdre une modification sans le savoir. Chaque enregistrement porte désormais la version modifiée ; si une version plus récente existe, l'enregistrement est refusé avec un message clair.
- **Coopérative** : le registre ne relie pas encore les exploitations aux organisations ; le périmètre de la coopérative est vide et l'écran le dit.

## Reste à faire (suivi)

- Carte statique dans la fiche imprimable (la carte WebGL est masquée à l'impression).
- Rattachement des exploitations aux coopératives.
- Mesures de performance sur un registre de 50 000 exploitations en recette.

## Commits

```
docs(dashboard): specify the national dashboard screens and data rules
feat(database): add materialized statistics views and quality indexes for the dashboard
feat(analytics): add dashboard, ranking and quality services with masking
feat(analytics): export dashboard indicators as masked csv with audit
feat(analytics): refresh dashboard statistics from the scheduled tasks
fix(map): clear commune feature state with an explicit feature id
feat(ui): add bar list, campaign comparison, sortable table and print layout
feat(dashboard): build the national dashboard, territories, commune and quality pages
test(dashboard): cover dashboard pages, ranking, quality, print and csv export
docs(dashboard): document the dashboard module, indicators and statistical secrecy
feat(dashboard): add the agent dashboard and the cooperative empty state
feat(design-system): showcase dashboard components
test(dashboard): cover the agent and cooperative dashboards and showcase
test(dashboard): reuse the ministry session and keep rule tests repeatable
fix(monitoring): reject rule edits made on an outdated version
fix(pwa): stop reloading the page each time the network comes back
docs(dashboard): add the step 7 report and screenshots
```

## Prochaine étape

Étape 8 — Assistant agricole : réponses courtes fondées sur un corpus de fiches techniques citées, niveau de confiance affiché, refus explicite sous le seuil, modèle interchangeable par configuration. Branche `feature/ai-assistant`, déjà en cours en parallèle.

## Guide de test

```bash
git checkout develop && pnpm install
pnpm db:migrate && pnpm db:seed
pnpm build && pnpm start
```

1. **Ministère** : connexion institutionnelle `ministere@bais.demo`, mot de passe `Demo-Bais-2026!`, double authentification. `/pilotage` : les six indicateurs, la production par culture, la carte ; choisissez « Maïs » et « Donga » : toute la page suit, l'adresse aussi.
2. **Territoires** : triez par superficie, ouvrez « Donga », puis « Djougou » : fiche commune avec comparaisons, couverture terrain, météo et alertes.
3. **Qualité** : fraîcheur des statistiques, écarts, exploitations anciennes non vérifiées.
4. **Exports** : « Exporter (CSV) » s'ouvre dans un tableur avec les accents et les décimales à la française ; les petites cases sont vides avec la mention de masquage. « Fiche imprimable » : aperçu A4.
5. **Agent** (`01 90 00 00 01`, code `246810`) : tableau de bord de sa commune seulement.
