#!/bin/sh
# Appelle une route planifiée de l'application : ingest, dispatch, assistant-maintenance,
# vegetation-checks, crop-areas, crop-map, crop-accuracy, parcel-series, crop-model, survey-frame,
# fires ou fire-prevention.
# L'environnement (URL, secret) est relu depuis le fichier écrit au démarrage : crond ne
# transmet pas l'environnement du conteneur aux tâches.
set -eu
. /run/scheduler/env

task="$1"

# Tâches désactivées sur ce serveur (SCHEDULER_DISABLED, liste séparée par des espaces), par
# exemple les passes satellite coûteuses d'un serveur de démonstration : l'appel est sauté et
# le journal le dit.
case " ${SCHEDULER_DISABLED:-} " in
  *" ${task} "*)
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ${task} : désactivée (SCHEDULER_DISABLED)"
    exit 0
    ;;
esac

case "$task" in
  ingest|dispatch) path="/api/v1/monitoring/${task}" ;;
  assistant-maintenance) path="/api/v1/assistant/maintenance" ;;
  vegetation-checks) path="/api/v1/satellite/vegetation-checks" ;;
  crop-areas) path="/api/v1/satellite/crop-areas" ;;
  crop-map) path="/api/v1/satellite/crop-map" ;;
  crop-accuracy) path="/api/v1/satellite/crop-accuracy" ;;
  parcel-series) path="/api/v1/satellite/parcel-series" ;;
  crop-model) path="/api/v1/satellite/crop-model" ;;
  survey-frame) path="/api/v1/satellite/survey-frame" ;;
  fires) path="/api/v1/fires/ingest" ;;
  fire-prevention) path="/api/v1/fires/prevention" ;;
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
