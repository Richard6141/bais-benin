#!/bin/sh
# Démarrage du planificateur : vérifie la configuration, écrit l'environnement des tâches dans
# un fichier lisible par root seulement, installe la table cron et lance crond au premier plan.
set -eu

: "${CRON_SECRET:?CRON_SECRET est obligatoire (32 caractères au moins)}"
: "${APP_INTERNAL_URL:=http://app:3000}"

if [ "${#CRON_SECRET}" -lt 32 ]; then
  echo "CRON_SECRET doit faire au moins 32 caractères" >&2
  exit 1
fi

mkdir -p /run/scheduler
umask 077
{
  printf "CRON_SECRET='%s'\n" "$CRON_SECRET"
  printf "APP_INTERNAL_URL='%s'\n" "$APP_INTERNAL_URL"
  printf "SCHEDULER_TIMEOUT_SECONDS='%s'\n" "${SCHEDULER_TIMEOUT_SECONDS:-900}"
  printf "SCHEDULER_DISABLED='%s'\n" "${SCHEDULER_DISABLED:-}"
} > /run/scheduler/env

cp /etc/crontabs/root.template /etc/crontabs/root
echo "Planificateur prêt : ingestion à 04:00 UTC, envoi toutes les 10 minutes vers ${APP_INTERNAL_URL}"
if [ -n "${SCHEDULER_DISABLED:-}" ]; then
  echo "Tâches désactivées : ${SCHEDULER_DISABLED}"
fi
exec crond -f -l 6 -L /dev/stdout
