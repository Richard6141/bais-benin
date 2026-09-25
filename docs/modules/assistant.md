# Assistant agricole

Ce document décrit l'assistant livré à l'étape 8 : ce qu'il répond et à qui, comment une réponse est construite et vérifiée, comment le configurer sans nommer de fournisseur, comment faire vivre le corpus, et ce qu'il ne sait pas encore faire. La spécification écran par écran est dans `docs/modules/assistant-parcours-ux.md` ; les écrans sont construits séparément sur l'API décrite ici.

## Ce que fait l'assistant

- **Producteur** : répond à une question agricole en trois phrases au plus, avec un conseil pratique, les fiches citées (organisme, titre, adresse, licence, date de vérification) et une confiance dite en mots (« Réponse sûre », « À confirmer avec votre agent »). Les faits de son contexte (cultures de la campagne, alertes en cours et pluie de sa commune) s'affichent avec leur source. Il peut transmettre la question à son agent.
- **Agent** : même assistant, avec le contexte d'une exploitation de son périmètre (jamais les coordonnées du producteur) ; liste des demandes transmises par les producteurs de ses communes.
- **Ministère** : le modèle choisit un indicateur dans une liste fermée ; les chiffres viennent du registre et du monitoring, tels quels, avec leur source. Le modèle n'écrit aucun chiffre du registre.
- **Journal** : chaque question et son issue sont enregistrées sans auteur visible (rôle, commune, date) ; purge à 12 mois.

L'assistant ne répond pas quand il ne sait pas : sous le seuil de confiance, il affiche « Je ne dispose pas d'une information fiable sur ce point » et oriente vers l'agent. Il refuse les questions hors agriculture et toute dose de produit qui ne figure pas mot pour mot dans une fiche citée.

## Chaîne d'une réponse

| Étape | Emplacement | Rôle |
|---|---|---|
| Contrôles d'entrée | `src/modules/assistant/ask.ts` | droit `assistant.ask`, 500 caractères, 20 questions par heure et par utilisateur |
| Contexte | `src/modules/assistant/context.ts` | producteur : ses exploitations ; agent : l'exploitation choisie si elle est dans son périmètre (sinon « introuvable ») ; ministère : aucun contexte individuel |
| Recherche | `src/modules/assistant/retrieve.ts`, `src/database/sql/assistant.sql.ts` | plongement de la question, 8 plus proches extraits dans pgvector (index HNSW, cosinus), pertinence minimale 0,2, léger avantage aux fiches des cultures de l'utilisateur |
| Modèle | `src/services/ports/llm-provider.ts` | consignes fixes (`prompt.ts`), question délimitée et chevrons neutralisés, extraits et faits passés comme données, sortie structurée (réponse, conseil, citations, auto-évaluation, indicateur) |
| Contrôles serveur | `src/modules/assistant/guardrails.ts` | voir ci-dessous ; indépendants du modèle |
| Indicateurs du ministère | `src/modules/assistant/indicators.ts` | liste fermée ; chiffres lus dans les modules, masqués sous 5 exploitations |
| Journal | `assistant_conversation`, `assistant_message` | issue, confiance, citations, référence du modèle, durée |

### Contrôles serveur

1. **Citations** : une citation n'est gardée que si elle désigne un extrait effectivement retrouvé et que son texte figure dans cet extrait (à la casse, aux accents et aux espaces près). Sans citation valide, pas de réponse.
2. **Couverture** : part des phrases de la réponse et du conseil dont les mots se retrouvent dans un extrait cité (ou dans un fait du contexte).
3. **Doses** : toute quantité par surface ou par volume, concentration ou délai avant récolte présente dans la réponse doit figurer dans un extrait cité ; sinon l'issue est « dose sans source » et la réponse n'est pas affichée.
4. **Confiance** : 0,5 × pertinence moyenne des extraits cités + 0,3 × couverture + 0,2 × auto-évaluation du modèle. Au moins 0,8 : « Réponse sûre » ; au moins le seuil (0,6 par défaut) : « À confirmer avec votre agent » ; en dessous : message de non-fiabilité, sans sources.

Ces contrôles s'appliquent quoi que rende le modèle : une consigne glissée dans une question ou dans un extrait ne peut ni faire accepter une citation inventée, ni faire passer une dose, ni afficher un chiffre du registre.

### Issues enregistrées

| Issue | Affichage |
|---|---|
| `ANSWERED` | réponse, conseil, sources, confiance |
| `LOW_CONFIDENCE` | « Je ne dispose pas d'une information fiable… », orientation vers l'agent |
| `OFF_TOPIC` | ce que l'assistant sait faire |
| `UNSAFE_DOSAGE` | « Je ne peux pas vous donner de dose sans source fiable… » |
| `PROVIDER_ERROR` | « L'assistant ne répond pas pour l'instant… », la question reste saisie |

## Configuration

Aucun fournisseur ni modèle n'est nommé dans le code ni dans cette documentation. Sans configuration, l'assistant fonctionne avec l'adaptateur de démonstration.

| Variable | Rôle |
|---|---|
| `ASSISTANT_LLM_MODEL` | identifiant du modèle de langage, transmis tel quel au SDK d'IA ; absent : modèle de démonstration (extractif, sans réseau) |
| `ASSISTANT_EMBEDDING_MODEL` | identifiant du modèle de plongement ; absent : plongements de démonstration |
| `ASSISTANT_LLM_BASE_URL`, `ASSISTANT_LLM_API_KEY` | point d'accès compatible OpenAI (modèle hébergé sur une infrastructure nationale, par exemple) ; sans adresse, l'identifiant est confié au fournisseur global du SDK, qui lit lui-même ses identifiants d'accès dans l'environnement |
| `ASSISTANT_EMBEDDING_DIMENSIONS` | 1024, dimension de la colonne en base (vérifiée au démarrage) |
| `ASSISTANT_CONFIDENCE_THRESHOLD` | seuil de réponse, 0,6 par défaut |
| `ASSISTANT_TIMEOUT_MS` | délai maximal d'un appel au modèle, 20 000 ms par défaut |

Adaptateurs : `src/services/assistant/sdk.ts` (paquet `ai` 7, `generateText` avec `Output.object`, `embedMany`), `src/services/assistant/fixture-*.ts` (démonstration). Le modèle de démonstration recopie les premières phrases de l'extrait le plus pertinent et sa première consigne : il ne rédige rien, et l'interface affiche « démonstration ».

Changer de modèle de plongement : chaque extrait enregistre le modèle qui l'a produit et la recherche ignore ceux d'un autre modèle ; relancer le seed (`pnpm db:seed`) recalcule les plongements. Une dimension différente de 1024 demande une migration de la colonne `assistant_chunk.embedding` et de son index.

## Corpus

- Fiches Markdown dans `src/database/seed/assistant/corpus/`, précédées d'un en-tête JSON : slug, titre, cultures, thèmes, catégories d'alerte liées, source (organisme, titre, adresse, licence, date de parution, date de vérification), mention démonstration.
- 23 fiches de démonstration : maïs (semis et fertilisation, striga, chenille légionnaire), manioc, igname, riz (bas-fond, repiquage, post-récolte au Bénin), niébé, soja, anacarde, coton, tomate, piment, gombo, mouches des fruits, séchage et aflatoxine, arachide, poches de sécheresse, excès d'eau. Rédigées par l'équipe à partir des seuls passages lus dans la source ; chaque adresse et chaque licence ont été vérifiées en ligne le 25 septembre 2026 et sont recopiées telles qu'affichées sur le document.
- Aucune dose de pesticide n'est reprise ; les doses d'engrais et de semences citées sont celles de la source, qui n'est pas toujours béninoise (Nigeria, Ghana, Côte d'Ivoire) : chaque fiche le dit et renvoie à l'agent.
- Découpage par section « ## », 2 200 caractères au plus par extrait, un paragraphe de recouvrement ; chargement idempotent (empreinte du contenu et modèle de plongement) ; une fiche retirée du dossier est archivée, jamais citée ensuite.
- Ajouter une fiche : écrire le fichier, vérifier l'adresse et la licence sur le document, relancer le seed, compléter les questions de `tests/integration/assistant-corpus.test.ts`.

## API

| Route | Rôle | Droit |
|---|---|---|
| `POST /api/v1/assistant/ask` | `{ question, farmCode?, conversationId? }` → réponse ou refus motivé | `assistant.ask` (producteur, agent, ministère ; coopérative sur son propre compte) |
| `POST /api/v1/assistant/feedback` | `{ messageId, useful, reason?, comment? }`, un retour par réponse | auteur de la question |
| `GET /api/v1/assistant/conversations` | 5 dernières questions de l'utilisateur | authentifié |
| `POST /api/v1/assistant/agent-requests` | « Demander à mon agent » | auteur de la question |
| `GET /api/v1/assistant/agent-requests`, `PATCH …/[id]` | demandes des communes de l'agent, marquer traitée | `assistant.journal.read` |
| `GET /api/v1/assistant/journal` | journal sans auteur, filtre par issue | `assistant.journal.read` (ministère : tout ; agent : ses communes), lecture journalisée |
| `GET` ou `POST /api/v1/assistant/maintenance` | purge des conversations de plus de 12 mois | `Authorization: Bearer <CRON_SECRET>` ; planifiée chaque jour (`vercel.json`, `docker/scheduler/crontab`) |

## Limites connues

- Corpus de démonstration : fiches rédigées par l'équipe, non encore relues par un agronome (INRAB, ATDA) ; plusieurs sources viennent de pays voisins. Les licences ouvertes explicites sont rares (CABI Plantwise CC-BY-SA 4.0, ASHC CC BY 3.0, TechnoServe CC BY-NC-ND 4.0) ; pour les autres, la fiche est une synthèse qui cite la source, sans en reproduire le texte.
- Sujets faibles : coton (source de 2005), drainage des champs de plateau, aflatoxine en Afrique de l'Ouest ; aucune fiche ATDA ni calendrier agricole officiel trouvé en ligne.
- Plongements de démonstration lexicaux : ils retrouvent une fiche qui emploie les mots de la question, pas une reformulation lointaine ; un vrai modèle de plongement est nécessaire en production.
- Indicateurs du ministère : vue nationale et alertes branchées ; production par culture, classement et qualité seront branchés sur les services du tableau de bord (étape 7).
- Texte en français seulement ; lecture audio par la synthèse vocale du navigateur, prévue dans les écrans.

## Vérifier

```bash
pnpm test -- src/services/assistant src/modules/assistant src/lib/text
pnpm test:integration -- tests/integration/assistant*.test.ts   # recherche, citations, refus, injection, périmètre, journal, corpus
```
