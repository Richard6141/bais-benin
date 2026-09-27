# Serveur de démonstration : exploitation

Version provisoire de BAIS ouverte aux équipes du ministère et à quelques agriculteurs, sur
**https://bais.51-210-108-173.sslip.io**. Ce document dit comment elle est installée, comment elle
se met à jour et comment l'exploiter. Il ne contient aucun secret.

## 1. Le serveur et ses voisins

Le serveur `agmtec` (Ubuntu 22.04, Plesk) héberge d'autres sites : wapy.pro et sa plateforme dans
Docker, plusieurs sites Plesk, une messagerie. **Règle absolue : rien de ce qui n'appartient pas à
BAIS n'est arrêté, redémarré, supprimé ni reconfiguré.**

| Élément | BAIS | Partagé |
|---|---|---|
| Dossier | `/opt/bais` (propriétaire `ubuntu`) | |
| Conteneurs | `bais-db`, `bais-app`, `bais-scheduler` (projet compose `bais`) | |
| Réseau, volume | `bais_default`, `bais_db-data` | |
| Port | `127.0.0.1:3100` (application) ; la base n'est pas publiée | |
| Proxy | `/etc/nginx/conf.d/bais.conf` | nginx de l'hôte (Plesk) |
| Certificat | `/etc/nginx/bais/`, émis et renouvelé par acme.sh | `/root/.acme.sh` |
| Clé de déploiement | une ligne `bais-deploy-ci` dans `authorized_keys` | `/home/ubuntu/.ssh/authorized_keys` |

Limites : application 2 CPU et 2 Gio, base 2 CPU et 2 Gio, planificateur 0,25 CPU et 64 Mo ;
journaux Docker en rotation (3 × 10 Mo). Aucun changement de pare-feu : seuls 80 et 443 servent.

Toute intervention sur un élément partagé (nginx, acme.sh, `authorized_keys`, pare-feu) se fait
après sauvegarde, avec `sudo nginx -t` puis `sudo systemctl reload nginx` (jamais `restart`), en
relevant avant et après les codes HTTP des autres sites.

## 2. Fichiers de `/opt/bais`

| Fichier | Rôle | Droits |
|---|---|---|
| `compose.yml` | copie de `deploy/demo/compose.yml` | 640 |
| `.env` | variables du compose : `POSTGRES_PASSWORD`, `CRON_SECRET` | 600 |
| `app.env` | environnement de l'application (modèle : `deploy/demo/app.env.example`) | 600 |
| `deploy.sh` | copie de `deploy/demo/deploy.sh` : déploiement, retour arrière, état | 700 |
| `db/Dockerfile` | copie de `docker/db/Dockerfile` (PostGIS 16 et pgvector) | |
| `current.tag`, `previous.tag` | SHA de l'image en service et de la précédente | |
| `backups/` | sauvegardes de la base, sept gardées | 700 |
| `logs/deploy.log` | journal des déploiements | |

Réglages propres à la démonstration, dans `app.env` :
- `APP_ENV=demo` : les numéros de démonstration acceptent le code `246810`, les vrais numéros
  reçoivent un vrai code WhatsApp (wapy) ;
- `DEMO_SIGNIN_PANEL=0` : la liste des comptes de démonstration n'est pas affichée sur la page de
  connexion ; les accès sont remis en privé ;
- `SATELLITE_MONTHLY_REQUEST_BUDGET=4000` : le compte Copernicus est partagé avec l'équipe ;
- `SURVEY_MAP_READS=0` : la base de sondage ne lit pas la carte des cultures.

Le planificateur saute les passes satellite coûteuses : `SCHEDULER_DISABLED` vaut par défaut
`crop-areas crop-map crop-accuracy parcel-series survey-frame` (dans `compose.yml`). Pour en
réactiver une, retirer son nom de cette liste (ou fixer `SCHEDULER_DISABLED` dans `.env`), puis
`docker compose up -d scheduler`.

## 3. Déploiement continu

Chaque envoi sur la branche `develop` du dépôt GitHub déclenche `.github/workflows/ci.yml` :

1. lint, formatage, types, tests unitaires et build de production ; les migrations et tests d'intégration sur PostGIS et les parcours de bout en bout tournent aussi, sans bloquer le déploiement ;
2. si tout passe, construction des images `app`, `tools` et `scheduler`, étiquetées par SHA et
   publiées en privé sur `ghcr.io/richard6141/bais-benin/` (le serveur ne compile rien) ;
3. déploiement par SSH, un seul à la fois : la clé dédiée ne peut lancer que
   `/opt/bais/deploy.sh` (commande forcée, `restrict`), et le jeton GHCR éphémère du job passe par
   l'entrée standard.

`deploy.sh deploy <sha> <utilisateur>` :
1. prend le verrou (`deploy.lock`) : un second déploiement simultané est refusé ;
2. se connecte à GHCR dans `/opt/bais/.docker` (jamais la configuration Docker de l'utilisateur),
   tire les trois images, puis se déconnecte ;
3. sauvegarde la base (`backups/`) et applique les migrations avec l'image `tools` ;
4. démarre la nouvelle application et le nouveau planificateur, puis vérifie `/api/health`
   pendant 90 secondes ;
5. en cas d'échec, revient seul à l'image précédente ; sinon note le SHA et ne garde que les trois
   images les plus récentes.

Secrets GitHub Actions (noms seulement) : `BAIS_DEPLOY_HOST`, `BAIS_DEPLOY_USER`,
`BAIS_DEPLOY_KEY`, `BAIS_DEPLOY_KNOWN_HOSTS` (empreinte du serveur épinglée). Les paquets GHCR sont
privés.

## 4. Opérations courantes

Toutes depuis `ssh agmtec`, dans `/opt/bais`. Les commandes `docker compose` demandent
l'étiquette en service : `export IMAGE_TAG=$(cat current.tag)`.

**État.** `./deploy.sh status`

**Journaux.**
```bash
docker logs --tail 200 -f bais-app
docker logs --tail 100 bais-scheduler      # une ligne par tâche planifiée
tail -50 logs/deploy.log
```

**Retour arrière** (image précédente, sans défaire les migrations) : `./deploy.sh rollback`.
Les migrations de BAIS sont additives : l'image précédente fonctionne sur le schéma plus récent.
Pour revenir aussi sur les données, restaurer la sauvegarde prise avant le déploiement (plus bas).

**Redémarrer l'application** : `docker compose up -d --force-recreate app`.

**Arrêter BAIS** (le site affiche alors la page « BAIS démarre ») :
```bash
docker compose stop app scheduler     # la base reste en service
docker compose stop                   # tout BAIS, données gardées dans le volume
```
Reprise : `docker compose up -d`.

**Sauvegarde à la main.**
```bash
docker exec bais-db pg_dump -U bais -d bais -Fc > backups/bais-$(date -u +%Y%m%dT%H%M%SZ).dump
```

**Restauration** d'une sauvegarde (écrase la base) :
```bash
docker compose stop app scheduler
docker exec -i bais-db pg_restore -U bais -d bais --clean --if-exists --no-owner < backups/<fichier>.dump
docker compose up -d app scheduler
```

**Seed de démonstration** (base vide, ou après la purge ci-dessous) :
```bash
docker run --rm --network bais_default --env-file app.env \
  ghcr.io/richard6141/bais-benin/tools:$IMAGE_TAG pnpm db:seed
```

**Population du bilan alimentaire** (ADR-0035 ; sans rejouer le seed, idempotent) :
```bash
docker run --rm --network bais_default --env-file app.env \
  ghcr.io/richard6141/bais-benin/tools:$IMAGE_TAG pnpm db:reference:population
```
Charge la source WorldPop et les 77 totaux par commune. Sans elle, le bilan alimentaire affiche
« Population inconnue » partout.

**Enquête de démonstration** (ADR-0036 et ADR-0037 ; après la population, idempotent) :
```bash
docker run --rm --network bais_default --env-file app.env \
  ghcr.io/richard6141/bais-benin/tools:$IMAGE_TAG pnpm db:demo:survey
```
Refait les communes d'enquête en tirage à deux phases : 480 points de première phase par
commune, classe de la carte par la fixture, 120 points à visiter tirés par strate, puis constats
et carte de démonstration, parts vivrières calées sur la population. Une commune qui porte un vrai
constat ou une vraie lecture de la carte garde ses points. À rejouer une fois après le déploiement
de l'ADR-0037, pour passer la démonstration en tirage stratifié.

**Déploiement à la main d'images déjà présentes** (construction de secours sur le serveur, jamais
depuis la clé de la CI) : `./deploy.sh deploy-local <sha>`.

## 5. Fin de la période de test : purge des comptes réels

Les agriculteurs qui se connectent avec leur vrai numéro créent de vrais comptes, avec des données
personnelles. À la fin de la période de test, la purge remet la démonstration à neuf : base vidée,
schéma recréé, seed de démonstration. Seuls restent les comptes et données de démonstration.

Avant, compter les comptes qui ne sont pas de démonstration :
```bash
docker exec bais-db psql -U bais -d bais -tAc \
  "SELECT count(*) FROM \"user\" WHERE phone_e164 NOT LIKE '+2290190000%' OR phone_e164 IS NULL;"
```

La purge efface aussi les avis des testeurs. Les exporter d'abord depuis `/pilotage/avis`
(« Exporter en CSV », sans filtre) : l'export ne contient ni auteur, ni NPI, ni téléphone.

Purge :
```bash
./deploy.sh status                                  # noter l'étiquette en service
docker exec bais-db pg_dump -U bais -d bais -Fc > backups/avant-purge.dump   # à détruire ensuite
docker compose stop app scheduler
docker exec bais-db psql -U bais -d postgres -c "DROP DATABASE bais WITH (FORCE);" -c "CREATE DATABASE bais OWNER bais;"
docker run --rm --network bais_default --env-file app.env \
  ghcr.io/richard6141/bais-benin/tools:$IMAGE_TAG pnpm exec prisma migrate deploy
docker run --rm --network bais_default --env-file app.env \
  ghcr.io/richard6141/bais-benin/tools:$IMAGE_TAG pnpm db:seed
docker compose up -d app scheduler
shred -u backups/avant-purge.dump                   # la sauvegarde contient les données réelles
```
Les sauvegardes automatiques de `backups/` contiennent aussi ces données : les supprimer de la même
façon une fois la purge vérifiée.

## 6. Certificat et proxy

Le certificat est renouvelé par la tâche cron d'acme.sh déjà présente sur le serveur (quatre fois
par jour, renouvellement automatique avant l'échéance), qui recharge nginx. Vérifier :
```bash
sudo /root/.acme.sh/acme.sh --home /root/.acme.sh --list | grep bais
sudo openssl x509 -in /etc/nginx/bais/bais.crt -noout -enddate
```

Le fichier `/etc/nginx/conf.d/bais.conf` est une copie de `deploy/demo/nginx/bais.conf`. Il ne
revendique que le nom de BAIS ; `00-refus-domaines-inconnus.conf` continue de refuser les noms
inconnus. Pour le modifier : sauvegarde, copie, `sudo nginx -t`, `sudo systemctl reload nginx`,
codes HTTP des autres sites relevés avant et après.

## 7. Retirer BAIS du serveur

Dans cet ordre, sans toucher à rien d'autre :
```bash
cd /opt/bais && IMAGE_TAG=$(cat current.tag) docker compose down --volumes   # données supprimées
sudo rm /etc/nginx/conf.d/bais.conf && sudo nginx -t && sudo systemctl reload nginx
sudo /root/.acme.sh/acme.sh --home /root/.acme.sh --remove -d bais.51-210-108-173.sslip.io --ecc
sudo rm -rf /etc/nginx/bais /var/www/bais-acme
sed -i '/bais-deploy-ci$/d' /home/ubuntu/.ssh/authorized_keys
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^(ghcr.io/richard6141/bais-benin/|bais-db:)' | xargs -r docker image rm
sudo rm -rf /opt/bais
```
Puis supprimer les secrets `BAIS_DEPLOY_*` du dépôt GitHub et les paquets GHCR.
