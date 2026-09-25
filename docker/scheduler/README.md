# Planificateur des tâches de monitoring

Trois routes de l'application sont appelées à intervalles fixes (docs/modules/monitoring-parcours-ux.md §2.E) :

| Route | Fréquence | Rôle |
|---|---|---|
| `POST /api/v1/monitoring/ingest` | chaque jour à 5 h 00, heure de Porto-Novo (4 h 00 UTC) | ingestion météo, évaluation des règles, plan des destinataires, premier envoi |
| `POST /api/v1/monitoring/dispatch` | toutes les 10 minutes | envoi des messages en attente, reprise après le silence nocturne, relances |
| `POST /api/v1/assistant/maintenance` | chaque jour à 4 h 00, heure de Porto-Novo (3 h 00 UTC) | purge des conversations de l'assistant de plus de 12 mois |

Chaque appel porte l'en-tête `Authorization: Bearer <CRON_SECRET>`. Sans secret configuré côté application, ces routes restent fermées.

## Avec Docker Compose

Le service `scheduler` fait partie du profil `full` :

```bash
# CRON_SECRET (32 caractères au moins) dans .env : openssl rand -base64 48
docker compose --profile full up -d --build
docker logs -f bais-scheduler
```

L'image (Alpine, crond de BusyBox, curl) ne contient aucun secret : `CRON_SECRET` est lu au démarrage et écrit dans un fichier lisible par root seulement, relu par chaque tâche. Le conteneur refuse de démarrer sans secret ou avec un secret trop court. Chaque appel est retenté trois fois à 20 secondes d'intervalle ; le résultat est écrit dans les journaux du conteneur.

## Sans Docker (crontab système)

Sur le serveur qui héberge l'application, dans la crontab d'un utilisateur de service (`crontab -e`). Le secret est placé dans un fichier protégé plutôt que dans la ligne de commande, pour ne pas apparaître dans la liste des processus :

```bash
sudo install -m 600 -o bais /dev/null /etc/bais/cron.env
echo 'CRON_SECRET=<le secret>' | sudo tee /etc/bais/cron.env >/dev/null
```

```cron
# Heures du système ; si le serveur est à l'heure de Porto-Novo, remplacer 4 par 5.
CRON_TZ=UTC
0 4 * * *    . /etc/bais/cron.env && curl -fsS --retry 3 --max-time 900 -X POST -H "Authorization: Bearer $CRON_SECRET" https://bais.example.bj/api/v1/monitoring/ingest   >> /var/log/bais/cron.log 2>&1
*/10 * * * * . /etc/bais/cron.env && curl -fsS --retry 3 --max-time 300 -X POST -H "Authorization: Bearer $CRON_SECRET" https://bais.example.bj/api/v1/monitoring/dispatch >> /var/log/bais/cron.log 2>&1
0 3 * * *    . /etc/bais/cron.env && curl -fsS --retry 3 --max-time 300 -X POST -H "Authorization: Bearer $CRON_SECRET" https://bais.example.bj/api/v1/assistant/maintenance >> /var/log/bais/cron.log 2>&1
```

## Sur Vercel

`vercel.json`, à la racine du dépôt, déclare les deux mêmes tâches (horaires en UTC). Vercel appelle les routes en GET et ajoute l'en-tête `Authorization: Bearer $CRON_SECRET` dès que la variable `CRON_SECRET` est définie dans le projet ; les routes acceptent GET et POST avec le même contrôle. Le plan Hobby limite les tâches planifiées à une exécution par jour : l'envoi toutes les 10 minutes demande un plan Pro, ou un planificateur externe qui appelle `dispatch`. Sur un déploiement Docker, `vercel.json` est simplement ignoré.
