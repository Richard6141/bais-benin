#!/bin/sh
# Appelle une route planifiée de l'application : ingest, dispatch, assistant-maintenance,
# vegetation-checks, crop-areas ou fires.
# L'environnement (URL, secret) est relu depuis le fichier écrit au démarrage : crond ne
# transmet pas l'environnement du conteneur aux tâches.
set -eu
. /run/scheduler/env

task="$1"
case "$task" in
  ingest|dispatch) path="/api/v1/monitoring/${task}" ;;
  assistant-maintenance) path="/api/v1/assistant/maintenance" ;;
  vegetation-checks) path="/api/v1/satellite/vegetation-checks" ;;
  crop-areas) path="/api/v1/satellite/crop-areas" ;;
  fires) path="/api/v1/fires/ingest" ;;
  *) echo "Tâche inconnue : $task" >&2; exit 2 ;;
esac

started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if curl --fail --silent --show-error \
  --retry 3 --retry-delay 20 --retry-connrefused \
  --max-time "${SCHEDULER_TIMEOUT_SECONDS:-900}" \
  -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  "${APP_INTERNAL_URL}${path}" \
  -o /tmp/last-"$task".json; then
  echo "${started} ${task} : OK $(head -c 300 /tmp/last-"$task".json)"
else
  echo "${started} ${task} : ÉCHEC" >&2
  exit 1
fi
