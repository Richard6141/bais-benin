# Monitoring agricole et alertes

Ce document décrit le monitoring livré à l'étape 6 : ce que voient les utilisateurs, comment la météo devient une alerte, comment l'alerte atteint le producteur, et comment exploiter le module. Les parcours écran par écran sont dans `docs/modules/monitoring-parcours-ux.md` ; la décision d'architecture dans l'ADR-0011.

## Ce que voient les utilisateurs

- **Producteur** (`/agriculteur/alertes`, `/agriculteur/meteo`) : alertes de la commune de ses exploitations, conseil pratique en premier, explication du déclenchement en phrases simples, bouton « J'ai compris » ; météo de sa commune (3 jours observés, 7 jours prévus, pluie sur 30 jours). Un encart « Alertes » sur l'accueil signale les alertes non lues.
- **Agent** (`/agent/alertes`) : alertes de ses communes, triées par gravité ; sur chaque fiche, les exploitations concernées avec l'état des messages (envoyé, remis, lu, échec) et les producteurs à prévenir de vive voix, avec un relais enregistré même sans réseau.
- **Ministère** (`/pilotage/alertes`, `/pilotage/regles`) : centre d'alertes national (chiffres clés, carte des communes par gravité, liste filtrable, fraîcheur des données), fiche d'audit (règle et version, indicateurs lus, diffusion), gestion des règles (activation, nouvelle version, simulation sur 30 jours).

## Chaîne de traitement

| Étape | Emplacement | Rôle |
|---|---|---|
| Météo | `src/services/ports/weather-provider.ts`, `src/services/weather/{open-meteo,fixture-provider}.ts` | Open-Meteo par centroïde communal (77 communes, deux requêtes), fixture synthétique en repli |
| Ingestion | `src/modules/monitoring/ingestion.ts`, `src/database/sql/weather.sql.ts` | 35 jours observés et 8 jours de prévision, écriture idempotente, trois tentatives puis repli, journal `ingestion_run` |
| Indicateurs et règles | `src/modules/monitoring/rules/*` | 18 indicateurs (cumuls, jours secs, bilan hydrique, températures, prévisions, cultures et stades), langage `all` / `any` / `not` validé par Zod, trace d'évaluation |
| Évaluation | `src/modules/monitoring/evaluation.ts` | chaque règle active sur chaque commune, à la date du dernier jour observé ; une alerte active par catégorie et par commune ; refroidissement ; aucune alerte sur des données de plus de 48 h |
| Diffusion | `src/modules/monitoring/delivery/*` | destinataires (in-app, WhatsApp avec consentement, SMS, relais agent), silence de 21 h à 6 h sauf alerte critique, repli et relance, accusés de lecture |
| Lecture | `src/modules/monitoring/{alerts,weather}.ts` | alertes par périmètre, fiche, synthèse nationale, sévérité par commune, météo d'une commune |
| Gouvernance | `src/modules/monitoring/rule-admin/*` | versions de règles, activation motivée, simulation sans diffusion |

## Tâches planifiées

| Tâche | Route | Fréquence | Effet |
|---|---|---|---|
| Quotidienne | `POST /api/v1/monitoring/ingest` | 5 h, heure de Porto-Novo (4 h UTC) | ingestion, évaluation, destinataires des nouvelles alertes, premier envoi |
| Envoi | `POST /api/v1/monitoring/dispatch` | toutes les 10 minutes | messages en attente, relances, fin du silence nocturne |

Les deux routes exigent `Authorization: Bearer <CRON_SECRET>` (32 caractères au moins, obligatoire en production) ; sans secret configuré elles restent fermées. Avec Docker Compose, le service `scheduler` (profil `full`) les appelle ; sans Docker, l'équivalent crontab est documenté dans `docker/scheduler`.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<hôte>/api/v1/monitoring/ingest
```

## Données de démonstration

- Le seed charge les six règles par défaut, ingère la météo réelle (ou la fixture sans réseau) et évalue les règles. `SEED_WEATHER=0` saute l'ingestion.
- Hors production, cinq épisodes plausibles sont rejoués sur des séries synthétiques et évalués par le vrai moteur (poche sèche à Djougou, crue à Adjohoun, chaleur à Malanville, fortes pluies annoncées à Savalou, chenille légionnaire à Bohicon). Ces alertes portent la source « Données de démonstration », la fiabilité `SYNTHETIC`, et ne partent jamais par message.
- Des consentements WhatsApp et SMS sont attribués de façon déterministe à une partie des producteurs synthétiques.

## Sécurité et confidentialité

- Lecture des alertes filtrée par périmètre en base : ministère sur tout le territoire, agent sur ses communes, producteur sur les communes de ses exploitations ; une fiche hors périmètre répond 404. Le détail de diffusion n'est jamais montré au producteur.
- Les téléphones des producteurs ne sont visibles qu'aux rôles qui ont le droit `farmer.contact.read`.
- Aucun message sans consentement enregistré (`channel_consent`) ; la référence du consentement accompagne chaque envoi à wapy.pro.
- Le webhook wapy.pro est authentifié par signature HMAC comparée en temps constant.
- Chaque levée, modification ou activation de règle, levée d'alerte, accusé et relais est journalisé.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `WEATHER_PROVIDER` | `open-meteo` (défaut) ou `fixture` |
| `OPEN_METEO_BASE_URL` | point d'accès Open-Meteo (auto-hébergeable) |
| `CRON_SECRET` | secret des tâches planifiées |
| `MESSAGING_PRIMARY_CHANNEL`, `WAPY_API_KEY`, `WAPY_WEBHOOK_SECRET` | canal WhatsApp et webhook de wapy.pro |

## Limites connues

- Seuils indicatifs, à valider avec l'ATDA et l'INRAB avant diffusion réelle.
- Pas encore d'adaptateur SMS : les producteurs sans WhatsApp sont relayés par leur agent.
- Précision communale ; la cible « exploitation » attend des données satellitaires.
- Messages en français seulement ; les langues nationales et l'audio sont prévus.

## Vérifier

```bash
pnpm test -- src/modules/monitoring src/services/weather src/components/data-display
pnpm test:integration          # ingestion, évaluation, périmètre, levée, diffusion, règles
pnpm build && pnpm test:e2e    # parcours producteur, agent et ministère
```
